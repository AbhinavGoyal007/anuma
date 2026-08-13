"""
Transcription that answers the same question Sarvam's batch API does.

Voxtral is the most accurate model measured against ANUMA's own test pack — it
matched Sarvam on 84 spoken facts across thirteen scripts at roughly a twentieth
of the cost — but it returns prose. No timestamps, no speaker labels, nothing
that could anchor a claim to a moment in a recording.

The product cannot use prose. Every semantic claim it makes has to cite a
transcript segment with a speaker and a time range, and the whole evidence path
from a dashboard figure back to what was actually said runs through that. So
this service reconstructs what the product needs:

    pyannote finds who spoke when  ->  each turn is cut out of the audio
                                   ->  Voxtral transcribes that turn alone
                                   ->  a segment with speaker, times and text

Speaker labels are deliberately left as the model emitted them — SPEAKER_00,
SPEAKER_01 — and never guessed into "representative" and "customer". The
application has a speaker-mapping step for that, built on the rule that the
provider's first speaker must never be assumed to be the representative.

Runs behind either an always-on pod or RunPod Serverless; the application only
ever sees an HTTPS endpoint.
"""

from __future__ import annotations

import base64
import io
import logging
import os
import time
from dataclasses import dataclass, field

import numpy as np
import soundfile
import torch
from pyannote.audio import Pipeline
from transformers import AutoProcessor, VoxtralForConditionalGeneration

LOG = logging.getLogger("voxtral-asr")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

VOXTRAL_MODEL = os.environ.get("VOXTRAL_MODEL", "mistralai/Voxtral-Mini-3B-2507")
DIARIZATION_MODEL = os.environ.get("DIARIZATION_MODEL", "pyannote/speaker-diarization-3.1")
HF_TOKEN = os.environ.get("HF_TOKEN")

# Whisper and Voxtral both expect 16 kHz mono; the application already uploads
# audio it has normalised, but a stray sample rate should not be a failure.
TARGET_SAMPLE_RATE = 16_000

# Turns shorter than this are nearly always a backchannel — "haan", "okay" —
# and transcribing each one costs a full model call for almost no information.
# They are kept as segments so the timeline stays honest, with empty text.
MIN_TURN_SECONDS = float(os.environ.get("MIN_TURN_SECONDS", "0.4"))

# Neighbouring turns from the same speaker are merged before transcription.
# Diarization fragments a single sentence across pauses, and a model given half
# a clause writes a worse sentence than one given the whole thing.
MERGE_GAP_SECONDS = float(os.environ.get("MERGE_GAP_SECONDS", "0.8"))


@dataclass
class Turn:
    start: float
    end: float
    speaker: str
    text: str = ""

    @property
    def duration(self) -> float:
        return self.end - self.start


@dataclass
class Models:
    """Loaded once per worker. Loading Voxtral takes about forty seconds."""

    processor: AutoProcessor | None = None
    voxtral: VoxtralForConditionalGeneration | None = None
    diarizer: Pipeline | None = None
    loaded_at: float | None = None
    _lock: object = field(default=None, repr=False)


MODELS = Models()


def load_models() -> Models:
    if MODELS.voxtral is not None:
        return MODELS
    started = time.time()
    LOG.info("loading %s", VOXTRAL_MODEL)
    MODELS.processor = AutoProcessor.from_pretrained(VOXTRAL_MODEL)
    MODELS.voxtral = VoxtralForConditionalGeneration.from_pretrained(
        VOXTRAL_MODEL, dtype=torch.bfloat16, device_map="cuda"
    )
    LOG.info("loading %s", DIARIZATION_MODEL)
    MODELS.diarizer = Pipeline.from_pretrained(DIARIZATION_MODEL, token=HF_TOKEN)
    MODELS.diarizer.to(torch.device("cuda"))
    MODELS.loaded_at = time.time()
    LOG.info("models ready in %.1fs", MODELS.loaded_at - started)
    return MODELS


def read_audio(raw: bytes) -> tuple[np.ndarray, int]:
    """Mono float32 at the rate the models want."""
    samples, rate = soundfile.read(io.BytesIO(raw), dtype="float32", always_2d=True)
    samples = samples.mean(axis=1)
    if rate != TARGET_SAMPLE_RATE:
        # Linear resampling is enough: the application uploads 16 kHz already,
        # and anything else here is a fallback rather than a supported path.
        target_length = int(len(samples) * TARGET_SAMPLE_RATE / rate)
        samples = np.interp(
            np.linspace(0, len(samples), target_length, endpoint=False),
            np.arange(len(samples)),
            samples,
        ).astype(np.float32)
        rate = TARGET_SAMPLE_RATE
    return samples, rate


def diarize(samples: np.ndarray, rate: int) -> list[Turn]:
    """Who spoke when, merged into turns worth transcribing."""
    models = load_models()
    waveform = torch.from_numpy(samples).unsqueeze(0)
    # Handed in as a waveform rather than a path: pyannote decodes files through
    # torchcodec, which links against a CUDA runtime this image may not carry.
    result = models.diarizer({"waveform": waveform, "sample_rate": rate})

    annotation = result
    if not hasattr(annotation, "itertracks"):
        for attribute in ("speaker_diarization", "diarization", "annotation"):
            candidate = getattr(result, attribute, None)
            if candidate is not None and hasattr(candidate, "itertracks"):
                annotation = candidate
                break

    raw = [
        Turn(start=round(segment.start, 3), end=round(segment.end, 3), speaker=label)
        for segment, _, label in annotation.itertracks(yield_label=True)
    ]
    raw.sort(key=lambda t: t.start)

    merged: list[Turn] = []
    for turn in raw:
        previous = merged[-1] if merged else None
        if (
            previous
            and previous.speaker == turn.speaker
            and turn.start - previous.end <= MERGE_GAP_SECONDS
        ):
            previous.end = turn.end
        else:
            merged.append(turn)
    return merged


def transcribe_turn(samples: np.ndarray, rate: int, turn: Turn, language: str) -> str:
    """What was said in one speaker's turn."""
    models = load_models()
    clip = samples[int(turn.start * rate) : int(turn.end * rate)]
    if clip.size == 0:
        return ""

    buffer = io.BytesIO()
    soundfile.write(buffer, clip, rate, format="WAV", subtype="PCM_16")
    buffer.seek(0)

    inputs = models.processor.apply_transcription_request(
        language=language, audio=buffer, model_id=VOXTRAL_MODEL
    )
    inputs = inputs.to("cuda", dtype=torch.bfloat16)
    with torch.inference_mode():
        generated = models.voxtral.generate(**inputs, max_new_tokens=512)
    text = models.processor.batch_decode(
        generated[:, inputs.input_ids.shape[1] :], skip_special_tokens=True
    )[0]
    return text.strip()


def transcribe(raw_audio: bytes, language: str = "en") -> dict:
    """
    The whole job: diarize, then transcribe each turn.

    The response deliberately mirrors what `normalize-sarvam.ts` already
    consumes — a list of entries carrying a speaker, a time range and text — so
    the application's contract does not change with the provider.
    """
    started = time.time()
    samples, rate = read_audio(raw_audio)
    audio_seconds = len(samples) / rate

    diarized_at = time.time()
    turns = diarize(samples, rate)
    diarization_seconds = time.time() - diarized_at

    spoken = 0
    for turn in turns:
        if turn.duration < MIN_TURN_SECONDS:
            continue
        turn.text = transcribe_turn(samples, rate, turn, language)
        spoken += 1

    entries = [
        {
            "transcript": turn.text,
            "start_time_seconds": turn.start,
            "end_time_seconds": turn.end,
            "speaker_id": turn.speaker,
        }
        for turn in turns
        if turn.text
    ]

    elapsed = time.time() - started
    LOG.info(
        "%.1fs audio -> %d turns (%d transcribed) in %.1fs (%.1fx realtime, diarization %.1fs)",
        audio_seconds,
        len(turns),
        spoken,
        elapsed,
        audio_seconds / elapsed if elapsed else 0,
        diarization_seconds,
    )

    return {
        "language_code": language,
        "diarized_transcript": {"entries": entries},
        "metadata": {
            "voxtralModel": VOXTRAL_MODEL,
            "diarizationModel": DIARIZATION_MODEL,
            "audioSeconds": round(audio_seconds, 2),
            "wallSeconds": round(elapsed, 2),
            "realtimeFactor": round(audio_seconds / elapsed, 2) if elapsed else 0,
            "diarizationSeconds": round(diarization_seconds, 2),
            "turnCount": len(turns),
            "speakerCount": len({t.speaker for t in turns}),
        },
    }


def handler(event: dict) -> dict:
    """
    RunPod Serverless entry point.

    Audio arrives base64-encoded in the job input because a serverless request is
    JSON. The application sends the bytes it already holds; nothing is written to
    disk on either side.
    """
    payload = event.get("input") or {}
    encoded = payload.get("audio_base64")
    if not encoded:
        return {"error": "audio_base64 is required"}
    try:
        return transcribe(base64.b64decode(encoded), payload.get("language", "en"))
    except Exception as error:  # noqa: BLE001 - the worker must answer, not die
        LOG.exception("transcription failed")
        return {"error": str(error)}


if __name__ == "__main__":
    # An always-on pod serves the same function over HTTP. Serverless imports
    # `handler` instead and never reaches this.
    from fastapi import FastAPI, HTTPException, Request
    import uvicorn

    app = FastAPI(title="ANUMA Voxtral ASR")

    @app.on_event("startup")
    def warm() -> None:
        load_models()

    @app.get("/health")
    def health() -> dict:
        return {"ready": MODELS.voxtral is not None, "model": VOXTRAL_MODEL}

    @app.post("/transcribe")
    async def http_transcribe(request: Request) -> dict:
        body = await request.body()
        if not body:
            raise HTTPException(status_code=400, detail="audio body is required")
        language = request.query_params.get("language", "en")
        try:
            return transcribe(body, language)
        except Exception as error:  # noqa: BLE001
            LOG.exception("transcription failed")
            raise HTTPException(status_code=500, detail=str(error)) from error

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
