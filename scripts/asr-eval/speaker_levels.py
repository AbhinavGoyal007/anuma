"""
Whether both halves of the conversation arrive at usable levels.

The representative wears or holds the microphone; the customer stands in front
of it. If the customer's speech lands materially quieter, that is the half of
the conversation carrying the requirement, the budget and the objection — the
half the product exists to capture — being recorded worst.

Levels are taken from the diarization already computed, so this measures the
real two-party split rather than a guess at who spoke when.
"""
import json, glob
from pathlib import Path
import numpy as np, soundfile

RATE = 16_000
rows = []
for turns_file in sorted(glob.glob("out/pyannote-3.1/*.json")):
    d = json.load(open(turns_file))
    stem = d["file"].replace(".m4a", "").replace(".wav", "")
    wav = Path("appaudio") / f"{stem}.wav"
    if not wav.exists():
        continue
    samples, _ = soundfile.read(str(wav), dtype="float32", always_2d=True)
    samples = samples.mean(axis=1)

    level = {}
    for t in d["turns"]:
        clip = samples[int(t["start"] * RATE): int(t["end"] * RATE)]
        if clip.size < RATE * 0.2:
            continue
        db = 20 * np.log10(np.sqrt((clip.astype(np.float64) ** 2).mean()) + 1e-12)
        level.setdefault(t["speaker"], []).append(db)

    if len(level) < 2:
        continue
    means = {s: float(np.mean(v)) for s, v in level.items()}
    loud, quiet = max(means, key=means.get), min(means, key=means.get)
    rows.append((d["title"], means[loud], means[quiet], means[loud] - means[quiet]))

print(f"{'script':<12}{'louder spk':>12}{'quieter spk':>13}{'gap':>8}")
print("-" * 47)
for title, hi, lo, gap in rows:
    print(f"{title:<12}{hi:>11.1f}dB{lo:>12.1f}dB{gap:>7.1f}dB")
if rows:
    print("-" * 47)
    print(f"{'mean gap':<12}{'':>12}{'':>13}{np.mean([r[3] for r in rows]):>7.1f}dB")
