"""
Transcribing with Mistral's Voxtral.

Kept separate from the Whisper runners because Voxtral is an audio-conditioned
language model rather than an encoder-decoder transcriber: it takes a
conversation turn containing audio and answers it, which means it has its own
request shape and its own failure modes.

Worth testing here for one specific reason — published Hindi figures put it at
7.8% WER against Whisper large-v3's 11.4% on Common Voice, and Hindi is exactly
where the Whisper models fall apart on this audio. Apache 2.0, so nothing about
the licence constrains how it could be deployed.
"""

import json
import sys
import time
from pathlib import Path

import torch
from transformers import AutoProcessor, VoxtralForConditionalGeneration

MODEL = sys.argv[1]
TAG = sys.argv[2]
LANG = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] != "auto" else None
AUDIO_DIR = Path(sys.argv[4] if len(sys.argv) > 4 else "/workspace/eval/audio2")

OUT = Path("/workspace/eval/out2") / TAG
OUT.mkdir(parents=True, exist_ok=True)

manifest = json.loads((AUDIO_DIR / "manifest.json").read_text())
targets = manifest["recordings"]

print(f"loading {MODEL} …", flush=True)
loaded_at = time.time()
processor = AutoProcessor.from_pretrained(MODEL)
model = VoxtralForConditionalGeneration.from_pretrained(
    MODEL, dtype=torch.bfloat16, device_map="cuda"
)
print(f"loaded in {time.time() - loaded_at:.1f}s", flush=True)

for record in targets:
    path = AUDIO_DIR / record["file"]
    started = time.time()
    inputs = processor.apply_transcription_request(
        language=LANG or "en", audio=str(path), model_id=MODEL
    )
    inputs = inputs.to("cuda", dtype=torch.bfloat16)
    # Long enough for a four-minute conversation; Voxtral stops on its own.
    generated = model.generate(**inputs, max_new_tokens=2048)
    text = processor.batch_decode(
        generated[:, inputs.input_ids.shape[1] :], skip_special_tokens=True
    )[0].strip()

    elapsed = time.time() - started
    audio_seconds = record["durationMs"] / 1000
    payload = {
        "model": MODEL,
        "tag": TAG,
        "file": record["file"],
        "title": record["title"],
        "forcedLanguage": LANG,
        "audioSeconds": round(audio_seconds, 1),
        "wallSeconds": round(elapsed, 1),
        "realtimeFactor": round(audio_seconds / elapsed, 1),
        "segments": [],
        "text": text,
    }
    (OUT / f"{record['file']}.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1))
    print(
        f"  {record['title']:<10} {audio_seconds/60:.1f}min  {elapsed:.1f}s  "
        f"{audio_seconds/elapsed:.1f}x realtime  {len(text)} chars",
        flush=True,
    )

print(f"done -> {OUT}", flush=True)
