# Phase 1 application foundation

Phase 1 establishes the ANUMA application shell only. It provides Supabase email/password authentication, protected application routes, explicit empty states and a responsive navigation frame. It intentionally introduces no business-domain database schema, recordings, transcription, AI analysis, trackers, scorecards or analytics.

## Typography

The interface uses a system sans-serif stack with `Noto Sans Devanagari`, `Nirmala UI` and `Segoe UI` fallbacks. This preserves legibility for English and Devanagari content without adding a remote font dependency to the application foundation.

## Authentication boundary

The app uses Supabase SSR cookie clients. `proxy.ts` refreshes verified claims while the protected layout obtains the authenticated user on the server before rendering the application shell. Supabase project email-confirmation settings determine whether a newly registered user gets a session immediately or must confirm their email first.

## Future boundaries

The `modules/identity/future-boundaries.ts` module documents TypeScript-only future placeholders for organization, team, user profile and access role context. No corresponding data model, migration or client-specific role system is introduced in Phase 1.
