# Tracker System

## Purpose and boundary

Trackers are optional organization-specific observations/checks over reusable evidence, facts, questions, objections, and deterministic metrics. They expose configurable results such as whether budget was discovered, which price was quoted, or whether a test drive was offered. Not every fact or conversation needs a tracker. Trackers are not scorecard criteria and do not assign representative performance points.

## Definition lifecycle

`tracker_definition` is the stable organization-owned identity. `tracker_version` is immutable after publication and includes:

- key, name, description, and semantic version;
- type and typed output schema;
- applicable vertical packs and interaction types;
- fact/question/objection/metric dependencies;
- applicability expression;
- detection strategy (`deterministic_rule`, `semantic_query`, or `hybrid`);
- rule version or prompt/model policy;
- evidence and confidence requirements;
- uncertainty/error policy;
- author, reviewer, checksum, status, and publish time.

A tracker set publication pins exact tracker versions. Historical results always point to the version evaluated. Editing creates a draft version; published versions are never mutated.

## MVP tracker types

1. `semantic_boolean`: evidence that an event/state is present or absent.
2. `entity_extraction`: one or more canonical entities plus surface text.
3. `numeric_extraction`: number/money/range with unit, currency, and qualifier.
4. `count`: a deterministic count over typed facts/objects.
5. `timing`: first/last occurrence offset over evidence-backed events.
6. `conditional`: an observation evaluated only when an applicability expression is true.

## Result model

Result state is one of `PRESENT`, `ABSENT`, `PASS`, `FAIL`, `NOT_APPLICABLE`, `UNCERTAIN`, or `ERROR`. `PASS/FAIL` is used only when the tracker itself defines an expected occurrence; it still does not award scorecard points.

Each result stores conversation, tracker version, tracker run, transcription/analysis/mapping source, state, typed value, evidence group, confidence, detecting rule/model and prompt version, original detector payload, error details, and effective review/correction projection.

`ABSENT` is a supported negative conclusion; `UNCERTAIN` means the evidence or producer cannot decide; `ERROR` means evaluation failed. These states are never conflated.

## Applicability expression

Use a small, safe, declarative expression language over named facts, tracker results, interaction metadata, and vertical pack values. It supports boolean operators, equality/membership, existence, and bounded comparisons. It cannot execute code, arbitrary SQL, network calls, or model prompts.

Example:

```json
{
  "all": [
    { "exists": "objection.price" },
    { "eq": ["conversation.vertical", "automotive"] }
  ]
}
```

If false, the conditional tracker is `NOT_APPLICABLE`. Missing/uncertain prerequisite data follows the published uncertainty policy and cannot silently become `FAIL`.

## Evaluation flow

1. Resolve the exact tracker-set publication and input run IDs.
2. Topologically sort dependencies; reject cycles at publication.
3. Evaluate applicability.
4. Reuse typed facts/objects and deterministic metrics before invoking semantic detection. Invoke a model only if the tracker needs genuinely new semantic interpretation that existing structured inputs cannot provide.
5. Validate the typed result and evidence constraints.
6. Persist original result and provenance transactionally.
7. Queue review for configured uncertainty, low confidence, or high-impact results.
8. Aggregate only compatible published versions and effective reviewed results.

The idempotency key includes conversation, tracker version, source run IDs, and evaluation-engine version.

## Evidence and corrections

Positive semantic results require timestamped evidence. Negative results store the evaluated scope and source runs; they must not fabricate a quote. Numeric/entity results retain the exact evidence surface and normalized value.

Human correction appends a correction record with proposer/reviewer, reason, original and corrected state/value, evidence, and provenance. The original result remains immutable. Under the MVP default, representatives may propose corrections on eligible tracker outputs in their accessible conversations; managers/admins in scope accept or reject them. Only an accepted, non-superseded correction changes the effective reviewed projection. Aggregate views select effective accepted values and can report model-only versus reviewed quality separately. The authority policy may become organization-configurable later.

## Example definitions

| Tracker | Type | Prerequisites | Output |
|---|---|---|---|
| `budget_discovered` | semantic boolean | discovery facts/questions | present/absent + evidence |
| `quoted_price` | numeric extraction | price facts | money or uncertain |
| `competitors_mentioned` | entity extraction | competition facts | entity list |
| `customer_question_count` | count | first-class questions | integer |
| `first_price_discussion` | timing | price evidence | elapsed seconds |
| `price_objection_addressed` | conditional | price objection + response link | pass/partial-compatible structured value/fail/N/A |

## Aggregation rules

Tracker rates always identify tracker version, denominator, applicable count, uncertain count, and date/cohort. `NOT_APPLICABLE` is excluded from pass/present denominators. `ERROR` and `UNCERTAIN` are disclosed as coverage/quality, not treated as failure.

## Guardrails

- Tracker prompts cannot invent score policy or coaching.
- Customer Intelligence and Outcome Intelligence may consume compatible observations directly; they must not require a tracker result.
- Tracker detection is not duplicated inside scorecards.
- No arbitrary organization-authored code or SQL.
- Published definitions require schema validation, dependency validation, evidence policy, and test fixtures.
- Numeric outputs use typed units/money; entities use canonical IDs plus original surface text.
