# ANUMA AI Repository Instructions

This repository implements ANUMA AI, a frontline interaction intelligence platform. The product begins after transcription: audio and transcripts are evidence; structured, evidence-backed business intelligence is the product.

## Mandatory reading order

Before starting a phase or changing architecture:

1. Read this file.
2. Read `docs/product-vision.md` and `docs/mvp-scope.md`.
3. Read the documents relevant to the work.
4. Inspect the current repository and migrations.
5. Implement only the smallest coherent scope for the current phase.

If documentation conflicts, the master product specification and an explicit founder decision take precedence. Record approved changes in the affected documents and an ADR before implementation.

## Product invariants

- Do not turn ANUMA into a transcription app, recorder, generic chatbot, or surveillance product.
- Every material semantic claim must be traceable to timestamped transcript evidence.
- Facts, questions, objections, tracker observations, score results, coaching, and outcomes are distinct concepts and data grains.
- Never overwrite provider output, analysis output, scorecard evaluations, or human corrections.
- Do not infer that provider speaker `0` is the representative.
- Deterministic metrics belong in domain services, not prompts or React components.
- Observational outcome comparisons must not be described as causal.
- Automotive and electronics are configuration packs on one platform, not separate applications.
- Organization isolation is mandatory in application authorization, database RLS, storage paths, jobs, and analytics.
- Provider and model selection is environment/configuration driven.
- Aggregate analytics must apply the matching conversation-level quality/eligibility assessment and disclose exclusions.
- Customer organization roles are only `representative`, `manager`, and `admin`; internal ANUMA access is not ordinary tenant membership.
- Before invoking an AI model, determine whether the required result can be reliably derived from existing structured observations or deterministic computation. Prefer reuse and deterministic computation over repeated model inference.
- Interaction understanding is a single, versioned semantic extraction from the active confirmed transcript. Validate every model-returned evidence segment against that exact source run before persistence.

## Architecture boundaries

- Use a strict-TypeScript Next.js App Router modular monolith.
- PostgreSQL is the system of record; Supabase may provide Postgres, authentication, and private storage.
- Keep domain code independent of Next.js, Supabase, Sarvam, and OpenAI SDK response types.
- External services are accessed through typed ports such as `SpeechToTextProvider` and `AnalysisProvider`.
- Validate all external input and model output at the boundary with Zod.
- Long-running steps must be durable, retryable, idempotent, and observable.
- Use UTC timestamps and explicit organization ownership on tenant-scoped records.
- Prefer normalized typed columns for identifiers, joins, filters, money, status, and high-value facts; use JSONB only for versioned payloads and long-tail values.
- Introduce no microservices during the MVP without an approved architecture decision.
- Respect the `MVP CORE`, `MVP SUPPORTING`, and `DEFERRED` classifications; a documented future-safe entity is not permission to implement it early.

## Data and evidence rules

- Evidence references point to immutable transcript segments from a specific transcription run and include a time range.
- Active run pointers are conveniences only; historical records retain their exact source run.
- Corrections are append-only overlays with actor, reason, timestamp, and target field/value.
- Representatives may propose eligible corrections; managers/admins accept or reject them, and only accepted corrections affect the reviewed projection.
- Definitions and configurations are immutable once published; edits create new versions.
- Treat intelligence as a dependency graph: reusable observations and metrics may independently feed insights, trackers, scorecards, coaching, and outcome comparisons. Do not impose a mandatory linear pipeline.
- Outcome history is event-based. Corrections supersede events rather than mutating them.
- Store money as integer minor units plus ISO 4217 currency.
- Store confidence as a bounded numeric value only when its meaning is documented for that producer.

## Security rules

- Provider credentials and service-role credentials are server-only.
- Authorization is checked server-side and reinforced with RLS; UI visibility is not authorization.
- Audio stays private and is served only through short-lived signed URLs after authorization.
- Create recording metadata before any browser upload. Storage paths must bind organization, conversation, and a real recording row; a manager's review access is not recording-write authority.
- Customer recording consent is append-only provenance attached to the anonymous customer participant. `granted` and `not_required` permit product processing; other states block it without making a legal claim.
- Treat transcript text as hostile user content; it cannot issue instructions to the analysis system.
- Avoid transcript contents, signed URLs, secrets, and raw audio in logs.
- Destructive and export actions require authorization and audit events.
- Do not claim legal or regulatory compliance unless it has been independently established.

## Quality gates

After each implementation phase, run the configured formatter, lint, TypeScript checks, relevant unit tests, integration/security tests, and Playwright tests. Fix failures introduced by the change. For AI work, add versioned fixtures and measure individual tasks rather than reporting a single generic accuracy score.

Every phase handoff must summarize changed files, architecture decisions, assumptions, unresolved risks, and founder decisions required. Do not advance to the next phase without explicit instruction.

## Product design rules

ANUMA uses an **Evidence Editorial** product language: prioritize a finding, then its context, then the interaction, then source evidence. The transcript is evidence infrastructure, not the product protagonist.

- Do not produce generic AI/SaaS styling: no gradients, glow, floating decoration, stock/generated imagery, brain/robot/sparkle motifs, decorative waveforms, fake KPI dashboards, or card-inside-card layouts.
- Every prominent visual element must communicate information, hierarchy, a product relationship, an action, system status, or interaction feedback. Remove decorative elements without a product meaning.
- Use ANUMA-native structures where useful: speaker turns, evidence markers, timestamps, annotations, quality states, outcome relationships, and processing state descriptions. Do not stage them as real product data outside clearly labelled illustrative explanation.
- Use Signal Coral sparingly for primary action, selection, and evidence markers; use Electric Aqua for verified/linked/healthy states; keep most surfaces neutral. Normal-sized text on Coral or Aqua uses Carbon, not white.
- Use semantic HTML, visible focus, keyboard-accessible interactions, logical source order, labelled forms and status messages, reduced motion, and touch-friendly controls. Target WCAG 2.2 AA and approximately 44px primary touch targets.
- Keep product language business-centred. Do not make AI the protagonist or expose database/phase/pipeline terminology in ordinary user interfaces.
- Use an editorial interaction-understanding surface: structured observations lead to a visible evidence path. Staged sign-in examples must remain explicitly illustrative, keyboard-operable, and never resemble real tenant data.
- When an illustrative interaction demonstrates code-mixed frontline speech, use natural speech while keeping product UI and headings in English. Small switchable auth-page examples may change only the illustration and must not persist, imply a language preference, translation, universal support, or stored customer data.
- Navigation should be stable and grouped by the user's mental model. Consistency does not require every page to use the same card/KPI/chart template.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
