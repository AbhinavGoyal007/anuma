# Scorecard System

## Purpose and separation

Scorecards are optional organization-specific judgments about what happened. They consume compatible facts, first-class objects, deterministic metrics, and tracker results; they do not repeat extraction logic or prompt a model to rediscover the conversation. Not every customer needs a scorecard, and Customer Intelligence and Outcome Intelligence must not depend on scorecard availability.

## Versioned structure

- `scorecard_definition`: stable organization-owned identity.
- `scorecard_version`: immutable published header, applicable packs/interactions, scoring scale, critical-failure policy, playbook version, and checksum.
- `scorecard_criterion_version`: immutable criterion with name, description, weight, maximum score, applicability expression, required inputs, calculation rule, evidence requirement, uncertainty policy, and critical-failure flag.

A scorecard run pins one exact scorecard version and all input run/result IDs. Historical runs never move to a newer version automatically.

## Criterion result states

- `PASS`: criterion requirement satisfied.
- `PARTIAL`: published rule supports partial satisfaction.
- `FAIL`: applicable criterion not satisfied with adequate evidence/quality.
- `NOT_APPLICABLE`: trigger condition did not occur.
- `UNCERTAIN`: inputs are insufficient or contradictory under policy.
- `NOT_EVALUATED`: technical/configuration/dependency failure prevented evaluation.

No price objection means an objection-handling criterion is `NOT_APPLICABLE`, not `FAIL`. `UNCERTAIN` and `NOT_EVALUATED` are never silently scored as failures.

## Deterministic evaluation

Criteria use the same safe expression/rule language as trackers, extended with references to effective tracker state/value, fact existence, metric bounds, question-response state, and objection resolution. Once inputs exist, point calculation is deterministic.

Example criterion:

```json
{
  "key": "address_price_objection",
  "maximumPoints": 10,
  "applicableWhen": { "exists": "objection.price" },
  "inputs": ["tracker.price_objection_addressed"],
  "states": {
    "PASS": { "points": 10 },
    "PARTIAL": { "points": 5 },
    "FAIL": { "points": 0 }
  },
  "uncertaintyPolicy": "exclude_and_review",
  "evidenceRequired": true
}
```

## Score calculation

For an ordinary weighted score:

`score = sum(awarded points for applicable evaluated criteria) / sum(maximum points for those criteria)`

`NOT_APPLICABLE` criteria are excluded from numerator and denominator. The published uncertainty policy determines whether `UNCERTAIN` is excluded with a coverage warning or makes the total unavailable; it cannot default to zero. `NOT_EVALUATED` makes the run incomplete unless the published policy explicitly allows a partial provisional result.

Critical failure is a separate explicit outcome. It can cap or invalidate a total only according to the published version; the UI shows the triggering criterion and evidence.

## Run lifecycle

1. Resolve applicable published scorecard version.
2. Verify compatible tracker/fact/metric versions and input completion.
3. Evaluate criterion applicability and state deterministically.
4. Attach exact input IDs and evidence groups.
5. Calculate total, applicable maximum, coverage, and critical failures.
6. Persist immutable run/results and queue configured review tasks.
7. Re-evaluation after correction/configuration creates a new run with a reason and lineage link.

## Evidence and explainability

Every semantic criterion result includes evidence or explicitly documents that it is based on a deterministic aggregate of cited inputs. The UI shows criterion, state, points, applicability reason, evidence, and uncertainty. Managers can navigate evidence to audio.

## Coaching contract

Where configured, coaching is downstream of reviewed/effective observations and an approved playbook. It may consume underlying observations, evidence, tracker results, scorecard criteria/results, and the playbook; a numerical score alone is never sufficient:

- maximum two strengths;
- one to three improvement priorities;
- observed behavior and evidence;
- why it matters under the client playbook;
- a concrete recommended behavior;
- example phrasing only from an approved playbook or clearly labelled generic;
- confidence and source version.

Coaching items are not part of the numerical score and never include personality or emotion judgments.

## Publication and quality gates

Before publication, validate total weights, duplicate keys, dependency cycles, impossible applicability, missing evidence requirements, uncertainty behavior, critical-failure effects, and pack/version compatibility. Fixture tests must cover pass, partial, fail, not-applicable, uncertain, and missing-dependency cases.

## Reporting rules

- Aggregate only one scorecard version or an explicitly approved compatible family.
- Show evaluation coverage and applicable sample size with adherence.
- No public early-pilot leaderboards.
- Team/store comparisons require minimum cohort size and role-based access.
- Scores describe adherence to a client-defined process, not universal sales quality.
