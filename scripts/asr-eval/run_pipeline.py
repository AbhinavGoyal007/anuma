"""
Running the transcription pipeline over a set of recordings, with or without
speech gating, and recording what each cost.

Two questions are being answered at once. Whether gating on Silero before
diarizing changes the facts that survive — it can only lose them, so the test is
whether it loses any. And whether it saves enough GPU time to matter.

Usage:
  python run_pipeline.py <audio_dir> <tag> <full|gated> [manifest.json]
"""

import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import soundfile
import torch
from pyannote.audio import Pipeline as DiarizationPipeline
from silero_vad import load_silero_vad
from transformers import AutoProcessor, VoxtralForConditionalGeneration

sys.path.insert(0, "/workspace/eval")
from pipeline import (  # noqa: E402
    concatenate,
    find_speech,
    speech_seconds,
    as_model_audio,
    to_original_time,
)

AUDIO_DIR = Path(sys.argv[1])
TAG = sys.argv[2]
MODE = sys.argv[3] if len(sys.argv) > 3 else "full"
MANIFEST = sys.argv[4] if len(sys.argv) > 4 else None

RATE = 16_000
VOXTRAL = "mistralai/Voxtral-Mini-3B-2507"
MIN_TURN = 0.4
MERGE_GAP = float(os.environ.get("MERGE_GAP", "0.8"))

OUT = Path("/workspace/eval/out") / TAG
OUT.mkdir(parents=True, exist_ok=True)

print(f"loading models for {TAG} ({MODE}) …", flush=True)
processor = AutoProcessor.from_pretrained(VOXTRAL)
voxtral = VoxtralForConditionalGeneration.from_pretrained(
    VOXTRAL, dtype=torch.bfloat16, device_map="cuda"
)
diarizer = DiarizationPipeline.from_pretrained(
    "pyannote/speaker-diarization-3.1", token=os.environ["HF_TOKEN"]
)
diarizer.to(torch.device("cuda"))
vad = load_silero_vad()
print("ready", flush=True)


def annotation_of(result):
    if hasattr(result, "itertracks"):
        return result
    for attribute in ("speaker_diarization", "diarization", "annotation"):
        candidate = getattr(result, attribute, None)
        if candidate is not None and hasattr(candidate, "itertracks"):
            return candidate
    raise SystemExit(f"no annotation on {type(result).__name__}")


titles = {}
if MANIFEST:
    for r in json.loads(Path(MANIFEST).read_text())["recordings"]:
        titles[r["file"]] = r["title"]

rows = []
for path in sorted(AUDIO_DIR.glob("*.wav")):
    samples, rate = soundfile.read(str(path), dtype="float32", always_2d=True)
    samples = samples.mean(axis=1)
    audio_seconds = len(samples) / rate
    started = time.time()

    # --- speech gating -------------------------------------------------------
    offsets = []
    if MODE == "gated":
        regions = find_speech(samples, rate, vad)
        if not regions:
            print(f"  {path.name:<22} no speech found — skipped", flush=True)
            continue
        working, offsets = concatenate(samples, rate, regions)
        gated_seconds = speech_seconds(regions)
    else:
        working = samples
        gated_seconds = audio_seconds
    vad_seconds = time.time() - started

    # --- diarization ---------------------------------------------------------
    diar_started = time.time()
    annotation = annotation_of(
        diarizer({"waveform": torch.from_numpy(working).unsqueeze(0), "sample_rate": rate})
    )
    raw = sorted(
        (
            {"start": round(s.start, 3), "end": round(s.end, 3), "speaker": label}
            for s, _, label in annotation.itertracks(yield_label=True)
        ),
        key=lambda t: t["start"],
    )
    merged = []
    for turn in raw:
        if merged and merged[-1]["speaker"] == turn["speaker"] and turn["start"] - merged[-1]["end"] <= MERGE_GAP:
            merged[-1]["end"] = turn["end"]
        else:
            merged.append(dict(turn))
    diar_seconds = time.time() - diar_started

    # --- transcription -------------------------------------------------------
    asr_started = time.time()
    entries = []
    for turn in merged:
        if turn["end"] - turn["start"] < MIN_TURN:
            continue
        clip = working[int(turn["start"] * rate) : int(turn["end"] * rate)]
        if clip.size == 0:
            continue
        inputs = processor.apply_transcription_request(
            language="en", audio=as_model_audio(clip), format=["wav"], model_id=VOXTRAL
        ).to("cuda", dtype=torch.bfloat16)
        with torch.inference_mode():
            generated = voxtral.generate(**inputs, max_new_tokens=512)
        text = processor.batch_decode(
            generated[:, inputs.input_ids.shape[1] :], skip_special_tokens=True
        )[0].strip()
        if not text:
            continue
        # Times always refer to the original recording, never to the gated stream.
        start = to_original_time(turn["start"], offsets) if offsets else turn["start"]
        end = to_original_time(turn["end"], offsets) if offsets else turn["end"]
        entries.append(
            {
                "transcript": text,
                "start_time_seconds": round(start, 3),
                "end_time_seconds": round(end, 3),
                "speaker_id": turn["speaker"],
            }
        )
    asr_seconds = time.time() - asr_started
    wall = time.time() - started

    payload = {
        "tag": TAG,
        "mode": MODE,
        "file": path.name,
        "title": titles.get(path.name, path.stem),
        "audioSeconds": round(audio_seconds, 1),
        "speechSeconds": round(gated_seconds, 1),
        "wallSeconds": round(wall, 1),
        "realtimeFactor": round(audio_seconds / wall, 2),
        "vadSeconds": round(vad_seconds, 2),
        "diarizationSeconds": round(diar_seconds, 2),
        "asrSeconds": round(asr_seconds, 2),
        "turnCount": len(entries),
        "speakerCount": len({e["speaker_id"] for e in entries}),
        "segments": [],
        "text": " ".join(e["transcript"] for e in entries),
        "diarized_transcript": {"entries": entries},
    }
    (OUT / f"{path.name}.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1))
    rows.append(payload)
    print(
        f"  {payload['title']:<12} {audio_seconds/60:.1f}min "
        f"speech={gated_seconds/audio_seconds*100:.0f}% "
        f"{wall:.0f}s ({audio_seconds/wall:.1f}x)  "
        f"vad={vad_seconds:.1f} diar={diar_seconds:.0f} asr={asr_seconds:.0f}  "
        f"{len(entries)} turns",
        flush=True,
    )

if rows:
    audio = sum(r["audioSeconds"] for r in rows)
    wall = sum(r["wallSeconds"] for r in rows)
    print(
        f"\n{TAG} ({MODE}): {audio/60:.1f} min audio in {wall:.0f}s = {audio/wall:.1f}x realtime"
        f"  |  diar {sum(r['diarizationSeconds'] for r in rows):.0f}s"
        f"  asr {sum(r['asrSeconds'] for r in rows):.0f}s",
        flush=True,
    )
