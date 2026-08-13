# Replacing Sarvam: what the audio actually says

Measured 13 August 2026 over **13 recorded scripts, 46.4 minutes** from the ANUMA
Conversation Test Packs — English, Hinglish, Devanagari Hindi and romanised
Hindi. Reproducible with `scripts/asr-eval/`.

## Why

Sarvam costs a measured ₹1.53 for a 121-second call — **₹45.5 per audio hour**.
At 200 hours per employee per month that is **₹9,100 per employee**, close to a
frontline salary, and unsellable.

## What was measured, and why not word error rate

The product does not sell a transcript. It extracts a Commercial Interaction
Record, so what matters is whether `RTX 4060`, `₹80,000` and `Victus` survive for
the extractor to find. A model can post a respectable word error rate and still
be useless for writing "ITX 40 50".

Every transcript is therefore scored on whether the facts survive: **84 entities**
across the thirteen scripts, drawn from the packs' own gold-truth tables and
reduced to those actually *uttered* in the dialogue. Graphics chips are compared
exactly, because accepting an RTX 4050 for an RTX 4060 is the error that costs a
sale.

## Result

| Model | Overall | English | Hinglish | Hindi | Hindi-Roman | Realtime | ₹/employee/mo |
|---|---|---|---|---|---|---|---|
| **Voxtral-Mini-3B** (Mistral, Apache 2.0) | **81/84 · 96%** | 97% | 95% | **100%** | **100%** | 12.9× | **≈ 470** |
| **Sarvam saaras:v3** (incumbent) | **80/84 · 95%** | **100%** | 95% | **100%** | 71% | 20.3× | **9,100** |
| Whisper-Hindi2Hinglish-Prime | 73/84 · 87% | 93% | 85% | 67% | 100% | 5.3× | ≈ 1,150 |
| faster-whisper large-v3, `language=en` | 69/84 · 82% | 86% | 82% | 56% | 100% | 28.9× | ≈ 210 |
| faster-whisper large-v3-turbo, `language=en` | 62/84 · 74% | 83% | 69% | 56% | 86% | 48.8× | ≈ 125 |
| vasista22/whisper-hindi-large-v2 | 0% | 0% | 0% | — | — | 6× | — |

Diarization: **pyannote 3.1 found exactly two speakers in every script**, Hindi
included, at 34–52× realtime. Sarvam invented a spurious third in Script 2.

## The production pipeline is worse than the benchmark, and worse than Sarvam

Everything above measured **whole-file** transcription: hand Voxtral a
conversation, get prose back. The product cannot use prose — it needs diarized,
timestamped segments — so the worker diarizes first and transcribes each speaker
turn on its own.

Running all thirteen scripts through that shape, which is what production would
actually do:

| pipeline | overall | English | Hinglish | Hindi |
|---|---|---|---|---|
| Voxtral, whole file | 81/84 · **96%** | 97% | 95% | 100% |
| Sarvam saaras:v3 | 80/84 · 95% | 100% | 95% | 100% |
| **Voxtral, per turn (production)** | **69/84 · 82%** | 90% | 77% | 89% |

**Fourteen points, and it puts Voxtral below the incumbent.** Switching to it as
built would lose accuracy, not hold it.

The cause is specific. Of the twelve facts the per-turn pipeline loses, **ten are
product or brand names** — IdeaPad, Swift, Victus, Vivobook, Envy, Asus, Lenovo,
Acer. Turns are a median of 5.6 seconds and a third are under three, and a proper
noun heard in a five-second fragment has nothing to anchor it. Given the whole
conversation the model hears the same product named repeatedly and converges on
it; given one turn it guesses.

Merging turns more aggressively to lengthen them was tested and recovered one
entity — 82% to 83%. Length is not the problem; isolation is.

**The fix is to stop transcribing turns.** Transcribe the whole recording once,
for the text, and use diarization only to decide who said which part — the
approach WhisperX takes. Attaching speakers to whole-file text needs word-level
timings, which a cheap Whisper pass provides at fifty times realtime. That is a
real piece of work and it has not been built.

**Until it is, Sarvam remains the better choice**, and the cost argument is on
hold rather than won.

## The finding

**Voxtral-Mini-3B matches Sarvam at about one twentieth of the cost.** Not
better — the two are one entity apart across 84, which is noise. They differ in
where they are strong: Sarvam takes English 29/29, Voxtral takes romanised Hindi
7/7 against Sarvam's 5/7. On Hinglish and Devanagari Hindi they are identical.

So the case for switching is **cost, at equal accuracy**. That is a narrower
claim than "Whisper is better", and it is the one the evidence supports.

Voxtral is Apache 2.0, so nothing about the licence constrains deployment.

## Whisper is the wrong tool here, and turbo is the wrong Whisper

An earlier round of this evaluation, run on only four scripts, concluded that
large-v3-turbo was the winner at 100%. Extended to thirteen it comes **last of
the serious models at 74%**, and the four-script result was an artefact of a
small sample. The lesson is in the method, not the model.

Whisper must also be told the language: left to detect, it labelled a
pure-English conversation as Hindi and emitted Devanagari, which costs about
twenty points. Forcing `language=en` fixes that but makes it *translate* Hinglish
rather than romanise it, so the transcript stops being what was said.

## Cost

Voxtral-Mini-3B measured **12.9× realtime unbatched** on an RTX A4500. 200 audio
hours is 15.6 GPU-hours, about $5.30 at community-cloud rates — **≈ ₹470 per
employee per month against ₹9,100**.

Voxtral-Small-24B was not tested: it needs roughly 48 GB and would cost an
estimated ₹2,000–4,700 per month, four to ten times Mini for at most three
entities of headroom. Batching with vLLM would likely improve every figure here
three- to fivefold and does not change the ranking.

## Three bugs in the scorer, and one in the reference

Recorded because each made every model look worse than it was, and one changed a
recommendation rather than a number.

- Money was required in full digits when the floor says "budget 65 hai".
- The digit normaliser collapsed spaces between numbers, welding "4050 16GB"
  into "405016gb".
- Hindi numerals were not accepted, so "solah GB RAM" scored as having lost the
  memory — penalising precisely the model that had preserved it.
- The gold truth itself over-counted: the packs' answer keys name things the
  *extraction* should infer, like "Lenovo LOQ" where the dialogue says only
  "LOQ". Filtering to facts actually uttered took 103 candidate entities down to
  84. The reference is now built by running the scorer against the script, so the
  two cannot drift apart.

## What this still does not establish

**No end-to-end test.** Entity survival is a proxy. The real question is whether
the 43-field record comes out the same, and that has not been run.

**Forty-six minutes, one pass per model.** Enough to separate 96% from 74%. Not
enough to separate 96% from 95%, which is exactly the Voxtral–Sarvam gap.

**Script 3 was never recorded**, so the two-customer speaker-separation case is
untested.

**Pingala V1 was not run.** It is an Indic code-switch specialist, and Voxtral's
three misses are all English and Hinglish brand names, so it is the most likely
candidate to beat what is here.

## Reproducing

```bash
node --env-file=.env.local --experimental-strip-types \
  scripts/export-eval-audio.mts --org "AG LLC" --out eval/audio

# On the GPU host
python run_voxtral.py mistralai/Voxtral-Mini-3B-2507 voxtral-mini-3b en   # the winner
python run_fw.py large-v3-turbo turbo-en en
python run_hf.py Oriserve/Whisper-Hindi2Hinglish-Prime hindi2hinglish auto
python run_diar.py

# The incumbent, on the same audio. Costs real money.
node --env-file=.env.local --experimental-strip-types \
  scripts/asr-eval/run-sarvam-baseline.mts --audio eval/audio2

python build_gold.py && python filter_gold.py && python score2.py
```

Transcripts are kept in `eval/`, which is git-ignored — they contain customer
speech.
