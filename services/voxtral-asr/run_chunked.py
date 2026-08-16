"""Transcribing a long recording without letting the model run away.

A 7.7 minute store recording put through Voxtral in one call came back as
"Washer. Washer. Washer." for most of its length — the model found a loop and
stayed in it. Every script this was tested on before ran three to five minutes,
so the failure never appeared, and it is not subtle when it does: word-level
alignment against the timing pass fell to 3%, speaker attribution dropped to
proportional guessing, and the transcript was unusable.

Audio is cut into windows and each is transcribed on its own. A window that
degenerates is then one window, not the whole conversation, and the loop cannot
propagate past its own boundary.

Cuts land in silence rather than on a stopwatch, because a cut through the middle
of a word damages both sides of it. The quietest moment near the target length is
chosen from the audio's own energy.

Usage:
  python run_chunked.py <audio-dir> <tag>
"""

import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import soundfile
import torch
from transformers import AutoProcessor, VoxtralForConditionalGeneration
from faster_whisper import WhisperModel
from pyannote.audio import Pipeline

sys.path.insert(0, str(Path(__file__).parent))
from align import (  # noqa: E402
    TimedWord,
    Turn,
    align_words,
    distribute_across_turns,
    match_rate,
    merge_short_interjections,
    segment_by_speaker,
)

AUDIO_DIR = Path(sys.argv[1])
TAG = sys.argv[2]
OUT = Path("/workspace/eval/out") / TAG
OUT.mkdir(parents=True, exist_ok=True)

VOXTRAL = os.environ.get("VOXTRAL_MODEL", "mistralai/Voxtral-Mini-3B-2507")
TOKEN = os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_TOKEN")

# Long enough to carry context through a sentence, short enough that the model
# does not wander. The scripts that worked were around this length.
TARGET_SECONDS = 150
# How far either side of the target a quieter cut is worth taking.
SEARCH_SECONDS = 20


def cut_points(samples: np.ndarray, rate: int) -> list[tuple[int, int]]:
    """Window boundaries, each placed at the quietest point near its target."""
    target = TARGET_SECONDS * rate
    search = SEARCH_SECONDS * rate
    if len(samples) <= target + search:
        return [(0, len(samples))]

    # Energy over 20ms frames, which is fine enough to find a gap between words.
    frame = max(1, rate // 50)
    frames = len(samples) // frame
    energy = np.abs(samples[: frames * frame].reshape(frames, frame)).mean(axis=1)

    bounds = [0]
    while bounds[-1] + target + search < len(samples):
        centre = bounds[-1] + target
        low = max(bounds[-1] + rate, centre - search) // frame
        high = min(len(samples) - rate, centre + search) // frame
        if high <= low:
            bounds.append(min(centre, len(samples)))
            continue
        bounds.append(int((low + int(np.argmin(energy[low:high]))) * frame))
    bounds.append(len(samples))
    return list(zip(bounds[:-1], bounds[1:]))


print(f"loading models for {TAG} …", flush=True)
processor = AutoProcessor.from_pretrained(VOXTRAL, token=TOKEN)
voxtral = VoxtralForConditionalGeneration.from_pretrained(
    VOXTRAL, dtype=torch.bfloat16, device_map="cuda", token=TOKEN
)
timer = WhisperModel("large-v3-turbo", device="cuda", compute_type="float16")
diarizer = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1", token=TOKEN)
diarizer.to(torch.device("cuda"))


def annotation_of(result):
    if hasattr(result, "itertracks"):
        return result
    for attribute in ("speaker_diarization", "diarization", "annotation"):
        candidate = getattr(result, attribute, None)
        if candidate is not None and hasattr(candidate, "itertracks"):
            return candidate
    raise SystemExit(f"no annotation on {type(result).__name__}")


for path in sorted(AUDIO_DIR.glob("*.wav")):
    samples, rate = soundfile.read(str(path), dtype="float32", always_2d=True)
    samples = samples.mean(axis=1)
    audio_seconds = len(samples) / rate
    started = time.time()

    windows = cut_points(samples, rate)
    pieces = []
    for index, (begin, end) in enumerate(windows):
        chunk = np.ascontiguousarray(samples[begin:end])
        inputs = processor.apply_transcription_request(
            language="en", audio=chunk, format=["wav"], model_id=VOXTRAL
        ).to("cuda", dtype=torch.bfloat16)
        with torch.inference_mode():
            generated = voxtral.generate(
                **inputs,
                max_new_tokens=1024,
                # A loop is the failure being guarded against; refusing to repeat
                # a four-word run breaks it without touching ordinary speech,
                # where exact four-word repeats are vanishingly rare.
                no_repeat_ngram_size=4,
                repetition_penalty=1.15,
            )
        text = processor.batch_decode(
            generated[:, inputs.input_ids.shape[1] :], skip_special_tokens=True
        )[0].strip()
        pieces.append(text)
        print(
            f"  window {index + 1}/{len(windows)} "
            f"{begin / rate:.0f}-{end / rate:.0f}s -> {len(text.split())} words",
            flush=True,
        )

    text = " ".join(piece for piece in pieces if piece)
    asr_seconds = time.time() - started

    segments, _ = timer.transcribe(
        str(path), language="en", beam_size=1, word_timestamps=True, vad_filter=True
    )
    timed = [
        TimedWord(word=w.word.strip(), start=w.start, end=w.end)
        for segment in segments
        for w in (segment.words or [])
        if w.word.strip()
    ]

    annotation = annotation_of(
        diarizer({"waveform": torch.from_numpy(samples).unsqueeze(0), "sample_rate": rate})
    )
    turns = sorted(
        (
            Turn(start=round(s.start, 3), end=round(s.end, 3), speaker=label)
            for s, _, label in annotation.itertracks(yield_label=True)
        ),
        key=lambda t: t.start,
    )

    reference = text.split()
    rate_matched = match_rate(reference, timed)
    if rate_matched >= 0.33:
        words = align_words(reference, timed)
        speaker_segments = merge_short_interjections(segment_by_speaker(words, turns))
        attribution = "aligned"
    else:
        speaker_segments = distribute_across_turns(reference, turns)
        attribution = "proportional"

    wall = time.time() - started
    payload = {
        "tag": TAG,
        "mode": "chunked",
        "file": path.name,
        "audioSeconds": round(audio_seconds, 1),
        "wallSeconds": round(wall, 1),
        "realtimeFactor": round(audio_seconds / wall, 2),
        "asrSeconds": round(asr_seconds, 1),
        "windows": len(windows),
        "wordCount": len(reference),
        "matchRate": round(rate_matched, 3),
        "attribution": attribution,
        "turnCount": len(turns),
        "speakerCount": len({turn.speaker for turn in turns}),
        "text": text,
        "diarized_transcript": {
            "entries": [
                {
                    "transcript": segment.text,
                    "start_time_seconds": segment.start,
                    "end_time_seconds": segment.end,
                    "speaker_id": segment.speaker,
                }
                for segment in speaker_segments
            ]
        },
    }
    (OUT / f"{path.name}.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1))
    print(
        f"  {path.stem:11s} {audio_seconds / 60:.1f}min {wall:.0f}s "
        f"({audio_seconds / wall:.1f}x) {len(windows)} windows "
        f"{len(reference)}w match={rate_matched:.0%} ({attribution}) "
        f"-> {len(speaker_segments)} seg",
        flush=True,
    )
