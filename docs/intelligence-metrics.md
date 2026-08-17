# Intelligence metrics

Generated from `src/modules/intelligence/metric-registry.ts` by
`scripts/generate-metric-docs.mts`. Edit the registry, not this file.

Every percentage on an Intelligence page comes from a definition below. A
component may render a rate; it may never decide one. Where a formula is an
approximation of the one we actually want, it is marked **provisional** with
the reason — those are shown as approximate on the page too, rather than
rounded into a precise-looking figure.

## Sample and coverage guardrails

- Fewer than 10 eligible interactions: no comparative claim is promoted.
- 10–29: shown, marked directional only.
- 30 or more: directional comparison allowed.
- 100 or more: reasonable for trend reading, still not a guarantee.
- Coverage below 70%: the metric is not used as a headline.

These are product guardrails. Nothing here is a significance test, and none
of it says a difference is real.

## Performance, measured

Against the hosted database with sixty interactions in the window, each read
takes roughly half a second and the SQL inside it takes two milliseconds. The
plan for the largest read is an index scan on `field_values_field_idx`
returning three thousand rows in under 2ms. The cost is round trips, not
query execution.

The consequence: adding indexes would buy nothing. Consolidating each page
into a single RPC returning one payload would remove four or five round trips
and is the optimisation worth making when latency starts to matter. It is not
urgent at this volume, and it would cost the unit-testability that computing
in TypeScript currently buys, so it is recorded rather than done.

One read is paged deliberately: the API caps a select at a thousand rows and
sixty interactions carry roughly three thousand field values, so an unpaged
read silently returns a third of the data.

## Corrections

Corrections replace text or reject a value. A numeric amount, a currency, a requirement label or a pitch hierarchy level cannot be corrected in place — rejecting the value is the only way to keep it out of a metric.

## Customer demand

### Analysed interactions

`analysed_interactions` · count · interaction grain · neutral

**Question.** How much of what happened on the floor did we actually see?

**Counts.** Conversations with a completed analysis in the period, counted once each.

**Eligible.** One row per conversation, using its latest completed interaction record.

**Drill-down shows.** purchase_category, arrival_intent_state

### Arrived knowing what they wanted

`high_intent_arrival` · percent · interaction grain · contextual

**Question.** Is the traffic getting more decided, or less?

**Counts.** Customers who arrived asking for a specific product or ready to buy, as a share of those whose arrival intent could be classified.

**Eligible.** One row per conversation, using its latest completed interaction record.

**Numerator.** arrival intent is specific_product or ready_to_buy

**Denominator.** interactions where arrival intent was classified

**Depends on.** arrival_intent_state

**Drill-down shows.** arrival_intent_state, initial_request, purchase_category

### Median stated budget

`median_target_budget` · money · interaction grain · neutral

**Question.** What are customers telling us they want to spend?

**Counts.** The median of budgets customers actually stated. Interactions where no budget was mentioned are excluded, never counted as zero.

**Eligible.** One row per conversation, using its latest completed interaction record.

**Denominator.** interactions where a target budget was stated

**Depends on.** target_budget

**Drill-down shows.** target_budget, maximum_budget, purchase_category

### Room above the stated budget

`budget_stretch` · money · interaction grain · neutral

**Question.** How much more will customers go to if the product is right?

**Counts.** Median gap between the maximum a customer would go to and the budget they opened with. Only interactions that stated both.

**Eligible.** One row per conversation, using its latest completed interaction record.

**Denominator.** interactions stating both budgets, where maximum is at least the target

**Depends on.** target_budget, maximum_budget

**Drill-down shows.** target_budget, maximum_budget

### Requirements became clearer

`clarity_improved` · percent · interaction grain · higher is better

**Question.** Are these conversations helping customers work out what they need?

**Counts.** Interactions where the customer's requirement was clearer at the close than on arrival, among those where both states were readable.

**Eligible.** One row per conversation, using its latest completed interaction record.

**Numerator.** closing clarity is higher than opening clarity

**Denominator.** interactions with both clarity states

**Depends on.** requirement_clarity_start, requirement_clarity_end

**Drill-down shows.** requirement_clarity_start, requirement_clarity_end

### Asked about finance

`finance_demand` · percent · interaction grain · contextual

**Question.** How many customers need help paying?

**Counts.** Interactions where the customer raised finance, EMI or instalments themselves.

**Eligible.** One row per conversation, using its latest completed interaction record.

**Depends on.** finance_requested

**Drill-down shows.** finance_requested, target_budget

### Brought up a competitor

`competitor_pressure` · percent · interaction grain · lower is better

**Question.** How often are we being shopped against someone else?

**Counts.** Interactions where the customer named another retailer or quoted their price.

**Eligible.** One row per conversation, using its latest completed interaction record.

**Depends on.** competitor_named

**Drill-down shows.** competitor_named, competitor_product, competitor_price_claim

### Told us what would close it

`purchase_conditions_stated` · percent · interaction grain · neutral

**Question.** What are customers explicitly saying they need before they buy?

**Counts.** Unresolved interactions where the customer stated an explicit condition for purchase. This is what they said, not our guess at what would have worked.

**Eligible.** Interactions that did not end in a sale and were not declined outright.

**Depends on.** customer_purchase_conditions

**Drill-down shows.** customer_purchase_conditions, primary_non_conversion_reason

### Outcome established

`outcome_classified` · percent · interaction grain · higher is better

**Question.** How often do we actually know whether the visit became a sale?

**Counts.** Interactions where the business outcome was settled as a sale or no sale. An interaction that simply stops is not counted either way.

**Eligible.** One row per conversation, using its latest completed interaction record.

**Depends on.** confirmed_business_outcome

**Drill-down shows.** confirmed_business_outcome, outcome_basis, final_decision_state

## Customer decision journey

### Left with a clear requirement

`requirement_clear_at_close` · percent · interaction grain · higher is better

**Question.** Of the customers who came in decided, how many left knowing what they need?

**Counts.** Cohort interactions whose closing requirement clarity was medium or high.

**Eligible.** The selected journey cohort.

**Depends on.** requirement_clarity_end

**Drill-down shows.** requirement_clarity_end, specification_requirements

### Settled on a product

`preference_formed` · percent · interaction grain · higher is better

**Question.** How many got as far as choosing something?

**Counts.** Cohort interactions where the customer ended on a specific preferred product.

**Eligible.** The selected journey cohort.

**Depends on.** final_preferred_product

**Drill-down shows.** final_preferred_product, products_considered

### Showed they were ready

`commitment_signalled` · percent · interaction grain · higher is better

**Question.** How many customers gave a buying signal?

**Counts.** Cohort interactions with at least one explicit commitment signal from the customer.

**Eligible.** The selected journey cohort.

**Depends on.** customer_commitment_signals

**Drill-down shows.** customer_commitment_signals, close_attempts

### Conversation sale rate

`conversation_sale_rate` · percent · interaction grain · higher is better

**Question.** How many of the conversations we recorded became sales?

**Counts.** Cohort interactions confirmed as a sale, among those where the outcome was established. Not a store conversion rate — these are recorded conversations, not footfall.

**Eligible.** The selected journey cohort with an established outcome.

**Depends on.** confirmed_business_outcome

**Drill-down shows.** confirmed_business_outcome, outcome_basis

## Frontline

### Recommended something

`recommendation_rate` · percent · interaction grain · higher is better

**Question.** Are reps actually putting a product forward?

**Counts.** Interactions where the representative recommended at least one product.

**Eligible.** One row per conversation, using its latest completed interaction record.

**Depends on.** products_recommended

**Drill-down shows.** products_recommended, recommendation_reasons

### Gave a reason for it

`recommendation_rationale` · percent · interaction grain · higher is better

**Question.** When reps recommend, do they say why?

**Counts.** Interactions containing a recommendation that also contain at least one stated reason.

**Eligible.** Interactions with at least one recommendation.

**Depends on.** products_recommended, recommendation_reasons

**Drill-down shows.** products_recommended, recommendation_reasons

**Provisional.** Matched at interaction level. The record does not yet link a reason to the recommendation it belongs to, so a rep who explained one of three recommendations counts the same as one who explained all three.

### Objections fully answered

`full_objection_handling` · percent · event grain · higher is better

**Question.** When a customer pushes back, does the rep resolve it?

**Counts.** Objection responses judged to have fully addressed the concern, among responses that were judged at all. Fully addressed does not mean the customer was persuaded.

**Eligible.** Objection responses evaluated as full, partial or none.

**Depends on.** objections, objection_response

**Drill-down shows.** objections, objection_response

### Showed the product

`demo_rate` · percent · interaction grain · higher is better

**Question.** Are reps demonstrating when it would help?

**Counts.** Interactions where a demo happened, among those where a demo was applicable. Interactions where a demo made no sense are excluded rather than counted as a failure.

**Eligible.** Interactions where the demo field was answered yes or no.

**Depends on.** product_demo_performed

**Drill-down shows.** product_demo_performed

### Finance asked for, none offered

`finance_offer_gap` · percent · interaction grain · lower is better

**Question.** When a customer asks about paying monthly, do we answer with an offer?

**Counts.** Interactions where the customer requested finance and no finance offer was recorded from the representative.

**Eligible.** Interactions where the customer requested finance and some commercial offer was recorded.

**Depends on.** finance_requested, commercial_offer_made

**Drill-down shows.** finance_requested, commercial_offer_made

**Provisional.** An offer the extraction missed is indistinguishable from an offer never made, so interactions with no recorded offer of any kind are excluded rather than counted as failures. Check the transcript on the drill-down before acting on an individual interaction.

### Pitched something alongside

`cross_sell_rate` · percent · interaction grain · higher is better

**Question.** Are we adding to the basket?

**Counts.** Interactions with at least one qualifying cross-sell pitch. Several pitches in one conversation still count as one interaction.

**Eligible.** One row per conversation, using its latest completed interaction record.

**Depends on.** cross_sell_pitch

**Drill-down shows.** cross_sell_pitch, cross_sell_hierarchy

### Moved the customer up

`upsell_rate` · percent · interaction grain · higher is better

**Question.** Are we selling the better version when it fits?

**Counts.** Interactions with at least one qualifying upward move from a baseline the customer was already on.

**Eligible.** One row per conversation, using its latest completed interaction record.

**Depends on.** upsell_pitch

**Drill-down shows.** upsell_pitch, upsell_hierarchy

### Buying signal followed by a close

`close_after_commitment` · percent · interaction grain · higher is better

**Question.** When a customer signals they are ready, does the rep ask for the sale?

**Counts.** Interactions where a close attempt came at or after the first commitment signal, among interactions with a commitment signal whose timing is known.

**Eligible.** Interactions with a commitment signal that carries evidence timing.

**Depends on.** customer_commitment_signals, close_attempts

**Drill-down shows.** customer_commitment_signals, close_attempts

### Left with a next step

`next_action_capture` · percent · interaction grain · higher is better

**Question.** When the customer does not buy today, is anything agreed?

**Counts.** Interactions where a concrete next action was recorded.

**Eligible.** One row per conversation, using its latest completed interaction record.

**Depends on.** next_action

**Drill-down shows.** next_action, purchase_timing
