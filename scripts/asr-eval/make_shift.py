"""
Building a recording that looks like an always-on shift.

The role-play recordings are 86–90% speech, which is nothing like a nine-hour
shift. Measuring speech gating against them answers the wrong question: there is
almost nothing to gate, so the gate costs more than it saves — which is exactly
what the first measurement showed.

This makes the right question askable. A real conversation is embedded in the
quiet stretches taken from the same recording, so the padding is the actual room
— the air conditioning, the distant voices, the shop — rather than digital
silence. Silence would make the gate look far better than it is, because
detecting speech against nothing is trivial and detecting it against a shop floor
is the whole problem.

The conversation is left contiguous, so the transcript from a gated run remains
comparable to the transcript from the original file and the accuracy question
stays answerable.
"""

import sys
from pathlib import Path

import numpy as np
import soundfile

RATE = 16_000
SPEECH_SHARE = float(sys.argv[3]) if len(sys.argv) > 3 else 0.12


def room_tone(samples: np.ndarray) -> np.ndarray:
    """The quietest tenth of the recording, which is the room with nobody talking."""
    frame = int(RATE * 0.03)
    usable = len(samples) - len(samples) % frame
    frames = samples[:usable].reshape(-1, frame)
    energy = (frames.astype(np.float64) ** 2).mean(axis=1)
    quiet = frames[energy <= np.percentile(energy, 10)]
    if quiet.size == 0:
        return np.zeros(RATE, dtype=np.float32)
    return quiet.reshape(-1).astype(np.float32)


def main() -> None:
    source = Path(sys.argv[1])
    target = Path(sys.argv[2])
    target.parent.mkdir(parents=True, exist_ok=True)

    samples, rate = soundfile.read(str(source), dtype="float32", always_2d=True)
    samples = samples.mean(axis=1)

    tone = room_tone(samples)
    total_needed = int(len(samples) / SPEECH_SHARE)
    padding_needed = total_needed - len(samples)

    # Tiled with a random offset each time so the padding does not become one
    # repeating loop that a detector could learn rather than reject.
    rng = np.random.default_rng(7)
    pieces = []
    while sum(len(p) for p in pieces) < padding_needed:
        start = rng.integers(0, max(1, len(tone) - RATE))
        pieces.append(tone[start : start + RATE * 5])
    padding = np.concatenate(pieces)[:padding_needed]

    # Half the quiet before the conversation, half after: a shift is not a
    # conversation with a tail, it is a conversation somewhere in the middle.
    half = len(padding) // 2
    shift = np.concatenate([padding[:half], samples, padding[half:]])

    soundfile.write(str(target), shift, rate, subtype="PCM_16")
    print(
        f"  {target.name}: {len(shift)/rate/60:.1f} min "
        f"({len(samples)/rate/60:.1f} min conversation, "
        f"{len(samples)/len(shift)*100:.0f}% speech)"
    )


if __name__ == "__main__":
    main()
