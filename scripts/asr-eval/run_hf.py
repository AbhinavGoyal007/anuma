"""
Transcribing the evaluation set with a HuggingFace Whisper checkpoint.

Separate from the faster-whisper runner because these are fine-tuned models
published in transformers format rather than CTranslate2, and converting them
first would add a step that could itself change the output.

Long-form audio is handled by the pipeline's chunking. Timestamps come back per
chunk rather than per word, which is enough for what is being measured here.
"""

import json
import sys
import time
from pathlib import Path

import soundfile
import torch
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline

MODEL = sys.argv[1]
TAG = sys.argv[2]
LANG = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] != "auto" else None

AUDIO = Path("/workspace/eval/audio")
OUT = Path("/workspace/eval/out") / TAG
OUT.mkdir(parents=True, exist_ok=True)

manifest = json.loads((AUDIO / "manifest.json").read_text())
targets = [r for r in manifest["recordings"] if (r["title"] or "").startswith("Script")]

print(f"loading {MODEL} …", flush=True)
loaded_at = time.time()
model = AutoModelForSpeechSeq2Seq.from_pretrained(
    MODEL, torch_dtype=torch.float16, low_cpu_mem_usage=True
).to("cuda")
processor = AutoProcessor.from_pretrained(MODEL)
asr = pipeline(
    "automatic-speech-recognition",
    model=model,
    tokenizer=processor.tokenizer,
    feature_extractor=processor.feature_extractor,
    torch_dtype=torch.float16,
    device="cuda",
    chunk_length_s=30,
    stride_length_s=5,
)
print(f"loaded in {time.time() - loaded_at:.1f}s", flush=True)

generate_kwargs = {"task": "transcribe"}
if LANG:
    generate_kwargs["language"] = LANG

for record in targets:
    started = time.time()
    # Decoded here rather than by the pipeline: transformers hands audio paths to
    # torchcodec, which on this image links against a CUDA runtime the driver
    # does not have. The files are already 16 kHz mono, which is what the model
    # wants, so reading them directly is both safer and one less conversion.
    samples, sample_rate = soundfile.read(str(AUDIO / record["file"]), dtype="float32")
    # Some fine-tuned checkpoints ship a generation config without the
    # timestamp tokens. Asked for once, then retried without: the words are what
    # is being scored, and losing chunk boundaries costs nothing here.
    try:
        result = asr(
            {"raw": samples, "sampling_rate": sample_rate},
            return_timestamps=True,
            generate_kwargs=generate_kwargs,
        )
    except ValueError:
        # Older checkpoints also reject the task/language kwargs entirely.
        try:
            result = asr(
                {"raw": samples, "sampling_rate": sample_rate},
                generate_kwargs=generate_kwargs,
            )
        except ValueError:
            result = asr({"raw": samples, "sampling_rate": sample_rate})
    elapsed = time.time() - started
    audio_seconds = record["durationMs"] / 1000

    segments = [
        {
            "start": round(c["timestamp"][0] or 0, 2),
            "end": round(c["timestamp"][1] or 0, 2),
            "text": c["text"].strip(),
        }
        for c in result.get("chunks", [])
    ]
    payload = {
        "model": MODEL,
        "tag": TAG,
        "file": record["file"],
        "title": record["title"],
        "forcedLanguage": LANG,
        "detectedLanguage": None,
        "audioSeconds": round(audio_seconds, 1),
        "wallSeconds": round(elapsed, 1),
        "realtimeFactor": round(audio_seconds / elapsed, 1),
        "segments": segments,
        "text": result["text"].strip(),
    }
    (OUT / f"{record['file']}.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1))
    print(
        f"  {record['title']:<9} {audio_seconds/60:.1f}min  {elapsed:.1f}s  "
        f"{audio_seconds/elapsed:.1f}x realtime",
        flush=True,
    )

print(f"done -> {OUT}", flush=True)
