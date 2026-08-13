"""
Measuring what ANUMA's recordings actually sound like.

Every recommendation about noise, gain and silence should come from the audio in
hand rather than from what a shop floor is assumed to sound like. This reports
the things that decide those choices: how loud the speech is against the room,
how much of the recording is speech at all, whether the two speakers arrive at
comparable levels, and whether anything is clipped or rumbling.
"""

import glob
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile


def frame_energy_db(samples: np.ndarray, rate: int, frame_ms: int = 30) -> np.ndarray:
    """Per-frame RMS in dBFS, which is how a VAD threshold is actually judged."""
    size = int(rate * frame_ms / 1000)
    usable = len(samples) - len(samples) % size
    frames = samples[:usable].reshape(-1, size)
    rms = np.sqrt((frames.astype(np.float64) ** 2).mean(axis=1) + 1e-12)
    return 20 * np.log10(rms + 1e-12)


def spectral_split(samples: np.ndarray, rate: int) -> dict[str, float]:
    """
    How the energy divides between rumble, speech and hiss.

    Air conditioning and refrigeration live below about 120 Hz; intelligibility
    lives between 300 Hz and 3.4 kHz. A recording with most of its energy in the
    first band is carrying a room, not a conversation.
    """
    window = min(len(samples), rate * 60)
    spectrum = np.abs(np.fft.rfft(samples[:window] * np.hanning(window)))
    freqs = np.fft.rfftfreq(window, 1 / rate)
    total = float((spectrum**2).sum()) + 1e-12
    band = lambda low, high: float(  # noqa: E731
        (spectrum[(freqs >= low) & (freqs < high)] ** 2).sum() / total * 100
    )
    return {
        "rumble_pct": round(band(0, 120), 1),
        "speech_pct": round(band(300, 3400), 1),
        "hiss_pct": round(band(6000, rate / 2), 1),
    }


def profile(path: Path) -> dict:
    samples, rate = soundfile.read(str(path), dtype="float32", always_2d=True)
    samples = samples.mean(axis=1)

    db = frame_energy_db(samples, rate)
    # The noise floor is where the quietest tenth of the recording sits; speech
    # is the loudest quarter. The gap between them is what a VAD has to work
    # with, and what decides whether a threshold can separate them at all.
    floor = float(np.percentile(db, 10))
    speech = float(np.percentile(db, 75))
    peak = float(db.max())

    # Share of the recording above a few candidate thresholds, which is the
    # question "how much would silence trimming actually remove".
    above = {f"above_{t}db": round(float((db > t).mean() * 100), 1) for t in (-45, -40, -35, -30)}

    clipped = float((np.abs(samples) > 0.99).mean() * 100)

    return {
        "file": path.name,
        "seconds": round(len(samples) / rate, 1),
        "noise_floor_db": round(floor, 1),
        "speech_db": round(speech, 1),
        "peak_db": round(peak, 1),
        "snr_db": round(speech - floor, 1),
        "clipped_pct": round(clipped, 3),
        **above,
        **spectral_split(samples, rate),
    }


def main() -> None:
    paths = sorted(Path(sys.argv[1]).glob("*.wav"))
    rows = [profile(p) for p in paths]

    print(
        f"{'file':<16}{'secs':>6}{'floor':>7}{'speech':>8}{'SNR':>6}"
        f"{'>-35dB':>8}{'>-40dB':>8}{'rumble':>8}{'speech%':>9}{'clip%':>7}"
    )
    print("-" * 90)
    for r in rows:
        print(
            f"{r['file']:<16}{r['seconds']:>6.0f}{r['noise_floor_db']:>7.1f}"
            f"{r['speech_db']:>8.1f}{r['snr_db']:>6.1f}"
            f"{r['above_-35db']:>7.1f}%{r['above_-40db']:>7.1f}%"
            f"{r['rumble_pct']:>7.1f}%{r['speech_pct']:>8.1f}%{r['clipped_pct']:>6.2f}%"
        )

    mean = lambda k: sum(r[k] for r in rows) / len(rows)  # noqa: E731
    print("-" * 90)
    print(
        f"{'mean':<16}{mean('seconds'):>6.0f}{mean('noise_floor_db'):>7.1f}"
        f"{mean('speech_db'):>8.1f}{mean('snr_db'):>6.1f}"
        f"{mean('above_-35db'):>7.1f}%{mean('above_-40db'):>7.1f}%"
        f"{mean('rumble_pct'):>7.1f}%{mean('speech_pct'):>8.1f}%{mean('clipped_pct'):>6.2f}%"
    )
    Path("audio_profile.json").write_text(json.dumps(rows, indent=1))


if __name__ == "__main__":
    main()
