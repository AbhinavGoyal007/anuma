"""
The transcription pipeline, with and without speech gating, so the difference
can be measured rather than assumed.

The worker's job is to turn a recording into diarized, timestamped segments. How
much of the recording it has to look at to do that is a separate question, and
the answer decides the bill: at two hundred hours per employee per month, the
audio that is not speech is the largest line item in the system.

Two paths are implemented here on purpose.

    full   diarize the whole recording, transcribe every turn
    gated  find speech with Silero first, diarize only that, transcribe the turns

`gated` is what the architecture recommends. `full` is kept because a claimed
saving that has not been measured against the thing it replaced is not a saving,
and because gating can only cost accuracy — a word Silero misses is a word no
model downstream ever sees.

Timestamps are always reported against the original recording. A segment that
cited a position in a concatenated speech-only stream would be useless: the
evidence path exists so a person can listen to the moment a claim came from.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import torch

TARGET_SAMPLE_RATE = 16_000

# Speech either side of a detected region, kept so a gate never clips the
# consonant that starts a word. Silero marks the vowel; the plosive before it is
# what tells "sixty" from "sixteen".
SPEECH_PAD_SECONDS = 0.20

# Gaps shorter than this between speech regions are kept rather than cut. Removing
# them saves almost nothing and costs the natural pauses a transcriber uses to
# place sentence boundaries.
KEEP_GAP_SECONDS = 0.35


@dataclass
class SpeechRegion:
    start: float
    end: float

    @property
    def duration(self) -> float:
        return self.end - self.start


def find_speech(samples: np.ndarray, rate: int, vad) -> list[SpeechRegion]:
    """
    Where the speech is, padded and merged.

    Silero rather than a level threshold: a threshold asks whether a frame is
    quiet, which a shop floor answers wrongly in both directions — a loud room
    reads as speech and a quiet sentence reads as silence.
    """
    from silero_vad import get_speech_timestamps

    stamps = get_speech_timestamps(
        torch.from_numpy(samples), vad, sampling_rate=rate, return_seconds=True
    )
    duration = len(samples) / rate

    padded = [
        SpeechRegion(
            start=max(0.0, s["start"] - SPEECH_PAD_SECONDS),
            end=min(duration, s["end"] + SPEECH_PAD_SECONDS),
        )
        for s in stamps
    ]

    merged: list[SpeechRegion] = []
    for region in padded:
        if merged and region.start - merged[-1].end <= KEEP_GAP_SECONDS:
            merged[-1].end = max(merged[-1].end, region.end)
        else:
            merged.append(region)
    return merged


def concatenate(samples: np.ndarray, rate: int, regions: list[SpeechRegion]):
    """
    The speech alone, plus the map back to where it came from.

    The map is the point. Diarization and transcription then run on a shorter
    recording, but every timestamp they produce is translated back to the
    original, so the evidence still points at a moment a person can listen to.
    """
    pieces, offsets = [], []
    position = 0.0
    for region in regions:
        clip = samples[int(region.start * rate) : int(region.end * rate)]
        if clip.size == 0:
            continue
        pieces.append(clip)
        offsets.append((position, position + len(clip) / rate, region.start))
        position += len(clip) / rate
    if not pieces:
        return np.zeros(0, dtype=np.float32), []
    return np.concatenate(pieces), offsets


def to_original_time(t: float, offsets: list[tuple[float, float, float]]) -> float:
    """A time in the gated stream, as a time in the recording."""
    for start, end, original_start in offsets:
        if start <= t <= end:
            return original_start + (t - start)
    # Past the end of the last region: clamp rather than invent a position.
    return offsets[-1][2] + (offsets[-1][1] - offsets[-1][0]) if offsets else t


def speech_seconds(regions: list[SpeechRegion]) -> float:
    return sum(r.duration for r in regions)


def as_model_audio(clip: np.ndarray) -> np.ndarray:
    """
    A turn in the form the processor accepts.

    Handed over as samples rather than as an encoded WAV: the processor takes a
    float array directly, and encoding a buffer only to have it decoded again
    costs time and one more place for a format to be got wrong.
    """
    return np.ascontiguousarray(clip, dtype=np.float32)
