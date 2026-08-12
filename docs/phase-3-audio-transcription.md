# Phase 3: audio to evidence-ready transcript

## Purpose

Phase 3 adds the first real interaction-evidence journey: an authorized user can create an interaction, record customer recording-consent provenance, capture browser audio or select an existing audio file, secure it privately, and request an immutable Sarvam transcription run. The product still stops before semantic interpretation.

## Data flow

```text
Authorized representative or admin
  -> interaction + anonymous customer participant
  -> append-only customer recording consent
  -> recording metadata (exact object path)
  -> private Storage upload (RLS validates the real recording row)
  -> trusted byte-size/signature/SHA-256 verification
  -> immutable Sarvam Batch STT run (saaras:v3, codemix, diarization)
  -> durable workflow polling
  -> immutable timestamped transcript segments
  -> explicit human speaker-mapping version
  -> signed private playback + timestamp seek
```

`granted` and `not_required` allow product capture/processing. `declined`, `withdrawn`, and `unknown` block it. This is product-level consent provenance, not a finding of legal compliance.

## Security and lineage

- Browser clients use only the Supabase publishable key and their authenticated RLS session.
- `prepare_recording_upload` creates a real `recordings` row before Storage accepts an object. The path has the exact form `{org}/{conversation}/{recording}/source.ext`; Storage RLS validates all three identifiers against that row.
- The responsible representative and organization admin may prepare/process audio. A manager may review an assigned interaction but does not gain recording-write authority from that read access.
- `finalize_recording_upload` requires the expected private object. The server workflow then downloads it using the server-only trusted client and checks actual byte length, supported audio signature, and SHA-256 before provider submission.
- Runs and transcript segments are immutable. A retry may only see identical persisted segments; a conflicting provider response fails the run instead of overwriting evidence.
- A conversation holds explicit active transcription and speaker-mapping pointers. No application rule treats the newest row as permanent business truth.
- Provider labels remain provider labels until a human creates a versioned speaker-role mapping. No provider index is assumed to be the representative.

## Provider execution

The `SarvamSpeechToTextProvider` is a narrow typed adapter. It submits the verified private bytes to Sarvam Batch STT with `saaras:v3`, `codemix`, diarization, and timestamps, then normalizes only chunk-level diarized entries into milliseconds. It does not claim word-level timestamps or infer business roles.

Vercel Workflow is used for durable bounded polling: every 15 seconds for at most three hours. Sarvam's batch callback reports job status but still requires a protected result download, so polling is simpler and does not expand the public callback surface in this MVP phase. Failure state is persisted without deleting the immutable attempt. No provider request/job ID or transcript text is logged intentionally.

## Product surfaces

- **Conversations** remains a compact editorial list with real lifecycle states.
- **Interaction detail** separates context, consent provenance, private audio, transcript evidence, and speaker-role confirmation.
- **Audio capture** feature-detects `getUserMedia` and `MediaRecorder`, offers an existing-file fallback, provides a preview/discard/re-record step, and never exposes audio until the user selects “Save and process.”
- **Transcript** is an evidence document, not chat UI. Timestamp controls only seek real authorized private audio. A Coral marker denotes the source relationship.

The UI does not stage a transcript, processing diagram, speaker result, or intelligence result for an interaction that does not have one.

## Deliberately not built

This phase does not include OpenAI or any semantic extraction, facts, questions, objections, metrics, trackers, scorecards, coaching, outcome analytics, customer intelligence, management dashboards, audio-player sharing, public audio URLs, Sarvam callbacks/webhooks, or an audio re-upload/replacement workflow.

## Operational limits

- Supported browser/file MIME types: WebM, MP4/M4A, MP3, WAV, and OGG.
- Browser/server submission guard: 100 MB and two hours. Sarvam Batch STT's documented maximum is two hours per file; the smaller file-size guard prevents unbounded browser and provider transfers.
- The initial provider configuration is deliberately `saaras:v3` because it is the approved Phase 3 configuration. A provider upgrade is a new explicit configuration/version decision, not a silent overwrite.
- Client metadata is untrusted. It is checked at request time and verified again from the private object before provider submission.
