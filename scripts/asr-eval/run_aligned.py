"""
The full pipeline: whole-file transcription, attributed to speakers.

  Voxtral, whole file       -> the words (measured 96% on this test pack)
  faster-whisper turbo      -> word-level timings, at ~50x realtime
  pyannote                  -> who spoke when
  align                     -> the words carry the timings, the timings carry
                               the speakers

Usage:
  python run_aligned.py <audio_dir> <tag> [manifest.json]
"""

import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import soundfile
import torch
from faster_whisper import WhisperModel
from pyannote.audio import Pipeline as DiarizationPipeline
from transformers import AutoProcessor, VoxtralForConditionalGeneration

sys.path.insert(0, "/workspace/eval")
from align import (  # noqa: E402
    Turn,
    TimedWord,
    align_words,
    distribute_across_turns,
    match_rate,
    merge_short_interjections,
    segment_by_speaker,
)

AUDIO_DIR = Path(sys.argv[1])
TAG = sys.argv[2]
MANIFEST = sys.argv[3] if len(sys.argv) > 3 else None
VOXTRAL = os.environ.get("VOXTRAL_MODEL", "mistralai/Voxtral-Mini-3B-2507")

OUT = Path("/workspace/eval/out") / TAG
OUT.mkdir(parents=True, exist_ok=True)

print(f"loading models for {TAG} …", flush=True)
processor = AutoProcessor.from_pretrained(VOXTRAL)
voxtral = VoxtralForConditionalGeneration.from_pretrained(
    VOXTRAL, dtype=torch.bfloat16, device_map="cuda"
)
timer = WhisperModel("large-v3-turbo", device="cuda", compute_type="float16")
diarizer = DiarizationPipeline.from_pretrained(
    "pyannote/speaker-diarization-3.1", token=os.environ["HF_TOKEN"]
)
diarizer.to(torch.device("cuda"))
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

    # 1. The words, with the whole conversation as context.
    inputs = processor.apply_transcription_request(
        language="en", audio=np.ascontiguousarray(samples), format=["wav"], model_id=VOXTRAL
    ).to("cuda", dtype=torch.bfloat16)
    with torch.inference_mode():
        generated = voxtral.generate(**inputs, max_new_tokens=4096)
    text = processor.batch_decode(
        generated[:, inputs.input_ids.shape[1] :], skip_special_tokens=True
    )[0].strip()
    asr_seconds = time.time() - started

    # 2. When each word was said.
    timing_started = time.time()
    segments, _ = timer.transcribe(
        str(path), language="en", beam_size=1, word_timestamps=True, vad_filter=True
    )
    timed = [
        TimedWord(word=w.word.strip(), start=w.start, end=w.end)
        for segment in segments
        for w in (segment.words or [])
        if w.word.strip()
    ]
    timing_seconds = time.time() - timing_started

    # 3. Who was speaking.
    diar_started = time.time()
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
    diar_seconds = time.time() - diar_started

    # 4. Join them.
    reference = text.split()
    rate_matched = match_rate(reference, timed)
    # Below a third, the timing pass and the transcript are not describing the
    # same string — almost always because one is in Devanagari and the other is
    # not — and word-level attribution would be fiction.
    if rate_matched >= 0.33:
        words = align_words(reference, timed)
        speaker_segments = merge_short_interjections(segment_by_speaker(words, turns))
        attribution = "aligned"
    else:
        speaker_segments = distribute_across_turns(reference, turns)
        attribution = "proportional"
        words = reference

    wall = time.time() - started
    entries = [
        {
            "transcript": s.text,
            "start_time_seconds": round(s.start, 3),
            "end_time_seconds": round(max(s.end, s.start), 3),
            "speaker_id": s.speaker,
        }
        for s in speaker_segments
        if s.text.strip()
    ]

    payload = {
        "tag": TAG,
        "mode": "aligned",
        "file": path.name,
        "title": titles.get(path.name, path.stem),
        "audioSeconds": round(audio_seconds, 1),
        "wallSeconds": round(wall, 1),
        "realtimeFactor": round(audio_seconds / wall, 2),
        "asrSeconds": round(asr_seconds, 2),
        "timingSeconds": round(timing_seconds, 2),
        "diarizationSeconds": round(diar_seconds, 2),
        "wordCount": len(reference),
        "matchRate": round(rate_matched, 3),
        "attribution": attribution,
        "timedWordCount": len(timed),
        "turnCount": len(entries),
        "speakerCount": len({e["speaker_id"] for e in entries}),
        "segments": [],
        "text": text,
        "diarized_transcript": {"entries": entries},
    }
    (OUT / f"{path.name}.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1))
    rows.append(payload)
    print(
        f"  {payload['title']:<11} {audio_seconds/60:.1f}min {wall:.0f}s "
        f"({audio_seconds/wall:.1f}x)  asr={asr_seconds:.0f} time={timing_seconds:.0f} "
        f"diar={diar_seconds:.0f}  {len(reference)}w match={rate_matched:.0%} ({attribution}) -> {len(entries)} seg, "
        f"{payload['speakerCount']} speakers",
        flush=True,
    )

if rows:
    audio = sum(r["audioSeconds"] for r in rows)
    wall = sum(r["wallSeconds"] for r in rows)
    print(f"\n{TAG}: {audio/60:.1f} min in {wall:.0f}s = {audio/wall:.1f}x realtime", flush=True)
