# Security and Privacy Architecture

## Scope and principle

ANUMA stores private human conversations and derived judgments. Security controls reduce risk but do not by themselves establish legal or regulatory compliance. Privacy, consent, labor, recording, retention, and cross-border obligations require jurisdiction- and client-specific review before pilots.

## Data classification

| Class | Examples | Baseline handling |
|---|---|---|
| Restricted conversation data | audio, transcript, evidence excerpts, customer identifiers | private storage, least privilege, short-lived access, controlled logs/exports |
| Confidential derived data | facts, objections, coaching, scores, outcomes, corrections | tenant isolation, role/scope access, audit for privileged actions |
| Confidential configuration | client playbooks, trackers, scorecards, pack extensions | tenant isolation, versioning, publication controls |
| Secret | provider/API/service keys, signing secrets | managed secret store, server-only, rotation, never database/client/logs |
| Operational metadata | run IDs, sanitized error codes, latency, cost | tenant-aware access and retention; no transcript bodies |

## Threat model

Priority threats include cross-tenant data access, overly broad manager/support access, leaked signed audio URLs, service-role misuse, insecure storage paths, prompt injection from transcript content, malicious files, unauthorized exports, stale memberships, configuration tampering, sensitive logging, retry duplication, and incomplete deletion.

## Identity and authorization

- Supabase Auth provides identity; organization membership and authorization are application data.
- Resolve organization and scope server-side from the session and active membership.
- Customer organization roles are only representative, manager, and admin. A user may hold memberships in multiple organizations, but one active organization context is authorized per request.
- Representatives access their own interactions. Managers access assigned teams/locations. Admins access their organization and configuration.
- Representatives may propose corrections on eligible outputs; managers/admins in scope accept or reject them. Correction review never overwrites original provider/model output.
- Sensitive actions—export, playback signing, retention change, deletion, configuration publication, correction acceptance, and outcome supersession—use explicit application policies and audit events.
- Membership disablement invalidates access promptly; session lifetime and refresh behavior must be tested.

## Internal ANUMA access

`internal_quality` is not an ordinary customer organization role and is not implemented as tenant membership in the MVP. Quality evaluation uses approved synthetic, de-identified, or explicitly authorized fixtures/data. Ordinary ANUMA staff access to customer conversations is not assumed.

A future support/quality access-grant model is DEFERRED. If introduced, it must be separate from membership and require explicit purpose, tenant/scope, approver, start/expiry, least privilege, reason, revocation, prominent audit history, and customer visibility where contractually required. It must not create standing cross-tenant access.

## Database isolation

- All tenant data includes `organization_id` and RLS is enabled before pilot data.
- Policies require an active membership and, for non-admins, matching representative/team/location scope.
- Derived tables, views, functions, and materialized refresh paths must preserve tenant identity.
- Security-definer functions are exceptional, reviewed, fixed-search-path, narrowly granted, and covered by negative tests.
- Worker/service-role credentials remain server-only; workers validate job organization and operate on one tenant scope.
- RLS tests attempt read, write, update, delete, RPC, relationship inference, and object-signing attacks across two tenants and every role.

## Audio and object storage

- Buckets are private; keys use unguessable organization/conversation/recording identifiers.
- Upload is authorized and constrained by MIME, size, duration, checksum, and organization quota; file headers are inspected rather than trusting extensions.
- Playback uses a server endpoint that reauthorizes and issues a short-lived signed URL. Signed URLs are never stored or logged.
- Provider ingestion uses the narrowest supported access path and expiration.
- Configure encryption, lifecycle/retention, malware-risk handling, orphan cleanup, and deletion reconciliation.

## Consent and privacy lifecycle

- Capture consent status, method, policy/version, time, actor, participant scope, and jurisdiction metadata before or with recording.
- Product behavior for declined, unknown, or withdrawn consent must be configured with counsel/client approval.
- Minimize customer PII and support pseudonymous external references.
- Retention policy is versioned by data class (audio, transcript, derived data, provider payloads, audit).
- Deletion is an idempotent workflow across storage, database children, aggregates/search indexes, backups according to policy, and provider artifacts where supported.
- Legal hold and audit tombstones, if needed, require an explicit approved policy.
- Exports are scoped, authorized, rate-limited, encrypted in transit, expiry-controlled, and audited.

## Provider and model security

- Provider credentials live in managed server secrets with separate environments and rotation.
- Transcript text is untrusted data, delimited from system instructions, and cannot select tools, URLs, schemas, or destination organizations.
- Analysis jobs expose no arbitrary tools, database access, or model-generated SQL.
- Validate model output against strict Zod/JSON schemas, canonical IDs, evidence ownership, timestamp bounds, and allowed enums.
- Do not send more PII/context than the task requires. Record provider, model, region/retention settings, and data-use terms in the vendor register.
- High-impact or low-confidence findings are reviewable; automation does not make employment or customer-impacting decisions.

## Application and API security

- Use server actions/route handlers with consistent authentication, authorization, input validation, CSRF-aware mutation patterns, and rate limits.
- Set secure, HTTP-only, same-site cookies and a restrictive Content Security Policy compatible with required providers.
- Encode output normally; never render transcript/model HTML unsanitized.
- Avoid direct object identifiers as authorization proof.
- Validate webhook signatures, timestamps, replay/idempotency keys, and provider request mapping.
- Protect recording endpoints from unintended background capture; display clear active-recording and consent state.

## Audit and monitoring

Audit login/security events, playback signing, restricted record access where required, export, configuration publication, membership/role changes, corrections, outcome changes, active-run promotion, retention policy changes, deletion, and internal access. Store actor, organization, action, target, timestamp, request/correlation ID, and safe result metadata.

Logs and traces must redact secrets, tokens, signed URLs, transcript/audio content, raw provider payloads, and unnecessary PII. Alert on repeated authorization denial, bulk access/export, service-role anomalies, webhook failures, stuck deletion, and processing cost spikes.

## Security verification before pilot

- Automated two-tenant RLS and storage-isolation suite.
- Authorization matrix tests for every server mutation/query.
- Signed URL expiry and revocation-behavior tests.
- Upload abuse, size/type, and orphan cleanup tests.
- Prompt-injection and evidence-forgery fixtures.
- Secret scanning/dependency review and production header/cookie checks.
- Backup/restore and deletion reconciliation exercises.
- Threat-model review and an incident response contact/runbook.

## Open decisions

1. Pilot jurisdictions, consent wording, and controller/processor roles.
2. Data/storage/provider regions and cross-border restrictions.
3. Default and maximum retention per data class.
4. Whether and when the DEFERRED internal access-grant model is needed, plus approval and customer-visibility requirements.
5. Customer PII fields truly required for pilot operations.
6. Export/deletion SLA, backup expiry, and legal hold policy.
7. Whether client data may be used for model evaluation beyond delivering the service.
