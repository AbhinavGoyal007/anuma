# Audio: what to change, what to leave alone

Written 13 August 2026 after measuring ANUMA's own recordings. Every number here
is from the fifteen recordings the product captured and the thirteen role-play
scripts, not from what a shop floor is assumed to sound like.

The short version: **the noise problem is smaller than expected, the silence
problem is real but only under always-on capture, and the single most damaging
thing we could do is add a denoiser.**

## What the audio actually measures

| | Noise floor | Speech | SNR | Rumble <120 Hz | Clipping |
|---|---|---|---|---|---|
| Captured by the product | −48.9 dB | −26.2 dB | **22.7 dB** | 0.9% | 0% |
| WhatsApp voice notes | −62.7 dB | −22.4 dB | 40.3 dB | 0.3% | 0% |

22.7 dB is workable. It is not the 5–10 dB of a genuinely hostile room, and
there is no low-frequency rumble to filter and nothing clipped to repair.

**But the ASR evaluation was run on the WhatsApp files, which are 18 dB cleaner
than what the product captures.** WhatsApp gates and denoises before the file
exists. The model *ranking* from that evaluation holds — every model saw the same
audio — but the absolute figures do not transfer. Voxtral's 96% was measured on
audio the product will never see.

One recording in fifteen (`05-a900ad24`) came in at **4.9 dB SNR with 29% of its
energy in the speech band**. That is not a transcription problem; it is a
recording that should never have become an interaction record.

## The silence trimming is fine, and I was wrong about it

A first measurement suggested the −35 dB rule was discarding a quarter of the
speech. That measurement was wrong: it counted individual quiet frames, while the
product removes silence *runs* of 0.6 seconds or more, which is far gentler.

Modelled correctly, against Silero VAD as the reference:

| | |
|---|---|
| Current rule keeps | 80.4% of audio |
| Silero would keep | 80.9% |
| Speech the current rule discards | **4.6%** |
| Non-speech the current rule keeps | 3.9% |

Half a percentage point apart. **There is no accuracy case for replacing it
today.** The case appears only under always-on capture, below.

## Do not add a denoiser

The instinct is to clean the audio before transcribing. The 2026 research says
that is backwards for modern ASR: a systematic study across forty configurations
found speech enhancement *degraded* recognition in **every one**, by between 1.1%
and 46.6%. Whisper and Voxtral were trained on real, noisy, imperfect audio; a
denoiser removes the noise they expect and leaves artefacts they have never seen.

At 22.7 dB SNR we are nowhere near the regime where enhancement earns its
artefacts. Nothing here should get a denoiser, a dereverberator, or a spectral
gate.

## What is worth doing

### 1. Stop recording what is not a conversation

This is the only change that matters at the scale being contemplated, and it is
worth more than every other item combined.

Two hundred hours per employee per month is a nine-hour shift recorded
end to end. The test recordings are 80% speech because they are role-plays
performed into a phone; a real shift is not. If a representative spends a quarter
of the day actually talking to customers, then **200 hours of recording contains
perhaps 30 to 50 hours of conversation**, and everything downstream — upload,
storage, GPU, cost — is being paid four to six times over.

The lever is capture, not processing. Audio never recorded costs nothing to
store, nothing to upload, and nothing to transcribe.

Silero VAD is 1.8 MB of ONNX and runs comfortably on a phone in real time. Gating
capture on it removes true silence at source. But speech is not the same as
conversation: it will also keep the representative talking to a colleague, the
next aisle's customer, and any music with a vocal. Closing that gap needs
*sustained two-party* speech, which is a diarization question rather than a VAD
one — cheapest as a short server-side pass that segments a day into candidate
conversations before anything is transcribed.

**Recommendation:** VAD-gate on the device to drop silence, segment into
conversations on the server, transcribe only what survives both.

### 2. Settle the capture processing question by testing it, not by arguing

The app currently requests all three of the browser's voice-processing features:

```
autoGainControl: true, echoCancellation: true, noiseSuppression: true
```

These are tuned for telephony — one near-field speaker, a far-end signal to
cancel. A two-party conversation at arm's length is not that. Echo cancellation
has no far-end signal to work with here and can attenuate whoever is quieter.
The browser's noise suppression is exactly the kind of enhancement the research
above finds harmful.

Against that: measured across the four scripted recordings, the two speakers
arrive **2.1 dB apart**, so nothing is being badly under-captured today, and
turning the processing off could make a real room worse rather than better.

This is genuinely empirical and cheap to settle. Record one script twice, once
with the constraints on and once off, and score both with the harness in
`scripts/asr-eval/`. Two recordings and ten minutes of GPU decide it.

**Recommendation:** test before changing. Do not turn them off on principle.

### 3. Capture at 16 kHz

The product currently uploads **AAC, 22.05 kHz, mono, 48 kbps**, and every model
resamples to 16 kHz on arrival. Capturing at 16 kHz directly removes about a
quarter of the bytes at no cost to accuracy, because nothing downstream ever sees
the discarded band.

48 kbps mono AAC is adequate for speech and not worth changing on its own.

### 4. Refuse recordings too poor to use

`05-a900ad24` should have been rejected at ingest. Computing SNR and speech-band
share when a recording lands is a few milliseconds, and it lets the product say
"this recording cannot support an interaction record" instead of producing a
confident record built on noise.

This is the same rule the product already applies everywhere else: a correct
abstention beats an invented fact. It belongs on the recording, next to duration,
so a manager can see *why* a conversation produced nothing.

### 5. Flag overlapping speech rather than transcribing it

People talk over each other, and a transcriber handed overlapped audio does not
fail — it invents a plausible sentence. pyannote already detects overlap; the
worker should mark those segments so a claim resting on one can be treated with
the suspicion it deserves.

### 6. Enrol the representative's voice

The product has a rule that the provider's first speaker must never be assumed to
be the representative, and a mapping step that works around not knowing. A single
enrolment recording per representative turns that from a heuristic into a lookup:
compare each diarized speaker against the stored embedding and the answer is
deterministic.

This removes an entire class of error — every downstream figure that depends on
which half of the conversation was the representative — for about thirty seconds
of setup per person.

## Ranked

| | Change | Effort | Worth |
|---|---|---|---|
| 1 | VAD-gated capture + conversation segmentation | High | 4–6× cost reduction; nothing else comes close |
| 2 | Quality gate at ingest | Low | Stops silent corruption of the aggregates |
| 3 | Speaker enrolment | Medium | Removes a class of attribution error |
| 4 | A/B the capture constraints | Low | Unknown until measured; could be significant |
| 5 | Capture at 16 kHz | Low | ~25% fewer bytes, no accuracy cost |
| 6 | Overlap flagging | Low | Honesty about a known failure |
| — | **Denoising** | — | **Do not. Research says it hurts.** |
| — | **Replacing the −35 dB VAD** | — | **Not today.** Revisit under always-on capture |

## What still needs measuring

The evaluation that chose Voxtral ran on WhatsApp-processed audio. Before
committing to it in production, re-run the harness on recordings the product
captured itself — the files are already there, and the scoring is already
written. That is the honest test of whether 96% survives contact with a real
microphone.
