# ANUMA AI — Phase 2 Secure Data Foundation

## Phase verdict

**READY FOR PHASE 3**

ANUMA now has a real, tenant-isolated persistent foundation for the end-to-end MVP. An authenticated user can create an organization atomically, become its administrator, create locations and teams, and persist an evidence-ready conversation shell with consent provenance. PostgreSQL RLS—not the UI—enforces organization and conversation scope. Private audio storage, immutable transcription/analysis lineage, explicit speaker mapping, outcome events, evidence references, and quality eligibility are prepared without implementing any Phase 3 intelligence or audio workflow.

## What Phase 2 built

The product demonstration available now is:

```text
Supabase authentication
        |
        v
Atomic first organization + admin membership
        |
        v
Real organization context ----> Locations / Teams / Effective assignments
        |                                      |
        +------------------+-------------------+
                           v
                  Persistent conversation shell
                           |
             +-------------+-------------+
             |                           |
             v                           v
      Consent provenance          Historical context snapshot

Future attachments (schema and authorization prepared only):

Private recording -> Versioned transcription -> Immutable segments
                                        |
                              Versioned speaker mapping
                                        |
                               Versioned analysis run
                                        |
                                 Evidence references

External outcome events ----------------+---------------- Quality eligibility
```

The design preserves ANUMA as a dependency graph. Outcomes sit beside interaction intelligence, evidence is reusable, and no database dependency forces observations through trackers or scorecards.

## Implemented relationship model

```text
auth.users
  1
  +--< organization_memberships >--1 organizations
             |                            |
             +--< member_assignments      +--< locations
             |       |                    +--< teams
             |       +--> location/team
             |
             +--< conversations >---------+  (organization + rep/location/team snapshot)
                       |
                       +--< conversation_participants
                       +--< consent_records
                       +--< recordings ----------------> private Storage object
                       +--< transcription_runs
                       |       +--< transcript_segments
                       |       +--< speaker_mapping_versions
                       |               +--< speaker_mapping_entries
                       +--< analysis_runs
                       +--< evidence_groups
                       |       +--< evidence_references --> transcript segment/time range
                       +--< outcome_events
                       +--< conversation_quality_assessments

conversations explicitly select nullable active transcription, speaker-mapping,
and analysis run IDs; “latest created row” is not the business rule.
```

Cross-organization composite foreign keys prevent tenant IDs and parent IDs from being mixed. Database checks enforce valid effective ranges, timestamp order, segment order/time ranges, audio paths, currency shape, and integer-minor-unit money storage.

## Tables

| Table                              | Classification | Why it exists                                                                                                | Future consumer                          |
| ---------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `organizations`                    | MVP CORE       | Tenant, locale, currency and timezone boundary                                                               | Every later phase                        |
| `organization_memberships`         | MVP CORE       | Separates authenticated identity from organization role; supports multiple organizations                     | Authorization and administration         |
| `locations`                        | MVP CORE       | Generic store/showroom/site context                                                                          | Recording setup and management analytics |
| `teams`                            | MVP CORE       | One-level frontline team context                                                                             | Scope and management analytics           |
| `member_assignments`               | MVP CORE       | Effective-dated location/team scope without rewriting history                                                | Manager/representative authorization     |
| `conversations`                    | MVP CORE       | Persistent business interaction with representative/location/team snapshots and explicit active-run pointers | All interaction phases                   |
| `conversation_participants`        | MVP CORE       | Lightweight business roles without creating a CRM contact store                                              | Speaker mapping and evidence review      |
| `consent_records`                  | MVP CORE       | Explicit consent status, method, capture actor and time                                                      | Phase 3 recording gate                   |
| `recordings`                       | MVP CORE       | Private object metadata, integrity, duration and upload lifecycle                                            | Phase 3 audio workflow                   |
| `transcription_runs`               | MVP CORE       | Immutable provider/model attempts with status, latency, cost and error lineage                               | Phase 3 transcription                    |
| `transcript_segments`              | MVP CORE       | Immutable source text, provider speaker ID and millisecond offsets                                           | Phase 3 evidence and Phase 4 extraction  |
| `speaker_mapping_versions`         | MVP CORE       | Versioned mapping provenance and future human correction                                                     | Phase 3 speaker attribution              |
| `speaker_mapping_entries`          | MVP CORE       | Explicit provider-speaker-to-participant-role entries                                                        | Phase 3 attribution and Phase 4 evidence |
| `analysis_runs`                    | MVP SUPPORTING | Versioned provider/model/prompt/taxonomy/domain-pack lineage without semantic output tables                  | Phase 4 semantic extraction              |
| `evidence_groups`                  | MVP SUPPORTING | Typed, conversation-scoped evidence containers before semantic targets exist                                 | Phase 4 observations                     |
| `evidence_references`              | MVP SUPPORTING | Relational segment/time-range references; avoids an unsupported universal graph                              | Phase 4 evidence-backed claims           |
| `outcome_events`                   | MVP CORE       | External, append-only business events with optional minor-unit value and ISO currency                        | Phase 6 outcome capture/intelligence     |
| `conversation_quality_assessments` | MVP CORE       | Nullable quality dimensions and analytics/benchmark/outcome eligibility; no fabricated scores                | Phases 3–6 quality gating                |

Transcript offsets use integer milliseconds. This represents segment/chunk timing and does not imply word-level timing.

### Intentionally deferred Phase 0 entities

Semantic facts, questions/responses and links, objections/responses and links, commitments, next actions, decision drivers, purchase barriers, metrics, trackers, scorecards, coaching, aggregate insights, CRM opportunities/sync, reporting, AI chat, benchmarks, semantic corrections, complex auditing, and internal ANUMA quality-access grants were not created. Their dependencies do not exist yet or they are outside the MVP foundation.

## RLS and authorization model

RLS is enabled on all 18 tenant-sensitive public tables. Browser clients receive only the publishable key and authenticated session; they do not receive a database URL or privileged key.

- **Administrator:** reads organization resources and manages basic configuration only inside an active admin membership's organization. Administrator access never crosses tenants.
- **Manager:** reads conversations only when an active effective-dated assignment matches the conversation's snapshotted location or team. Manager does not receive blanket organization-wide conversation access.
- **Representative:** reads conversations they represent or created. A representative does not automatically read peer conversations. Creation is restricted to self and assigned scope unless the member is an administrator.
- **Child rows:** consent, participant, recording, transcription, segment, speaker mapping, analysis, evidence, outcome and quality policies call the same parent-conversation access rule; RLS on `conversations` is not assumed to protect children automatically.
- **Storage:** `conversation-audio` is private. Policies validate the `{organization_id}/{conversation_id}/{recording_id}/...` path and require parent-conversation access for reads and permitted conversation creation scope for writes. Guessing a UUID or path does not grant access.
- **Anonymous:** public tenant tables have no anonymous table privilege; private Storage rows are invisible.

Small helper functions reduce policy duplication. Security-definer helpers have a fixed empty `search_path`, fully qualified relations, narrow execute grants, and no generalized bypass. The bootstrap function is security-definer only because it must atomically create the first tenant membership; it rejects users who already have an active membership. Conversation setup is security-invoker, so normal RLS remains authoritative.

## Executed security tests

`npm run test:security` executed against the configured hosted development database. All fixtures ran inside a transaction and were rolled back. **38 scenarios passed:**

- all 18 tables exist and have RLS enabled;
- the audio bucket exists and is private;
- first bootstrap succeeds, creates exactly one admin, and a second arbitrary bootstrap is denied;
- anonymous organization/table access is denied and private audio objects are invisible;
- Representative A can see Org A and their own conversation but not Org B, peer conversations, cross-tenant locations, teams, recording metadata, transcription runs, segments or outcomes;
- Representative A can read/write an authorized audio path but cannot read/write Org B's path;
- representative conversation creation is atomic with consent provenance;
- a representative cannot create a conversation for another representative or a cross-tenant outcome;
- Manager A can read the assigned location/team conversation but not the unassigned Org A conversation or Org B;
- Admin A can read/manage permitted Org A resources but not Org B;
- Admin B can read Org B and cannot read Org A.

These are executed PostgreSQL privilege/RLS tests using `anon` and `authenticated` roles with realistic JWT subject claims—not SQL review assertions.

## Onboarding and application changes

An authenticated user with no active membership is redirected to `/setup`. The form validates organization name, ISO country/currency and timezone server-side. `bootstrap_organization` derives identity from `auth.uid()`, creates a collision-safe slug, creates the organization and first admin membership in one transaction, and cannot be used to claim an existing organization.

The application context is server-owned and loads the current user, active memberships, organization metadata, assignments, locations and teams. An HTTP-only selected-organization cookie is accepted only after matching it to a real active membership. The shell displays real organization, role and assignment context and supports switching when multiple memberships exist.

Administration now displays real organization locale data, role, locations and teams. Admins can add basic locations and teams. Conversations now creates and lists real persistent metadata, snapshots its business context, records consent, survives refresh, and honestly reports that no audio exists.

## Real now / prepared / not built

### REAL NOW

- hosted PostgreSQL schema applied from migrations;
- Supabase authentication and atomic first-organization onboarding;
- memberships, roles, locations, teams and effective assignments;
- real server-side organization context and multi-organization selection model;
- persistent conversation shell and consent provenance;
- enforced/tested table and Storage RLS;
- private audio bucket;
- generated TypeScript database types;
- real administration and conversation foundation UI.

### PREPARED FOR FUTURE PHASE

- recording metadata and private object path;
- immutable/versioned transcription runs and segments;
- explicit/versioned speaker-role mapping;
- analysis-run provenance and active selection;
- evidence groups and segment/time references;
- external outcome events;
- conversation quality and analytics eligibility.

### NOT BUILT YET

Microphone capture, audio upload/playback, Sarvam, transcription, OpenAI calls, deterministic metrics, semantic observations, trackers, scorecards, coaching, aggregate management intelligence, outcome analytics, CRM/DMS integration, report builder, AI chat and benchmark products.

## Dependencies

- `supabase` (development): current CLI for migration application and hosted-schema type generation.
- `postgres` (development): direct, transaction-scoped security integration tests against the hosted database.

No ORM, Docker requirement, service-role credential, workflow system or application AI dependency was added.

## Migrations

1. `20260808070037_secure_data_foundation.sql` — enums, constraints, 18 tables, indexes, updated timestamps, lineage, evidence/outcome/quality foundation and tenant-safe composite relationships.
2. `20260808070100_rls_and_private_storage.sql` — grants, fixed-path authorization helpers, table policies, atomic organization bootstrap, private bucket and Storage policies.
3. `20260808071500_atomic_conversation_setup.sql` — RLS-aware atomic conversation, participant and consent creation RPC.

The migration workflow and type-generation command are documented in `README.md`. Applied migrations were not rewritten.

## Verification

Final acceptance commands and results:

| Command                 | Result                                                        |
| ----------------------- | ------------------------------------------------------------- |
| `npm run format`        | Passed                                                        |
| `npm run lint`          | Passed                                                        |
| `npm run typecheck`     | Passed                                                        |
| `npm test`              | Passed: 6 files, 12 tests                                     |
| `npm run test:security` | Passed: 38 hosted-database RLS/Storage scenarios; rolled back |
| `npm run build`         | Passed: optimized Next.js production build                    |
| `npm run test:e2e`      | Passed: 8 Chromium tests                                      |

The authenticated browser story verified no-organization setup, atomic admin creation, real shell context, Administration, location/team persistence, conversation creation, persistence after refresh, honest no-audio state, responsive navigation, sign-out, unauthorized redirect and no console or failed HTTP responses. Its unique hosted fixture was removed after execution.

## Technical debt

- Membership invitation and assignment administration have no UI. The data model and RLS behavior exist; tenant administrators need a controlled membership workflow before multi-user pilots.
- The Supabase CLI link command encountered an upstream project-metadata parser incompatibility, so hosted migration/type commands used the secure database URL/project ID workflow. Repository migrations remain reproducible.
- Evidence target bindings intentionally wait for typed Phase 4 semantic objects; forcing polymorphic target foreign keys now would weaken integrity.

## Security limitations before pilot readiness

- Phase 3 must enforce consent before upload, validate audio metadata/checksum/MIME independently, use scoped signed playback, and rerun Storage tests through the actual browser upload API.
- Production operations still need credential rotation, backup/restore validation, security monitoring, rate limits, retention/deletion policy and reviewed jurisdiction-specific consent language.
- Internal ANUMA support/quality access is deliberately absent. Any future access must be explicit, limited and audited rather than modeled as an ordinary tenant role.
- Email confirmation is enabled in the development Supabase project; the automated test provisions and removes its browser-test identity through the configured database connection without introducing a service-role key.

## Founder decisions

No founder product decision blocks Phase 3. Before a pilot, the founder must approve jurisdiction-specific consent/retention language and the operating process for inviting and assigning tenant members. These do not justify expanding Phase 2.

Phase 2 stops here. No Phase 3 functionality has begun.
