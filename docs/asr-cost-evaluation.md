# Replacing Sarvam: what the audio actually says

Measured 13 August 2026 against six recorded scripts from the ANUMA Conversation
Test Pack — two English, two Hinglish, two Hindi. Reproducible with
`scripts/asr-eval/`.

## Why

Sarvam costs a measured ₹1.53 for a 121-second Hinglish call — **₹45.5 per audio
hour**. At 200 hours per employee per month that is **₹9,100 per employee**,
which is close to a frontline salary and cannot be sold.

## What was measured, and why not word error rate

The product does not sell a transcript. It extracts a Commercial Interaction
Record, and what matters is whether `RTX 4060`, `₹80,000` and `Victus` survive
transcription for the extractor to find. A model can score a respectable word
error rate and still be useless because it wrote "ITX 40 50".

So each transcript is scored on whether the facts from the test pack's own
gold-truth tables are still recoverable: 38 entities across six scripts, spread
over graphics chips, memory, storage, processors, product names, brands and
prices. Graphics chips are compared exactly — accepting an RTX 4050 for an RTX
4060 is the error that costs a sale.

## Result

| Model | Overall | English | Hinglish | Hindi | Realtime |
|---|---|---|---|---|---|
| **faster-whisper large-v3-turbo, `language=en`** | **34/38 (89%)** | **100%** | **100%** | 50% | **52× single, 74× batched** |
| faster-whisper large-v3, `language=en` | 33/38 (87%) | 93% | 93% | 62% | 26× |
| **Oriserve Whisper-Hindi2Hinglish-Prime** | 30/38 (79%) | 87% | 73% | **75%** | 5.6× |
| faster-whisper large-v3, auto-detect | 24/38 (63%) | 73% | 67% | 38% | 11× |
| vasista22/whisper-hindi-large-v2 | 0/30 (0%) | 0% | 0% | — | 6× |
| Sarvam saaras:v3 (incumbent) | 30/30 (100%) | 100% | 100% | *not run* | — |

Sarvam has no Hindi figure: only the four English and Hinglish scripts were ever
transcribed through the product, and re-running the two Hindi files through the
paid API was not done. That is the one gap left in this table.

Diarization: **pyannote 3.1 found exactly 2 speakers in all six scripts, Hindi
included, at 34–52× realtime.** Sarvam invented a spurious third speaker in Script 2 (0.5 seconds).

## Whisper is not one answer, it is two

The English and Hinglish result is emphatic: turbo misses nothing at all. Pure
Hindi is a different question, and the ranking inverts.

Forced to English on Hindi speech, turbo emits Whisper's `foreign` placeholder
and simply drops what it cannot render — Script 6's entire "sixteen GB RAM,
512 GB SSD, Lenovo IdeaPad Slim 5" recommendation vanished. Hindi2Hinglish kept
it, romanised as spoken: "aapke lie solah GB RAM lena achchha hoga… to lena vah
Idea pad, slim 5 behtar rahega".

That distinction is not cosmetic. A number written as "solah" is a number a
language model reads without difficulty; a sentence the transcriber deleted is
gone for good. So on Hindi the honest ranking is Hindi2Hinglish at 75% against
turbo's 50%, and the two models should be routed by language rather than one
being chosen outright.

## The three findings that decide it

**Whisper must be told the language.** Left to detect, it labelled a pure-English
conversation as Hindi (Script 4, 0.55 confidence) and emitted Devanagari, which
takes entity recall from 93% to 73%. `language="en"` fixes it and is also three
to four times faster.

**Turbo is better than large-v3 here, not merely cheaper.** It read `RTX 4050`
where large-v3 read `ITX 4050`, and `85` where large-v3 read `95`. It is also
twice the speed. There is no accuracy argument for large-v3 on this audio.

**Sarvam writes numbers as words.** "eighty thousand", "eighty five" — correct,
but the extractor then has to parse English numerals where Whisper hands it
"80,000". This is a real disadvantage that word error rate would have hidden.

## Cost

At 74× batched on the RTX A4500 used for this test, 200 hours of audio is about
**2.7 GPU-hours** for transcription and roughly **4 GPU-hours** for diarization.
At community-cloud rates around $0.30/hour that is **under ₹200 per employee per
month against Sarvam's ₹9,100** — roughly fiftyfold.

The saving is large enough that the exact GPU rate does not change the decision.

## The trade-off worth stating

Forcing English makes Whisper *translate* Hinglish rather than romanise it:
"मुझे आई नाइन चाहिए" becomes "I want i9". Excellent for extraction, but the
transcript is then no longer what was said — which matters for a product whose
promise is evidence traceable to a timestamped segment.

Hindi2Hinglish-Prime is the opposite trade: genuinely verbatim romanised
Hinglish ("laptop dekhate ho kuchh specific model hai?"), weaker on English
product names, stronger on Hindi.

Running both — turbo for the fields, Hindi2Hinglish for the displayed
transcript — costs about 12% of Sarvam and resolves the Hindi gap at the same
time. That has not been tested end to end.

## Recommended

Route by the language detected on the first pass:

| Spoken | Model | Recall |
|---|---|---|
| English, Hinglish | large-v3-turbo, `language=en` | 100% |
| Hindi | Whisper-Hindi2Hinglish-Prime | 75% |

A single model, if routing is not wanted, is turbo at 89% overall — accepting
that pure-Hindi conversations lose about half their facts.

## What this evaluation cannot tell you

**Sarvam's Hindi is untested.** It holds a perfect score on the four scripts the
product actually transcribed, and no figure at all on the two Hindi ones. Until
that is filled in, "Whisper beats Sarvam" is established for English and
Hinglish only.

**The sample is twenty minutes.** Enough to rank models decisively when the gap
is 100% against 50%. Not enough to separate two models a point apart, and the
Hindi conclusion rests on eight entities across two files.

**Silero VAD needs no work.** faster-whisper already runs `silero_vad_v6.onnx`
when `vad_filter=True`, which every measurement above used. The ffmpeg silence
trimming in `preprocess-audio.ts` exists because Sarvam bills per second
submitted; once transcription is self-hosted the cost is GPU time, not audio
seconds, and that step becomes largely redundant.

## Three bugs found in the scorer, not the models

Worth recording, because each one had made every model look worse than it was.

Money was required in full digits when the floor says "budget 65 hai". The digit
normaliser collapsed spaces between numbers, welding "4050 16GB" into
"405016gb". And Hindi numerals were not accepted at all, so a transcript saying
"solah GB RAM" scored as having lost the memory — which penalised precisely the
model that had preserved it.

The last one changed a recommendation, not just a number.

## Reproducing

```bash
# On a GPU host with the audio exported to /workspace/eval/audio
python run_fw.py large-v3-turbo turbo-en en     # the winner
python run_hf.py Oriserve/Whisper-Hindi2Hinglish-Prime hindi2hinglish auto
python run_diar.py                              # pyannote 3.1
python score.py                                 # the table above
```

Audio is exported with `scripts/export-eval-audio.mts`. Transcripts from this run
are kept in `eval/transcripts/`, which is git-ignored — they contain customer
speech.
