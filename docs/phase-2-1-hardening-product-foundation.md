# Phase 2.1 — Pre-Phase-3 hardening and product foundation

## Objective

Phase 2.1 corrects consent provenance and closes the gap between recording metadata and private Storage before any real audio enters ANUMA. It also establishes the Evidence Editorial interaction language so Phase 3 inherits a purposeful evidence product rather than generic SaaS chrome.

## Technical changes

- Conversation setup now creates a representative participant and an anonymous customer participant. The customer has no membership and no PII. Customer recording consent references that customer participant; the capturing representative remains recorded separately.
- Storage now authorizes an object only when its full `{organization}/{conversation}/{recording}/{filename}` path exactly matches a real `recordings` row.
- Metadata creation and object upload require representative responsibility for the conversation or an organization admin. A manager's review scope remains read-only unless that person is also the conversation representative.
- Migration `20260808123000_consent_and_recording_storage_hardening.sql` is forward-only; earlier Phase 2 migrations are unchanged.

```text
Authenticated user
  → conversation
    → representative participant
    → anonymous customer participant
      → customer recording-consent record
  → authorized recording metadata row
    → exact private Storage path
      → future upload (not implemented in Phase 2.1)
```

## Product experience

The interface now uses Evidence Editorial: `finding → context → interaction → evidence`. Authentication is a warm, restrained explanatory composition with an interactive illustrative conversation. Its evidence markers highlight source turns by hover, focus or click; the example is explicitly illustrative.

The shell groups Interactions, Intelligence and Configure. Conversations is now an editorial list with time, label, vertical, location/team, customer recording-consent and audio-presence state rather than repeated large cards. New interaction setup uses business language and explicitly says no audio is attached.

## Deliberate exclusions

No microphone capture, upload UI, signed playback, Sarvam, transcription, transcript UI, speaker-mapping workflow, OpenAI, semantic extraction, metrics, trackers, scorecards, coaching or management intelligence was built.

## Security model

| Actor          | Conversation read                          | Recording metadata / future upload                                                     |
| -------------- | ------------------------------------------ | -------------------------------------------------------------------------------------- |
| Representative | Own/created conversations                  | Only where the caller is the conversation representative and created the recording row |
| Manager        | Active assigned location/team review scope | No authority from review scope alone                                                   |
| Admin          | Organization scope                         | May create metadata and upload an exact organization recording path they created       |
| Anonymous      | None                                       | None                                                                                   |

Storage reads and writes require a private `conversation-audio` object to match a real row's bucket, full object path, organization, conversation and recording ID. A guessed, orphaned or mismatched third path segment cannot pass policy.

## Security test results

The hosted integration suite executed 51 transaction-rolled-back scenarios. It verified tenant isolation for organization, location, team, conversation, recording metadata, transcription metadata, segments, outcomes and private objects; anonymous read/upload denial; representative own-conversation read and valid exact-path write; orphan, wrong-conversation, wrong-organization, cross-tenant and incorrect-conversation path denial; manager review without upload authority; admin same-organization upload; and customer consent provenance.

Atomic conversation setup specifically proved two participants are created, the customer participant has no membership and uses the non-PII `Customer` label, the representative keeps the authenticated membership, and the consent record points to the anonymous customer participant.

## Design rules locked

`AGENTS.md` and `docs/design-system.md` now permanently require Evidence Editorial, product-native primitives, semantic use of Coral/Aqua, visible focus, keyboard/focus equivalents for hover disclosure, reduced motion, business-first wording, stable navigation, and the ban on generic AI visuals, decorative mock analytics and gamified surveillance cues.

### Before and after

Before this phase, the application inherited a generic dark/white split authentication pattern and a repeated conversation-card grammar. It now uses a warm typographic authentication composition that demonstrates evidence linkage, grouped navigation that reflects the product mental model, and a compact editorial interaction list that makes date, context, consent and status comparable at a glance.

### Real and illustrative

The authentication-page interaction is explicitly labelled illustrative and is the only staged conversation in this phase. It exists to teach the evidence relationship. The application continues to show only real persisted conversation metadata; it does not show fake audio, transcript, processing or intelligence.

## Verification

- `npm.cmd run format` — passed.
- `npm.cmd run lint` — passed.
- `npm.cmd run typecheck` — passed.
- `npm.cmd test` — 6 files / 12 tests passed.
- `npm.cmd run test:security` — 51 hosted RLS and Storage scenarios passed; fixtures rolled back.
- `npm.cmd run build` — passed.
- `npm.cmd run test:e2e` — 8 Chromium tests passed, including keyboard focus for the staged evidence finding, authentication, organization setup, Administration, customer-consent wording, interaction persistence, responsive navigation, sign-out and unauthorized redirects. No console or failed HTTP responses were recorded.

## Technical debt

Phase 3 must create authorized recording metadata before it can upload an object, validate real file size/type/checksum, and introduce browser upload/playback only behind those controls. Membership invitation/assignment administration remains intentionally out of scope. Jurisdiction-specific consent policy text and retention remain founder/legal decisions.

## Phase verdict

**READY FOR PHASE 3.** Customer consent now has correct participant provenance, a private audio object cannot exist through the authorized write policy without matching recording metadata, manager review is separated from write authority, and the UX foundation is verified without implementing Phase 3.
