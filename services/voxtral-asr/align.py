"""
Attaching speakers to a whole-file transcript.

The worker's first design transcribed each speaker turn on its own. It produced
correctly attributed segments and lost fourteen points of accuracy doing it,
because a proper noun heard in a five-second fragment has nothing to anchor it:
of the twelve facts that design lost across thirteen scripts, ten were product
and brand names — IdeaPad, Victus, Vivobook, Asus. A model given the whole
conversation hears the product named repeatedly and converges on it. A model
given one turn guesses.

So the transcription and the attribution are separated:

    Voxtral, whole file        the words, with the context that makes them right
    Whisper turbo, word times  when each word was said
    pyannote                   who was speaking at each moment
    this module                joins the three

Two transcripts of the same audio disagree in detail but follow the same
sequence, so Voxtral's words are aligned against Whisper's timed words and
inherit their timings. Each word then takes the speaker whose turn covers it, and
consecutive words with the same speaker become a segment.

Where alignment fails — a Voxtral word with no Whisper counterpart — the word
takes the timing of its neighbours rather than being dropped. Losing a word to a
bookkeeping failure would be the same mistake in a new place.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from difflib import SequenceMatcher

# Compared without case, punctuation or digit grouping, because "80,000" and
# "80000" are the same word said once and the alignment should not be distracted
# by how each model chose to write it.
# Letters and digits in any script. An ASCII-only class silently reduced every
# Devanagari word to an empty string, so a Hindi transcript aligned against
# nothing and collapsed into a handful of segments.
_NORMALISE = re.compile(r"[^\w]+", re.UNICODE)


def normalise_word(word: str) -> str:
    return _NORMALISE.sub("", word.lower())


@dataclass
class TimedWord:
    word: str
    start: float
    end: float


@dataclass
class Turn:
    start: float
    end: float
    speaker: str


@dataclass
class Segment:
    speaker: str
    start: float
    end: float
    text: str


def match_rate(reference: list[str], timed: list[TimedWord]) -> float:
    """
    How much of the transcript the timing pass actually recognised.

    Low when the two models wrote the same speech in different scripts — Voxtral
    in Devanagari against Whisper's romanisation — where nothing lines up because
    nothing looks alike. Worth knowing, because the attribution that follows is
    only as good as this.
    """
    if not reference or not timed:
        return 0.0
    left = [normalise_word(w) for w in reference]
    right = [normalise_word(t.word) for t in timed]
    matcher = SequenceMatcher(a=left, b=right, autojunk=False)
    return sum(b.size for b in matcher.get_matching_blocks()) / len(reference)


def distribute_across_turns(reference: list[str], turns: list["Turn"]) -> list["Segment"]:
    """
    The words spread over the speaker turns by how long each one lasted.

    A fallback, used only when alignment has failed. It cannot place a word
    exactly, but a transcript divided roughly in proportion to who was speaking
    is far closer to the truth than one collapsed into five segments — and the
    speaker changes, which is what the extraction depends on, land in
    approximately the right places.
    """
    if not turns or not reference:
        return []
    total = sum(t.end - t.start for t in turns) or 1.0
    segments: list[Segment] = []
    position = 0
    for index, turn in enumerate(turns):
        share = (turn.end - turn.start) / total
        take = len(reference) - position if index == len(turns) - 1 else round(len(reference) * share)
        words = reference[position : position + take]
        position += take
        if not words:
            continue
        segments.append(
            Segment(speaker=turn.speaker, start=turn.start, end=turn.end, text=" ".join(words))
        )
    return segments


def align_words(reference: list[str], timed: list[TimedWord]) -> list[TimedWord]:
    """
    Voxtral's words, carrying Whisper's timings.

    A ratcheting sequence match rather than a nearest-neighbour search: the two
    transcripts run in the same order, so the alignment only ever moves forward
    and a word inserted by one model cannot drag the rest out of step.
    """
    if not timed:
        return []
    if not reference:
        return []

    left = [normalise_word(w) for w in reference]
    right = [normalise_word(t.word) for t in timed]
    matcher = SequenceMatcher(a=left, b=right, autojunk=False)

    result: list[TimedWord | None] = [None] * len(reference)
    for block in matcher.get_matching_blocks():
        for offset in range(block.size):
            result[block.a + offset] = timed[block.b + offset]

    # Words that matched nothing sit between two that did. They are given the
    # span between their neighbours, which keeps them in the right turn even
    # when the exact moment is unknown.
    filled: list[TimedWord] = []
    for index, word in enumerate(reference):
        anchor = result[index]
        if anchor is not None:
            filled.append(TimedWord(word=word, start=anchor.start, end=anchor.end))
            continue
        previous = next((result[i] for i in range(index - 1, -1, -1) if result[i]), None)
        following = next(
            (result[i] for i in range(index + 1, len(result)) if result[i]), None
        )
        if previous and following:
            start, end = previous.end, following.start
        elif previous:
            start, end = previous.end, previous.end
        elif following:
            start, end = following.start, following.start
        else:
            start = end = 0.0
        filled.append(TimedWord(word=word, start=start, end=max(end, start)))
    return filled


def speaker_at(time: float, turns: list[Turn]) -> str | None:
    """Who was speaking then, or the nearest turn if the moment falls in a gap."""
    for turn in turns:
        if turn.start <= time <= turn.end:
            return turn.speaker
    if not turns:
        return None
    return min(turns, key=lambda t: min(abs(t.start - time), abs(t.end - time))).speaker


def segment_by_speaker(words: list[TimedWord], turns: list[Turn]) -> list[Segment]:
    """
    Consecutive words by one speaker, as segments.

    The midpoint of a word decides its speaker rather than its start, because a
    word that straddles a turn boundary belongs to whoever was talking for most
    of it.
    """
    segments: list[Segment] = []
    for word in words:
        speaker = speaker_at((word.start + word.end) / 2, turns)
        if speaker is None:
            continue
        if segments and segments[-1].speaker == speaker:
            segments[-1].end = max(segments[-1].end, word.end)
            segments[-1].text = f"{segments[-1].text} {word.word}".strip()
        else:
            segments.append(
                Segment(speaker=speaker, start=word.start, end=max(word.end, word.start), text=word.word)
            )
    # A single word attributed to the other speaker in the middle of a sentence
    # is diarization jitter, not a turn. Folding it back reads better and stops
    # the record crediting a stray word to the wrong person.
    return [s for s in segments if s.text.strip()]


def merge_short_interjections(segments: list[Segment], min_words: int = 2) -> list[Segment]:
    """Folds one-word flickers back into the surrounding speaker."""
    if len(segments) < 3:
        return segments
    merged = [segments[0]]
    for index in range(1, len(segments) - 1):
        current = segments[index]
        previous, following = merged[-1], segments[index + 1]
        if (
            len(current.text.split()) < min_words
            and previous.speaker == following.speaker
            and previous.speaker != current.speaker
        ):
            previous.end = current.end
            previous.text = f"{previous.text} {current.text}".strip()
            continue
        if current.speaker == previous.speaker:
            previous.end = current.end
            previous.text = f"{previous.text} {current.text}".strip()
            continue
        merged.append(current)
    merged.append(segments[-1])
    return merged
