# MVP Scope

## Boundary

The MVP is a pilot-ready modular monolith for automotive and electronics retail. It covers capture, evidence, deterministic interaction metrics, structured intelligence, client configuration, evidence-backed evaluation, limited coaching, management intelligence, and manual outcome capture.

Phase 0 creates architecture documentation only. Later phases must be explicitly authorized and executed sequentially.

## Intelligence dependency principle

ANUMA is a dependency graph, not a mandatory linear pipeline. Evidence-backed observations and deterministic metrics are reusable inputs with independent consumers:

- structured facts, questions, and objections can feed Customer Intelligence directly;
- deterministic metrics can feed Frontline Performance directly;
- observations can feed optional organization-specific trackers;
- tracker results can optionally feed organization-specific scorecards;
- evidence, observations, tracker results, scorecard criteria/results, and an approved client playbook can feed limited coaching;
- external outcome events exist beside conversation intelligence and may be joined directly to compatible observations, metrics, tracker results, or score results for descriptive Outcome Intelligence.

No customer needs every tracker or a scorecard, and Customer Intelligence and Outcome Intelligence must not depend on scorecards. A new processing layer must create or standardize reusable information, apply client-specific interpretation, enable a decision/action, or link the interaction to external business truth; otherwise it does not belong in the MVP.

## In scope by capability

### Capture and evidence

- Authenticated organization users, teams/locations, and representatives.
- Mobile-web recording and audio upload with consent metadata.
- Private storage, retention metadata, short-lived signed playback, and deletion workflow.
- Durable asynchronous transcription and analysis.
- Sarvam Saaras v3 batch transcription behind `SpeechToTextProvider`.
- Hindi, Hinglish/code-mixed Hindi-English, and Indian English for pilot evaluation.
- Diarized, timestamped, normalized transcript with correctable speaker roles.
- Searchable transcript and evidence-driven audio seeking.

### Objective metrics

- Conversation, participant, representative, customer, interaction, question, and timing metrics defined in `metrics-catalog.md`.
- Deterministic calculation where possible, explicit producer and quality status, and no unsupported precision.
- Versioned conversation-level quality assessment and explicit analytics, benchmark, and outcome-comparison eligibility with disclosed exclusions.

### Structured intelligence

- Versioned semantic facts with evidence and provenance.
- First-class questions, responses, objections, and response/handling links.
- Evidence-backed decision drivers, purchase barriers, deferral reasons, and explicit loss signals kept distinct from authoritative outcome events.
- Automotive and electronics vertical packs using shared definitions plus pack configuration.

### Client configuration and evaluation

- Versioned tracker definitions and organization-specific tracker sets.
- Versioned scorecards consuming facts/trackers rather than redetecting events.
- Applicability-aware score results and evidence requirements.
- At most two coaching strengths and one to three improvement priorities.
- Generic coaching clearly labelled unless derived from an approved client playbook.
- Append-only correction proposals and reviews: representatives may propose; managers/admins accept or reject.

### Management and outcomes

- Conversation Intelligence as the strongest detail surface.
- Customer Intelligence and Frontline Performance aggregate views with filters and drill-down.
- Manual event-based automotive and electronics outcomes.
- Optional commercial-thread association for multiple interactions/outcome events; no CRM opportunity management.
- Gated Outcome Intelligence with learning-state progress and descriptive, adequately sampled comparisons.

### Internal quality

- Immutable model runs and provenance.
- Task-specific evaluation fixtures for entities, numerics, speaker attribution, questions, answer linkage, objections, trackers, cost, and latency.
- Synthetic, de-identified, or explicitly authorized fixtures/data; no routine `internal_quality` membership in customer organizations.

## Implementation priority

| Classification | MVP treatment |
|---|---|
| **MVP CORE** | tenancy and customer roles; conversations/capture/consent; transcription and speaker mapping; evidence; structured intelligence including questions, objections, and decision observations; deterministic metrics; conversation quality/eligibility; trackers, scorecards, coaching; correction workflow; manual outcome events; core intelligence views |
| **MVP SUPPORTING** | durable processing attempts, minimum reproducibility registries, pilot-critical audit/retention/deletion, review queue where required, vertical dictionaries/aliases, fixture-based quality evaluation, and a minimal opportunity/conversation association only when a pilot requires it |
| **DEFERRED** | general custom dimensions, generalized entity-master tooling, internal ANUMA tenant-access grants, advanced experiment management, CRM-style opportunity workflows, automated integrations, exports/report builders, and enterprise legal-hold machinery |

Deferred concepts remain documented for future-safe grain and ownership, but their presence in Phase 0 is not permission to implement them in Phase 1 or Phase 2.

## Explicit exclusions

- Native mobile applications, live/whisper coaching, or real-time transcription requirements.
- Emotion, personality, age, gender, or psychological inference.
- Public representative leaderboards or elaborate gamification.
- Predictive conversion scoring or causal claims.
- Cross-client benchmarks during the MVP.
- General ask-your-data chat, unrestricted model-to-SQL, and AI report builders.
- CRM, dealer-management, ERP, or automated outcome integrations.
- CRM opportunity management, pipeline forecasting, or sales-task management; the optional opportunity record is only a commercial-thread association.
- Government, banking, insurance, real-estate, or contact-center packs.
- Production multi-STT routing or multiple speech providers.
- Support for every Indian language.

## Phase sequence and exit criteria

| Phase | Deliverable | Exit criterion |
|---|---|---|
| 0 | Product and engineering architecture | Documents reviewed; expensive data decisions and open questions resolved or accepted |
| 1 | Application foundation | Authenticated shell, tenancy primitives, environment validation, test harness |
| 2 | Data foundation | Migrations, RLS, typed repositories, seed definitions, security tests |
| 3 | Audio to transcript | Private capture-to-review flow with retries and corrected role assignment |
| 4 | Metrics engine | Catalog formulas implemented with unit fixtures and quality statuses |
| 5 | Structured fact engine | Validated analysis output, evidence integrity, evaluation fixtures |
| 6 | Vertical packs | Automotive and electronics definitions versioned and selectable |
| 7 | Trackers, scorecards, coaching | Configurable, applicable, evidence-backed evaluation |
| 8 | Core UX | Four intelligence surfaces with drill-down and corrections |
| 9 | Outcomes and calibration | Manual events, maturity gates, descriptive comparisons |
| 10 | Pilot hardening | Reliability, privacy, audit, cost, mobile capture, and performance targets met |

## Pilot acceptance criteria

- A user can capture a consented interaction and reliably see its processing lifecycle.
- A manager can map speakers, inspect audio-linked evidence, and correct important outputs.
- The system produces typed facts, linked questions/responses, objections, next steps, metrics, tracker observations, score results, and limited coaching.
- An administrator can publish versioned tracker and scorecard configurations without changing historical evaluations.
- Managers can see aggregate findings with date range, cohort, sample size, and conversation drill-down.
- Aggregate findings disclose quality eligibility coverage and excluded/unassessed conversations.
- Outcomes are recorded as history and comparison views remain gated below declared thresholds.
- Tenant-isolation tests prove that users cannot read, mutate, sign, export, or analyze another organization's data.

## Provisional founder defaults

- A user may belong to multiple organizations; each request operates in one explicit active organization context.
- Representatives may have effective-dated team/location assignments.
- Every conversation snapshots its representative, team, and location context.
- Managers see assigned team/location scope; admins see their organization.
- The MVP UI is India/INR-first while money storage remains ISO 4217 currency capable.
- Representatives may propose corrections on eligible outputs; managers/admins approve or reject them. Original output is immutable and accepted corrections form the effective reviewed projection.
- Generic coaching is clearly labelled unless it is derived from an approved client playbook.
- Benchmark and outcome thresholds are governance defaults subject to validation against pilot data.

## Product decisions required before or during Phase 1

1. Data residency, default audio/transcript retention, legal basis, and consent wording for pilot jurisdictions.
2. Durable workflow provider and operational ownership.
3. Initial categorical quality rules and exclusion-reason taxonomy for analytics eligibility.
4. Final benchmark/outcome eligibility definitions, outcome window, and minimum per-cohort thresholds after pilot validation.
5. Whether a manager assigned to both a team and a location receives the union or intersection of those scopes.
6. Maximum recording duration/file size and supported pilot devices/browsers.
7. Initial approved client playbooks and approval ownership for evidence-backed example phrasing.
8. Whether explicitly authorized pilot conversations may be retained for offline quality evaluation, and for how long.
