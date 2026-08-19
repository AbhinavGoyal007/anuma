import type { AtomicFieldKey } from "@/modules/interaction-record/fields";

/**
 * What every number on an Intelligence page means, in one place.
 *
 * The rule this exists to enforce is that a component may render a rate but
 * never decide one. A denominator chosen in a chart is invisible: two panels
 * showing "62%" and "48%" for the same behaviour, because one divided by all
 * interactions and the other by the interactions where the field applied, is a
 * defect nobody can see and everybody argues about.
 *
 * The registry is also the honest place to record what a metric cannot yet do.
 * `provisional` marks a metric whose formula is an approximation of the one we
 * actually want — normally because the record stores events without stable
 * relationships between them, so "this objection got this response" has to be
 * approximated by counting. A provisional metric is shown with that stated, not
 * quietly rounded into a precise-looking figure.
 */

export type MetricModule = "customer_demand" | "customer_journey" | "frontline";

export type MetricFormat = "count" | "percent" | "money" | "distribution";

export type Directionality = "higher_is_better" | "lower_is_better" | "neutral" | "contextual";

export type MetricDefinition = {
  key: string;
  module: MetricModule;
  /** The manager-facing name. Not a column name. */
  label: string;
  /** The question a manager opened the page to answer. */
  businessQuestion: string;
  /** What is counted, in words, for the tooltip and the docs. */
  definition: string;
  grain: "interaction" | "event";
  requiredFields: AtomicFieldKey[];
  eligibilityRule: string;
  numeratorRule?: string;
  denominatorRule?: string;
  format: MetricFormat;
  directionality: Directionality;
  comparison: "previous_period" | "peer_cohort" | "none";
  /**
   * Set where the formula is knowingly an approximation, with the reason. The
   * UI must surface this rather than presenting the number as exact.
   */
  provisional?: string;
  /** Fields a drill-down should show to explain why an interaction matched. */
  drilldownFieldKeys: AtomicFieldKey[];
};

const demand = (definition: Omit<MetricDefinition, "module">): MetricDefinition => ({
  ...definition,
  module: "customer_demand",
});
const journey = (definition: Omit<MetricDefinition, "module">): MetricDefinition => ({
  ...definition,
  module: "customer_journey",
});
const frontline = (definition: Omit<MetricDefinition, "module">): MetricDefinition => ({
  ...definition,
  module: "frontline",
});

/** Every interaction analysed in the period; the default denominator. */
const BASE = "One row per conversation, using its latest completed interaction record.";

export const metricRegistry: readonly MetricDefinition[] = [
  // ---- Customer demand ---------------------------------------------------
  demand({
    key: "analysed_interactions",
    label: "Analysed interactions",
    businessQuestion: "How much of what happened on the floor did we actually see?",
    definition: "Conversations with a completed analysis in the period, counted once each.",
    grain: "interaction",
    requiredFields: [],
    eligibilityRule: BASE,
    format: "count",
    directionality: "neutral",
    comparison: "previous_period",
    drilldownFieldKeys: ["purchase_category", "arrival_intent_state"],
  }),
  demand({
    key: "high_intent_arrival",
    label: "Arrived knowing what they wanted",
    businessQuestion: "Is the traffic getting more decided, or less?",
    definition:
      "Customers who arrived asking for a specific product or ready to buy, as a share of those whose arrival intent could be classified.",
    grain: "interaction",
    requiredFields: ["arrival_intent_state"],
    eligibilityRule: BASE,
    numeratorRule: "arrival intent is specific_product or ready_to_buy",
    denominatorRule: "interactions where arrival intent was classified",
    format: "percent",
    directionality: "contextual",
    comparison: "previous_period",
    drilldownFieldKeys: ["arrival_intent_state", "initial_request", "purchase_category"],
  }),
  demand({
    key: "median_target_budget",
    label: "Median stated budget",
    businessQuestion: "What are customers telling us they want to spend?",
    definition:
      "The median of budgets customers actually stated. Interactions where no budget was mentioned are excluded, never counted as zero.",
    grain: "interaction",
    requiredFields: ["target_budget"],
    eligibilityRule: BASE,
    denominatorRule: "interactions where a target budget was stated",
    format: "money",
    directionality: "neutral",
    comparison: "previous_period",
    drilldownFieldKeys: ["target_budget", "maximum_budget", "purchase_category"],
  }),
  demand({
    key: "budget_stretch",
    label: "Room above the stated budget",
    businessQuestion: "How much more will customers go to if the product is right?",
    definition:
      "Median gap between the maximum a customer would go to and the budget they opened with. Only interactions that stated both.",
    grain: "interaction",
    requiredFields: ["target_budget", "maximum_budget"],
    eligibilityRule: BASE,
    denominatorRule: "interactions stating both budgets, where maximum is at least the target",
    format: "money",
    directionality: "neutral",
    comparison: "previous_period",
    drilldownFieldKeys: ["target_budget", "maximum_budget"],
  }),
  demand({
    key: "clarity_improved",
    label: "Requirements became clearer",
    businessQuestion: "Are these conversations helping customers work out what they need?",
    definition:
      "Interactions where the customer's requirement was clearer at the close than on arrival, among those where both states were readable.",
    grain: "interaction",
    requiredFields: ["requirement_clarity_start", "requirement_clarity_end"],
    eligibilityRule: BASE,
    numeratorRule: "closing clarity is higher than opening clarity",
    denominatorRule: "interactions with both clarity states",
    format: "percent",
    directionality: "higher_is_better",
    comparison: "previous_period",
    drilldownFieldKeys: ["requirement_clarity_start", "requirement_clarity_end"],
  }),
  demand({
    key: "finance_demand",
    label: "Asked about finance",
    businessQuestion: "How many customers need help paying?",
    definition: "Interactions where the customer raised finance, EMI or instalments themselves.",
    grain: "interaction",
    requiredFields: ["finance_requested"],
    eligibilityRule: BASE,
    format: "percent",
    directionality: "contextual",
    comparison: "previous_period",
    drilldownFieldKeys: ["finance_requested", "target_budget"],
  }),
  demand({
    key: "competitor_pressure",
    label: "Brought up a competitor",
    businessQuestion: "How often are we being shopped against someone else?",
    definition: "Interactions where the customer named another retailer or quoted their price.",
    grain: "interaction",
    requiredFields: ["competitor_named"],
    eligibilityRule: BASE,
    format: "percent",
    directionality: "lower_is_better",
    comparison: "previous_period",
    drilldownFieldKeys: ["competitor_named", "competitor_product", "competitor_price_claim"],
  }),
  demand({
    key: "purchase_conditions_stated",
    label: "Told us what would close it",
    businessQuestion: "What are customers explicitly saying they need before they buy?",
    definition:
      "Unresolved interactions where the customer stated an explicit condition for purchase. This is what they said, not our guess at what would have worked.",
    grain: "interaction",
    requiredFields: ["customer_purchase_conditions"],
    eligibilityRule: "Interactions that did not end in a sale and were not declined outright.",
    format: "percent",
    directionality: "neutral",
    comparison: "previous_period",
    drilldownFieldKeys: ["customer_purchase_conditions", "primary_non_conversion_reason"],
  }),
  demand({
    key: "outcome_classified",
    label: "Outcome established",
    businessQuestion: "How often do we actually know whether the visit became a sale?",
    definition:
      "Interactions where the business outcome was settled as a sale or no sale. An interaction that simply stops is not counted either way.",
    grain: "interaction",
    requiredFields: ["confirmed_business_outcome"],
    eligibilityRule: BASE,
    format: "percent",
    directionality: "higher_is_better",
    comparison: "previous_period",
    drilldownFieldKeys: ["confirmed_business_outcome", "outcome_basis", "final_decision_state"],
  }),

  // ---- Customer decision journey ----------------------------------------
  journey({
    key: "requirement_clear_at_close",
    label: "Left with a clear requirement",
    businessQuestion: "Of the customers who came in decided, how many left knowing what they need?",
    definition: "Cohort interactions whose closing requirement clarity was medium or high.",
    grain: "interaction",
    requiredFields: ["requirement_clarity_end"],
    eligibilityRule: "The selected journey cohort.",
    format: "percent",
    directionality: "higher_is_better",
    comparison: "none",
    drilldownFieldKeys: ["requirement_clarity_end", "specification_requirements"],
  }),
  journey({
    key: "preference_formed",
    label: "Settled on a product",
    businessQuestion: "How many got as far as choosing something?",
    definition: "Cohort interactions where the customer ended on a specific preferred product.",
    grain: "interaction",
    requiredFields: ["final_preferred_product"],
    eligibilityRule: "The selected journey cohort.",
    format: "percent",
    directionality: "higher_is_better",
    comparison: "none",
    drilldownFieldKeys: ["final_preferred_product", "products_considered"],
  }),
  journey({
    key: "commitment_signalled",
    label: "Showed they were ready",
    businessQuestion: "How many customers gave a buying signal?",
    definition:
      "Cohort interactions with at least one explicit commitment signal from the customer.",
    grain: "interaction",
    requiredFields: ["customer_commitment_signals"],
    eligibilityRule: "The selected journey cohort.",
    format: "percent",
    directionality: "higher_is_better",
    comparison: "none",
    drilldownFieldKeys: ["customer_commitment_signals", "close_attempts"],
  }),
  journey({
    key: "conversation_sale_rate",
    label: "Conversation sale rate",
    businessQuestion: "How many of the conversations we recorded became sales?",
    definition:
      "Cohort interactions confirmed as a sale, among those where the outcome was established. Not a store conversion rate — these are recorded conversations, not footfall.",
    grain: "interaction",
    requiredFields: ["confirmed_business_outcome"],
    eligibilityRule: "The selected journey cohort with an established outcome.",
    format: "percent",
    directionality: "higher_is_better",
    comparison: "previous_period",
    drilldownFieldKeys: ["confirmed_business_outcome", "outcome_basis"],
  }),

  // ---- Frontline ---------------------------------------------------------
  frontline({
    key: "recommendation_rate",
    label: "Recommended something",
    businessQuestion: "Are reps actually putting a product forward?",
    definition: "Interactions where the representative recommended at least one product.",
    grain: "interaction",
    requiredFields: ["products_recommended"],
    eligibilityRule: BASE,
    format: "percent",
    directionality: "higher_is_better",
    comparison: "previous_period",
    drilldownFieldKeys: ["products_recommended", "recommendation_reasons"],
  }),
  frontline({
    key: "recommendation_rationale",
    label: "Gave a reason for it",
    businessQuestion: "When reps recommend, do they say why?",
    definition:
      "Interactions containing a recommendation that also contain at least one stated reason.",
    grain: "interaction",
    requiredFields: ["products_recommended", "recommendation_reasons"],
    eligibilityRule: "Interactions with at least one recommendation.",
    format: "percent",
    directionality: "higher_is_better",
    comparison: "previous_period",
    provisional:
      "Matched at interaction level. The record does not yet link a reason to the recommendation it belongs to, so a rep who explained one of three recommendations counts the same as one who explained all three.",
    drilldownFieldKeys: ["products_recommended", "recommendation_reasons"],
  }),
  frontline({
    key: "full_objection_handling",
    label: "Objections fully answered",
    businessQuestion: "When a customer pushes back, does the rep resolve it?",
    definition:
      "Objection responses judged to have fully addressed the concern, among responses that were judged at all. Fully addressed does not mean the customer was persuaded.",
    grain: "event",
    requiredFields: ["objections", "objection_response"],
    eligibilityRule: "Objection responses evaluated as full, partial or none.",
    format: "percent",
    directionality: "higher_is_better",
    comparison: "previous_period",
    drilldownFieldKeys: ["objections", "objection_response"],
  }),
  frontline({
    key: "alternative_rate",
    label: "Offered an alternative",
    businessQuestion: "When the preferred option fell through, was a substitute put forward?",
    definition:
      "Interactions where a substitute was offered, among those where offering one was applicable. Interactions where nothing fell through are excluded rather than counted as a failure.",
    grain: "interaction",
    requiredFields: ["alternative_offered"],
    eligibilityRule: "Interactions where the field was answered yes or no.",
    format: "percent",
    directionality: "contextual",
    comparison: "previous_period",
    drilldownFieldKeys: ["alternative_offered", "stock_status"],
  }),
  frontline({
    key: "demo_rate",
    label: "Showed the product",
    businessQuestion: "Are reps demonstrating when it would help?",
    definition:
      "Interactions where a demo happened, among those where a demo was applicable. Interactions where a demo made no sense are excluded rather than counted as a failure.",
    grain: "interaction",
    requiredFields: ["product_demo_performed"],
    eligibilityRule: "Interactions where the demo field was answered yes or no.",
    format: "percent",
    directionality: "higher_is_better",
    comparison: "previous_period",
    drilldownFieldKeys: ["product_demo_performed"],
  }),
  frontline({
    key: "finance_question_response",
    label: "Finance questions with a recorded response",
    businessQuestion: "When a customer asked about finance, did we record an answer?",
    definition:
      "Interactions containing a finance-labelled customer question that also contain a finance-labelled response status in a usable state.",
    grain: "interaction",
    requiredFields: ["customer_questions", "question_response_status"],
    eligibilityRule: "Interactions containing at least one finance-labelled customer question.",
    numeratorRule: "a finance-labelled response status in a usable state exists",
    denominatorRule: "interactions where a finance question was asked",
    format: "percent",
    directionality: "higher_is_better",
    comparison: "previous_period",
    provisional:
      "Matched at interaction level on a shared topic label. Where a conversation contains several questions, this cannot say which question the recorded response belongs to. It reports that the topic was answered, not that a specific question was.",
    drilldownFieldKeys: ["customer_questions", "question_response_status"],
  }),
  frontline({
    key: "proactive_offer",
    label: "A commercial offer was recorded",
    businessQuestion: "How often is the floor putting a commercial lever on the table?",
    definition:
      "Interactions with at least one recorded commercial offer of any kind, among interactions where the field was answered. Separate from whether a finance question was answered — the two are recorded independently.",
    grain: "interaction",
    requiredFields: ["commercial_offer_made"],
    eligibilityRule: "Interactions where commercial_offer_made was recorded either way.",
    format: "percent",
    directionality: "higher_is_better",
    comparison: "previous_period",
    drilldownFieldKeys: ["commercial_offer_made", "commercial_offer_response"],
  }),
  frontline({
    key: "cross_sell_rate",
    label: "Pitched something alongside",
    businessQuestion: "Are we adding to the basket?",
    definition:
      "Interactions with at least one qualifying cross-sell pitch. Several pitches in one conversation still count as one interaction.",
    grain: "interaction",
    requiredFields: ["cross_sell_pitch"],
    eligibilityRule: BASE,
    format: "percent",
    directionality: "higher_is_better",
    comparison: "previous_period",
    drilldownFieldKeys: ["cross_sell_pitch", "cross_sell_hierarchy"],
  }),
  frontline({
    key: "upsell_rate",
    label: "Moved the customer up",
    businessQuestion: "Are we selling the better version when it fits?",
    definition:
      "Interactions with at least one qualifying upward move from a baseline the customer was already on.",
    grain: "interaction",
    requiredFields: ["upsell_pitch"],
    eligibilityRule: BASE,
    format: "percent",
    directionality: "higher_is_better",
    comparison: "previous_period",
    drilldownFieldKeys: ["upsell_pitch", "upsell_hierarchy"],
  }),
  frontline({
    key: "close_after_commitment",
    label: "Buying signal followed by a close",
    businessQuestion: "When a customer signals they are ready, does the rep ask for the sale?",
    definition:
      "Interactions where a close attempt came at or after the first commitment signal, among interactions with a commitment signal whose timing is known.",
    grain: "interaction",
    requiredFields: ["customer_commitment_signals", "close_attempts"],
    eligibilityRule: "Interactions with a commitment signal that carries evidence timing.",
    format: "percent",
    directionality: "higher_is_better",
    comparison: "previous_period",
    drilldownFieldKeys: ["customer_commitment_signals", "close_attempts"],
  }),
  frontline({
    key: "next_action_capture",
    label: "Left with a next step",
    businessQuestion: "When the customer does not buy today, is anything agreed?",
    definition: "Interactions where a concrete next action was recorded.",
    grain: "interaction",
    requiredFields: ["next_action"],
    eligibilityRule: BASE,
    format: "percent",
    directionality: "higher_is_better",
    comparison: "previous_period",
    drilldownFieldKeys: ["next_action", "purchase_timing"],
  }),
];

const byKey = new Map(metricRegistry.map((metric) => [metric.key, metric]));

export function metric(key: string): MetricDefinition {
  const found = byKey.get(key);
  if (!found) throw new Error(`Unknown metric: ${key}`);
  return found;
}

export function metricsFor(module: MetricModule): MetricDefinition[] {
  return metricRegistry.filter((definition) => definition.module === module);
}
