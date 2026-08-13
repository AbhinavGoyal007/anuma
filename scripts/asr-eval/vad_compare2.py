"""
Comparing ANUMA's actual trimming rule against a trained detector.

The product removes silence *runs* of at least 0.6 seconds below -35 dB — not
individual quiet frames — so that is what is modelled here. Anything else would
overstate how much the current rule discards and make the comparison dishonest.

The number that matters is not how much each removes but how much *speech* the
threshold removes: those are words that never reach the transcriber, and no
model downstream can recover them.
"""
import sys
from pathlib import Path

import numpy as np
import soundfile
import torch
from silero_vad import get_speech_timestamps, load_silero_vad

RATE = 16_000
THRESHOLD_DB = -35.0
MIN_SILENCE = 0.6   # seconds, matching MIN_SILENCE_SECONDS in preprocess-audio.ts
FRAME = 0.03


def trimmed_mask(samples: np.ndarray) -> np.ndarray:
    """Per-frame keep/drop under the product's rule."""
    size = int(RATE * FRAME)
    usable = len(samples) - len(samples) % size
    frames = samples[:usable].reshape(-1, size)
    db = 20 * np.log10(np.sqrt((frames.astype(np.float64) ** 2).mean(axis=1)) + 1e-12)
    quiet = db <= THRESHOLD_DB

    keep = np.ones(len(quiet), dtype=bool)
    run_start = None
    min_frames = int(MIN_SILENCE / FRAME)
    for i, q in enumerate(list(quiet) + [False]):
        if q and run_start is None:
            run_start = i
        elif not q and run_start is not None:
            if i - run_start >= min_frames:
                keep[run_start:i] = False
            run_start = None
    return keep


def silero_mask(samples: np.ndarray, model, n_frames: int) -> np.ndarray:
    stamps = get_speech_timestamps(
        torch.from_numpy(samples), model, sampling_rate=RATE, return_seconds=True
    )
    mask = np.zeros(n_frames, dtype=bool)
    for s in stamps:
        mask[int(s["start"] / FRAME) : int(s["end"] / FRAME)] = True
    return mask


def main() -> None:
    model = load_silero_vad()
    tot = {"audio": 0.0, "kept": 0.0, "speech": 0.0, "speech_lost": 0.0, "noise_kept": 0.0}

    print(f"{'file':<20}{'audio':>7}{'kept':>8}{'speech':>8}{'SPEECH LOST':>13}{'noise kept':>12}")
    print("-" * 76)
    for path in sorted(Path(sys.argv[1]).glob("*.wav")):
        samples, _ = soundfile.read(str(path), dtype="float32", always_2d=True)
        samples = samples.mean(axis=1)
        keep = trimmed_mask(samples)
        speech = silero_mask(samples, model, len(keep))

        audio_s = len(keep) * FRAME
        kept_s = keep.sum() * FRAME
        speech_s = speech.sum() * FRAME
        lost_s = (speech & ~keep).sum() * FRAME      # speech the rule threw away
        noise_s = (keep & ~speech).sum() * FRAME     # non-speech the rule kept

        for k, v in zip(tot, (audio_s, kept_s, speech_s, lost_s, noise_s)):
            tot[k] += v
        print(f"{path.name:<20}{audio_s:>6.0f}s{kept_s:>7.0f}s{speech_s:>7.0f}s"
              f"{lost_s:>11.0f}s{noise_s:>11.0f}s")

    print("-" * 76)
    print(f"{'total':<20}{tot['audio']:>6.0f}s{tot['kept']:>7.0f}s{tot['speech']:>7.0f}s"
          f"{tot['speech_lost']:>11.0f}s{tot['noise_kept']:>11.0f}s")
    print()
    print(f"  current rule keeps      {tot['kept']/tot['audio']*100:5.1f}% of audio")
    print(f"  of the speech present,  {tot['speech_lost']/tot['speech']*100:5.1f}% is thrown away")
    print(f"  of what it keeps,       {tot['noise_kept']/tot['kept']*100:5.1f}% is not speech")
    print(f"  Silero-only would keep  {tot['speech']/tot['audio']*100:5.1f}% of audio")


if __name__ == "__main__":
    main()
