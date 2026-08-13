# Replacing Sarvam: what the audio actually says

Measured 13 August 2026 against the four recorded scripts from the ANUMA
Conversation Test Pack. Reproducible with `scripts/asr-eval/`.

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
gold-truth tables are still recoverable: 30 entities across four scripts, spread
over graphics chips, memory, storage, processors, product names, brands and
prices. Graphics chips are compared exactly — accepting an RTX 4050 for an RTX
4060 is the error that costs a sale.

## Result

| Model | Entity recall | Realtime factor | Notes |
|---|---|---|---|
| **faster-whisper large-v3-turbo, `language=en`** | **30/30 (100%)** | **52× single, 74× batched** | Nothing missed |
| faster-whisper large-v3, `language=en` | 28/30 (93%) | 26× | Misheard "85" as "95" |
| **Sarvam saaras:v3 (incumbent)** | 28/30 (93%) | — | Writes numbers as words |
| Oriserve Whisper-Hindi2Hinglish-Prime | 24/30 (80%) | 5.6× | Verbatim Hinglish, loses product names |
| faster-whisper large-v3, auto-detect | 22/30 (73%) | 11× | Devanagari output |
| vasista22/whisper-hindi-large-v2 | 0/30 (0%) | 6× | Transliterates English into Devanagari |

Diarization: **pyannote 3.1 found exactly 2 speakers in all four scripts at ~50×
realtime.** Sarvam invented a spurious third speaker in Script 2 (0.5 seconds).

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

Hindi2Hinglish-Prime is the opposite trade: it produces genuinely verbatim
romanised Hinglish ("laptop dekhate ho kuchh specific model hai?") but loses
product names and processors, scoring 80%.

If verbatim evidence has to hold, the answer is to run both — turbo for the
fields, Hindi2Hinglish for the displayed transcript — at about 12% of Sarvam's
cost. That has not been tested end to end.

## What this evaluation cannot tell you

**There is no Hindi audio in it.** Scripts 3, 6 and 9 are the Devanagari ones and
were never recorded, so every measurement here is English or Roman-script
Hinglish. Whisper is most likely to fail on pure Hindi, and that case is
untested. Recording those three scripts is about eight minutes of work and would
roughly double what this evaluation establishes.

**The sample is fourteen minutes.** Enough to rank models decisively when the gap
is 100% against 73%. Not enough to separate two models a point apart.

**Silero VAD needs no work.** faster-whisper already runs `silero_vad_v6.onnx`
when `vad_filter=True`, which every measurement above used. The ffmpeg silence
trimming in `preprocess-audio.ts` exists because Sarvam bills per second
submitted; once transcription is self-hosted the cost is GPU time, not audio
seconds, and that step becomes largely redundant.

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
