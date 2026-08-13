"""
Transcribing the evaluation set with a faster-whisper model.

Writes one JSON per file per model so a later comparison can read them without
re-running anything: transcription is the expensive part and the scoring will be
iterated on many times.

Wall-clock time per file is recorded because the cost question is "rupees per
audio-hour", and that is a measurement, not a spec-sheet figure.
"""

import json
import os
import sys
import time
from pathlib import Path

from faster_whisper import WhisperModel

MODEL = sys.argv[1] if len(sys.argv) > 1 else "large-v3"
TAG = sys.argv[2] if len(sys.argv) > 2 else MODEL
LANG = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] != "auto" else None

AUDIO = Path("/workspace/eval/audio")
OUT = Path("/workspace/eval/out") / TAG
OUT.mkdir(parents=True, exist_ok=True)

manifest = json.loads((AUDIO / "manifest.json").read_text())
# Only the scripted recordings have gold truth to score against.
targets = [r for r in manifest["recordings"] if (r["title"] or "").startswith("Script")]


print(f"loading {MODEL} …", flush=True)
loaded_at = time.time()
model = WhisperModel(MODEL, device="cuda", compute_type="float16")
print(f"loaded in {time.time() - loaded_at:.1f}s", flush=True)

for record in targets:
    path = AUDIO / record["file"]
    started = time.time()
    segments, info = model.transcribe(
        str(path),
        beam_size=5,
        vad_filter=True,
        word_timestamps=True,
        # Forcing English is how Whisper is made to romanise Hinglish instead of
        # transliterating it into Devanagari, which is what breaks spec matching.
        language=LANG,
        condition_on_previous_text=False,
    )
    collected = [
        {
            "start": round(s.start, 2),
            "end": round(s.end, 2),
            "text": s.text.strip(),
        }
        for s in segments
    ]
    elapsed = time.time() - started
    audio_seconds = record["durationMs"] / 1000

    payload = {
        "model": MODEL,
        "tag": TAG,
        "file": record["file"],
        "title": record["title"],
        "forcedLanguage": LANG,
        "detectedLanguage": info.language,
        "languageProbability": round(info.language_probability, 3),
        "audioSeconds": round(audio_seconds, 1),
        "wallSeconds": round(elapsed, 1),
        "realtimeFactor": round(audio_seconds / elapsed, 1),
        "segments": collected,
        "text": " ".join(s["text"] for s in collected),
    }
    (OUT / f"{record['file']}.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1))
    print(
        f"  {record['title']:<9} {audio_seconds/60:.1f}min  "
        f"lang={info.language}({info.language_probability:.2f})  "
        f"{elapsed:.1f}s  {audio_seconds/elapsed:.1f}x realtime",
        flush=True,
    )

print(f"done -> {OUT}", flush=True)
