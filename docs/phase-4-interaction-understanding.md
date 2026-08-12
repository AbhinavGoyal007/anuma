# Phase 4 — Interaction Understanding

Phase 4 turns a completed, explicitly speaker-mapped interaction into reusable, evidence-backed structured observations. It does not add recording, transcription, scorecards, coaching, or aggregate intelligence.

## Flow

```text
active transcript + active human speaker mapping
  -> deterministic metric run (phase4.v1)
  -> one OpenAI structured extraction
  -> validate cited segment IDs against that transcript run
  -> immutable observations + evidence groups/references
  -> explicit active analysis run
```

The transcript is treated as hostile input, never as model instructions. OpenAI is used only through the server-side `AnalysisProvider`; browser code receives no provider credential. Existing structured observations and deterministic computation are preferred before requesting new model interpretation.

## Stored foundation

`structured_observations` is immutable model output with known query keys, typed value fields, original model value, and an evidence group. `metric_runs` and `metric_values` store versioned deterministic measurements. `observation_corrections` is an append-only human overlay: representatives may propose corrections to their own interactions; a scoped manager or organization admin may confirm or reject them. No correction mutates source observations or evidence.

The MVP electronics extractor supports needs/use cases, budgets, products, prices, competitors, questions, objections, barriers, decision drivers, commitments, and next actions when explicitly evidenced.

## POC money scope and retry boundary

Current deterministic major-to-minor conversion supports INR and AED, both with two minor-unit decimals. Unknown currencies return no minor-unit amount until their ISO 4217 exponent is deliberately added and tested; ANUMA does not assume a universal `×100` rule.

`analysis_runs.metric_run_id` is the durable analysis-persistence boundary. Metrics, evidence, and observations are stored atomically, so a retry with a metric-run pointer finalizes the same immutable run even when a valid extraction contains zero observations.

## Experience rules

The product remains **Evidence Editorial**: finding → context → interaction → evidence. Interaction understanding is rendered as a compact editorial list, not a dashboard wall. Sign-in demonstrates the same evidence relationship with a clearly labelled illustrative electronics conversation; it is never tenant data.

Target accessibility is WCAG 2.2 AA: semantic landmarks, labels, keyboard-equivalent evidence interactions, visible focus, non-colour status treatment, touch-friendly controls, and reduced motion.

## Deliberately deferred

Phase 4 does not introduce trackers, scorecards, coaching, aggregate management intelligence, outcome analytics, automatic speaker correction, or any Phase 5 capability.
