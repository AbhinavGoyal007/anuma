# Metric Catalog

## Conventions

Metrics are calculated from one immutable transcription run plus one speaker-mapping version. Recalculation creates a new metric run. Durations use seconds internally; percentages store a ratio from 0 to 1 and render with catalog-defined precision.

Quality status is mandatory:

- `verified`: reviewed/confirmed by a qualified human or trusted source.
- `measured`: deterministically computed from adequate source timing/text.
- `estimated`: deterministic approximation with declared limitations.
- `inferred`: semantic model/rule classification, not direct measurement.
- `uncertain`: producer cannot support a reliable result.
- `unsupported`: source/provider cannot produce the metric.
- `insufficient_quality`: source exists but fails eligibility thresholds.
- `not_applicable`: the concept did not apply.

“Words” are tokenizer units defined by `tokenization_version`. For Hindi/Hinglish, display “estimated WPM.” Adjacent same-role segments separated only by diarization fragmentation are merged into a turn using a versioned merge rule. Participant speaking duration is the sum of attributed segment durations; it is not overlap-corrected unless future source data supports overlap reliably.

## Eligibility primitives

- `segment_duration = max(0, end_seconds - start_seconds)`.
- Eligible speech segment: valid time range, non-empty transcript, mapped role, and not marked corrupted.
- Representative roles: `representative`; customer roles: `customer` and `additional_customer` unless a view explicitly separates them.
- The denominator for a normalized turn-switch rate is provisional until real Sarvam diarization output is evaluated in Phase 4. Store all candidate denominator components so the evaluation can compare them without re-transcribing.
- Timing offsets are measured from conversation audio start, with the display optionally showing elapsed time.
- Semantic question, objection, price, discovery, and next-step events come from versioned structured analysis; related timing/count metrics are `inferred`, not `measured`.

## Conversation metrics

| Key | Unit | Formula / definition | Default quality |
|---|---:|---|---|
| `conversation.duration_seconds` | seconds | recording timeline end minus start; prefer trusted media metadata, else max segment end | measured/estimated |
| `conversation.participant_speaking_seconds` | seconds | sum of eligible participant segment durations; no claim of unique acoustic speech time | estimated |
| `conversation.word_count` | count | sum token counts across eligible participant segments | measured/estimated |

## Conversation-level quality and eligibility

Individual metric/fact quality does not by itself determine whether a conversation can safely enter aggregate analysis. A versioned `conversation_quality_assessment` records categorical `audio_quality`, `transcription_quality`, `diarization_quality`, `speaker_mapping_quality`, and `semantic_analysis_quality`, plus `analytics_eligible`, `benchmark_eligible`, `outcome_comparison_eligible`, exclusion reasons, review state, and the exact transcription/analysis/mapping inputs.

Quality dimensions use documented categorical states; no universal or composite numeric quality score is implied. Eligibility is a result of a published policy and can be reviewed or corrected while preserving the original assessment.

Analytical aggregates exclude conversations not marked `analytics_eligible`; benchmark and outcome cohorts additionally require their respective flags. Every aggregate response discloses total considered, included, excluded, unassessed, and exclusion counts by reason. Operational coverage and quality views may include ineligible conversations because their purpose is to reveal failures rather than describe customer/frontline patterns.

## Representative metrics

| Key | Unit | Formula / definition | Default quality |
|---|---:|---|---|
| `representative.speaking_seconds` | seconds | sum representative attributed segment durations | estimated |
| `representative.talk_share` | ratio | representative speaking seconds / total eligible representative + customer speaking seconds | estimated |
| `representative.word_count` | count | tokenizer count for representative segments | measured/estimated |
| `representative.estimated_wpm` | words/min | word count / representative speaking seconds × 60 | estimated |
| `representative.turn_count` | count | merged representative turns | estimated |
| `representative.average_turn_seconds` | seconds | sum representative turn durations / turn count | estimated |
| `representative.median_turn_seconds` | seconds | median representative turn duration | estimated |
| `representative.longest_monologue_seconds` | seconds | maximum merged representative turn duration | estimated |

## Customer metrics

| Key | Unit | Formula / definition | Default quality |
|---|---:|---|---|
| `customer.speaking_seconds` | seconds | sum customer-group attributed segment durations | estimated |
| `customer.talk_share` | ratio | customer speaking seconds / total eligible representative + customer speaking seconds | estimated |
| `customer.word_count` | count | tokenizer count for customer-group segments | measured/estimated |
| `customer.estimated_wpm` | words/min | customer word count / customer speaking seconds × 60 | estimated |
| `customer.turn_count` | count | merged customer-group turns | estimated |
| `customer.average_turn_seconds` | seconds | sum customer turn durations / turn count | estimated |

## Interaction metrics

| Key | Unit | Formula / definition | Default quality |
|---|---:|---|---|
| `interaction.turn_switches` | count | count adjacent eligible turns whose role group changes representative ↔ customer | estimated |
| `interaction.turn_switches_per_eligible_minute` | provisional count/min | normalized switch rate using an explicitly identified candidate denominator; not a stable benchmark metric until Phase 4 evaluation | estimated/provisional |
| `interaction.approx_response_gap_seconds` | seconds | median non-negative gap from customer turn end to next representative turn start, only when sequential timestamps are adequate | estimated/insufficient_quality |

`approx_response_gap_seconds` must disclose sample count and must not be rendered with sub-second precision. It is not a response-latency score.

Candidate denominators for `turn_switches_per_eligible_minute` are:

1. total conversation duration excluding invalid/unrecorded spans;
2. total participant-attributed speaking duration;
3. bilateral-active duration containing eligible speech from both representative and customer roles;
4. elapsed duration between the first and last eligible cross-role turn.

Phase 4 must compare sensitivity to diarization fragmentation, single-speaker stretches, long pauses, and missed speaker labels using real Sarvam output before selecting or renaming the production formula. Until then, persist the denominator strategy/version and underlying seconds, avoid normative interpretation, and prefer the raw `interaction.turn_switches` metric in product claims.

## Question metrics

| Key | Unit | Formula / definition | Default quality |
|---|---:|---|---|
| `questions.representative_substantive_count` | count | substantive questions asked by representative | inferred |
| `questions.customer_substantive_count` | count | substantive questions asked by customer group | inferred |
| `questions.representative_open_count` | count | representative substantive questions classified open | inferred |
| `questions.representative_closed_count` | count | representative substantive questions classified closed | inferred |
| `questions.clarification_count` | count | substantive clarification questions by any role; retain role dimension | inferred |
| `questions.customer_fully_answered_count` | count | customer substantive questions with effective state `answered` | inferred |
| `questions.customer_partially_answered_count` | count | customer substantive questions with effective state `partially_answered` | inferred |
| `questions.customer_unanswered_count` | count | customer substantive questions with effective state `unanswered` | inferred |
| `questions.customer_uncertain_count` | count | customer substantive questions whose linkage/state is uncertain | inferred |
| `questions.customer_full_answer_rate` | ratio | fully answered / (fully answered + partially answered + unanswered) | inferred |
| `questions.customer_weighted_answer_coverage` | policy ratio | (fully answered + policy weight × partially answered) / eligible customer questions; only when a published organization/metric policy defines the weight | inferred/policy-derived |

The raw answer states and counts are canonical. `customer_full_answer_rate` gives partial answers no credit and must appear with fully answered, partially answered, unanswered, uncertain, and not-applicable counts. A weighted coverage metric is optional and must identify the published organization/metric policy version and weight; there is no universal default such as `0.5`, and the UI must label it as policy-derived rather than objective truth. Exclude `uncertain` and `not_applicable` from rate denominators but disclose them. If there are zero eligible customer questions, rates are `not_applicable`, never 100%.

## Timing metrics

| Key | Unit | Formula / definition | Default quality |
|---|---:|---|---|
| `timing.first_substantive_discovery_seconds` | offset seconds | earliest representative substantive question mapped to a discovery topic | inferred |
| `timing.first_price_discussion_seconds` | offset seconds | earliest evidence-backed price/discount/financing-price event | inferred |
| `timing.first_objection_seconds` | offset seconds | earliest objection event; not applicable if none | inferred/not_applicable |
| `timing.first_next_step_discussion_seconds` | offset seconds | earliest evidence-backed next-step or commitment discussion | inferred/not_applicable |

## Coverage and operational metrics

These support management views but are not representative performance judgments.

| Key | Unit | Definition |
|---|---:|---|
| `operations.interaction_count` | count | eligible conversations in cohort |
| `operations.audio_coverage` | ratio | conversations with valid retained recording / cohort conversations |
| `operations.transcription_coverage` | ratio | conversations with completed active transcription / eligible uploaded conversations |
| `operations.analysis_coverage` | ratio | conversations with completed active analysis / completed transcription conversations |
| `operations.evaluation_coverage` | ratio | conversations with applicable published scorecard evaluation / analysis-ready conversations |
| `operations.outcome_label_coverage` | ratio | eligible conversations/opportunities with a qualifying outcome event / eligible cohort |
| `operations.processing_failure_rate` | ratio | conversations with terminal stage failure / attempted conversations, grouped by stage/error |
| `operations.analytics_eligibility_rate` | ratio | analytics-eligible conversations / quality-assessed conversations, with unassessed and exclusion reasons disclosed |
| `operations.benchmark_eligibility_rate` | ratio | benchmark-eligible conversations / quality-assessed conversations |
| `operations.outcome_comparison_eligibility_rate` | ratio | outcome-comparison-eligible conversations / quality-assessed conversations |

## Tracker and scorecard aggregates

| Key | Unit | Definition |
|---|---:|---|
| `trackers.present_rate` | ratio | effective `present/pass` results / applicable non-uncertain results for a tracker version |
| `trackers.uncertain_rate` | ratio | uncertain results / attempted applicable evaluations |
| `scorecards.adherence_ratio` | ratio | awarded points / applicable maximum points under one scorecard version |
| `scorecards.criterion_pass_rate` | ratio | pass results / applicable evaluated results for one criterion version |
| `scorecards.critical_failure_rate` | ratio | runs with triggered critical failure / applicable evaluated runs |
| `coaching.opportunity_frequency` | ratio | conversations containing a specific priority definition / coaching-eligible conversations |

Never aggregate across incompatible tracker/scorecard versions without an explicit compatibility mapping. `NOT_APPLICABLE` is excluded and separately counted; `UNCERTAIN` is not treated as failure.

## Customer intelligence aggregates

Each aggregate retains definition/version, numerator, denominator, sample size, cohort filter, date range, refresh time, and drill-down conversation IDs.

| Key | Unit | Definition |
|---|---:|---|
| `customer.need_frequency` | ratio/count | conversations with effective need definition/entity |
| `customer.question_frequency` | ratio/count | conversations/questions by normalized topic |
| `customer.unanswered_question_frequency` | ratio/count | unanswered/partial customer questions by topic |
| `customer.objection_frequency` | ratio/count | conversations/objections by objection definition |
| `customer.competitor_mention_frequency` | ratio/count | conversations with competitor entity mention |
| `customer.price_objection_frequency` | ratio/count | conversations with price-family objection |
| `customer.feature_request_frequency` | ratio/count | conversations/facts by feature entity |
| `customer.financing_concern_frequency` | ratio/count | conversations with finance/EMI question or objection |
| `customer.warranty_concern_frequency` | ratio/count | conversations with warranty question or objection |
| `customer.availability_issue_frequency` | ratio/count | conversations with stock/waiting-period issue |

Counts distinguish `mention_count`, `object_count`, and `conversation_count`. Management copy must name the denominator—for example, “31% of 84 electronics conversations.”

## Outcome intelligence metrics

Outcome comparisons require a matching conversation quality assessment with `outcome_comparison_eligible`, a published eligibility policy, outcome window, compatible vertical event definitions, adequate outcome coverage, and minimum sample in every cohort.

| Key | Unit | Definition |
|---|---:|---|
| `outcomes.eligible_count` | count | conversations/opportunities meeting comparison policy |
| `outcomes.labelled_count` | count | eligible records with qualifying outcome event in window |
| `outcomes.additional_needed` | count | max(0, configured maturity threshold − labelled count), also evaluated per cohort |
| `outcomes.feature_rate_by_cohort` | ratio | conversations containing a compatible observation, metric, tracker, or score-result condition / eligible outcome cohort |
| `outcomes.rate_difference` | percentage points | feature rate cohort A − cohort B, descriptive only |

Maturity labels are proposed as:

- fewer than 20 eligible: no statistical benchmark;
- 20–49: preliminary observation;
- 50–99: emerging benchmark;
- 100+: established descriptive benchmark.

These thresholds are governance defaults subject to pilot validation and do not override per-cohort sufficiency or quality eligibility. Always show each cohort's `n`, along with excluded/unassessed counts; suppress comparison when either cohort is below the approved minimum. Do not use words such as “drives,” “causes,” or “improves conversion.”

## Unsupported precision in the MVP

Do not calculate or market exact interruption count, overlap duration, silence analysis, sub-second response latency scores, detailed backchannels, or emotional/psychological voice inference. Catalog placeholders may exist with status `unsupported`, but they do not appear as numeric UI values.

## Formula safeguards

- Zero denominators yield `not_applicable`, never zero or 100% by convention.
- Store numerator and denominator for every ratio.
- Store source run IDs, algorithm/formula version, tokenizer version, merge thresholds, and eligibility diagnostics.
- Round only for display; calculations retain database precision.
- Recompute when transcription or speaker mapping changes; do not silently attach old metrics to new active evidence.
- Unit tests cover empty audio, one speaker, unknown speakers, code-mixed text, fragmented segments, invalid timing, zero speech seconds, multiple customers, and uncertain semantic states.

## Decisions before implementation

1. Approve tokenizer strategy and how “estimated word” is communicated for Hindi/Hinglish.
2. Select or revise the normalized turn-switch denominator after Phase 4 evaluation of real Sarvam output.
3. Decide whether any pilot organization needs a published partial-answer weighting policy; raw counts and full answer rate remain canonical.
4. Validate categorical audio/transcript/diarization/mapping/analysis eligibility rules against pilot data.
5. Define outcome eligibility/window and minimum sample per compared cohort.
