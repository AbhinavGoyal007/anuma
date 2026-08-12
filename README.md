# ANUMA AI

ANUMA is an evidence-first frontline interaction intelligence product. The repository currently contains the Phase 3 audio and transcription foundation: authenticated organizations, scoped memberships, private audio evidence, immutable Sarvam transcription runs, timestamped diarized transcript segments, explicit speaker mapping, and PostgreSQL row-level security.

Phase 3 records or accepts selected audio only after customer recording consent permits it, then persists an immutable Sarvam Batch STT attempt. It does not perform semantic analysis, facts, questions, objections, trackers, scorecards, coaching, or management analytics.

## Local setup

1. Install Node.js 24.x and run `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Add the configured development project's public Supabase URL and publishable key.
4. Add server-only `SUPABASE_SECRET_KEY` and `SARVAM_API_KEY` for Phase 3 runtime processing. `SARVAM_CALLBACK_TOKEN` is reserved for a future callback endpoint; Phase 3 uses durable bounded polling because a Sarvam callback only signals job status and does not remove the need for protected result retrieval.
5. Run `npm run dev`.

`.env.local` is ignored by Git. `SUPABASE_DB_URL` is a privileged local migration/testing credential: never expose it to browser code, prefix it with `NEXT_PUBLIC_`, commit it, or paste it into source files. `SUPABASE_SECRET_KEY` and `SARVAM_API_KEY` are server-only credentials and are never sent to the browser.

## Database migrations

The ordered SQL files under `supabase/migrations` are the schema source of truth. Do not change an applied migration; add a new timestamped migration for every later correction.

The normal CLI workflow is:

```powershell
npx.cmd supabase login
npx.cmd supabase link --project-ref YOUR_PROJECT_REF
npx.cmd supabase db push
```

When the CLI is not linked, a securely configured local database URI can be used without placing it in command history:

```powershell
npx.cmd supabase db push --db-url $env:SUPABASE_DB_URL
```

Generate database types from the applied hosted schema:

```powershell
npx.cmd supabase gen types typescript --project-id YOUR_PROJECT_REF --schema public | Set-Content src/lib/supabase/database.generated.ts -Encoding utf8
```

## Verification

```powershell
npm.cmd run format
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:security
npm.cmd run build
npm.cmd run test:e2e
```

`test:security` requires `SUPABASE_DB_URL` in the local process or ignored `.env.local`. It runs actual RLS and Storage-policy scenarios in a rolled-back PostgreSQL transaction. The browser foundation test creates a uniquely named development fixture and removes it through the configured database connection after the test.

The project intentionally does not require Docker solely for hosted migration or security verification.

## Phase 3 audio flow

1. Create an interaction and record customer recording consent.
2. Add browser-recorded or existing audio after consent is `granted` or `not_required`.
3. The application creates recording metadata first, then allows one exact private Storage path: `{organization_id}/{conversation_id}/{recording_id}/source.ext`.
4. A trusted server step verifies the object size, recognizable audio signature, and SHA-256 before sending it to Sarvam Batch STT (`saaras:v3`, `codemix`, diarization and chunk timestamps).
5. A durable Vercel Workflow polls the batch job, persists immutable transcript segments, and makes the active result explicit. Provider speaker labels remain unmapped until a human saves a versioned business-role mapping.

Audio is private. Playback URLs are minted only after a normal RLS read of the recording and expire after 60 seconds. Transcript timestamps are chunk-level timestamps returned by the provider, not word-level timing.
