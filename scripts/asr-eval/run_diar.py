"""
Diarizing the evaluation set with pyannote.

Speaker separation is scored apart from the words because the two fail
independently: a transcript can be perfect and still be useless if it cannot say
which half of it the customer spoke. The product's rule that provider speaker 0
must never be assumed to be the representative is the same problem seen from the
other side.

What is recorded is the turn structure — how many speakers were found, and the
timeline — so it can be compared against the confirmed human speaker mapping
already stored for these conversations.
"""

import json
import os
import sys
import time
from pathlib import Path

import soundfile
import torch
from pyannote.audio import Pipeline

AUDIO = Path("/workspace/eval/audio")
OUT = Path("/workspace/eval/out") / "pyannote-3.1"
OUT.mkdir(parents=True, exist_ok=True)

manifest = json.loads((AUDIO / "manifest.json").read_text())
targets = [r for r in manifest["recordings"] if (r["title"] or "").startswith("Script")]

print("loading pyannote/speaker-diarization-3.1 …", flush=True)
loaded_at = time.time()
pipeline = Pipeline.from_pretrained(
    "pyannote/speaker-diarization-3.1", token=os.environ["HF_TOKEN"]
)
pipeline.to(torch.device("cuda"))
print(f"loaded in {time.time() - loaded_at:.1f}s", flush=True)

for record in targets:
    started = time.time()
    # Handed in as a waveform rather than a path: pyannote decodes files through
    # torchcodec, which on this image links against a CUDA runtime the driver
    # does not have. The files are already 16 kHz mono, so this is a straight
    # read with no resampling.
    samples, sample_rate = soundfile.read(str(AUDIO / record["file"]), dtype="float32")
    waveform = torch.from_numpy(samples).unsqueeze(0)  # (channel, time)

    # Both scripts have two participants except Script 3, which is not in this
    # set; the count is left free so the model's own answer can be judged.
    diarization = pipeline({"waveform": waveform, "sample_rate": sample_rate})
    elapsed = time.time() - started
    audio_seconds = record["durationMs"] / 1000

    # pyannote 4 wraps the annotation in a result object; 3.x returned it
    # directly. Unwrapped by looking for the timeline rather than by version,
    # so this keeps working across either.
    annotation = diarization
    if not hasattr(annotation, "itertracks"):
        for attribute in ("speaker_diarization", "diarization", "annotation", "prediction"):
            candidate = getattr(diarization, attribute, None)
            if candidate is not None and hasattr(candidate, "itertracks"):
                annotation = candidate
                break
        else:
            raise SystemExit(
                f"no annotation on {type(diarization).__name__}: "
                f"{[a for a in dir(diarization) if not a.startswith('_')]}"
            )

    turns = [
        {"start": round(seg.start, 2), "end": round(seg.end, 2), "speaker": label}
        for seg, _, label in annotation.itertracks(yield_label=True)
    ]
    speakers = sorted({t["speaker"] for t in turns})
    talk = {s: round(sum(t["end"] - t["start"] for t in turns if t["speaker"] == s), 1) for s in speakers}

    payload = {
        "model": "pyannote/speaker-diarization-3.1",
        "file": record["file"],
        "title": record["title"],
        "audioSeconds": round(audio_seconds, 1),
        "wallSeconds": round(elapsed, 1),
        "realtimeFactor": round(audio_seconds / elapsed, 1),
        "speakerCount": len(speakers),
        "talkSeconds": talk,
        "turns": turns,
    }
    (OUT / f"{record['file']}.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1))
    print(
        f"  {record['title']:<9} {len(speakers)} speakers  {len(turns):>3} turns  "
        f"{elapsed:.1f}s  {audio_seconds/elapsed:.1f}x  talk={talk}",
        flush=True,
    )

print(f"done -> {OUT}", flush=True)
