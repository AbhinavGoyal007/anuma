import type { SourceClass } from "@/modules/interaction-record/source-class";

/**
 * The canonical facts that make up a Commercial Interaction Record.
 *
 * This registry is the spine of the product. The extraction schema, the
 * persistence shape, the grounding validator and the evaluation harness are all
 * derived from it rather than restating it, so a field cannot be added to one
 * and quietly forgotten in another.
 *
 * The set is intentionally small and stable. Many fields hold several instances
 * — a conversation has multiple objections, products or requirements — but the
 * schema does not change per category, which is what makes records comparable
 * across stores and over time. Category-specific needs live in the one adaptive
 * field, `additional_requirements`, rather than as bespoke columns per vertical.
 */

export const atomicFieldKeys = [
  // Verified — the system already knows these.
  "conversation_id",
  "store_id",
  "rep_id",
  "started_at",
  "ended_at",
  // Evidence-extracted / evaluated — read or judged from what was said.
  "language_mix",
  "customer_party_size",
  "purchase_category",
  "arrival_intent_state",
  "initial_request",
  "customer_questions",
  "purchase_use_cases",
  "target_budget",
  "maximum_budget",
  "purchase_timing",
  "brand_preferences",
  "specification_requirements",
  "additional_requirements",
  "other_constraints",
  "decision_drivers",
  "requirement_origin",
  "requirement_clarity_start",
  "requirement_clarity_end",
  "products_considered",
  "products_recommended",
  "recommendation_reasons",
  "store_price_quoted",
  "competitor_named",
  "competitor_product",
  "competitor_price_claim",
  "stock_status",
  "promotion_discussed",
  "finance_requested",
  "objections",
  "objection_response",
  "alternative_offered",
  "product_demo_performed",
  "cross_sell_offered",
  "cross_sell_pitch",
  "cross_sell_hierarchy",
  "upsell_offered",
  "upsell_pitch",
  "upsell_hierarchy",
  "red_flags",
  "next_action",
  "final_decision_state",
  "commercial_outcome",
  // From the v1.1 extraction spec: the fields that separate what the customer
  // settled on from what was merely discussed, and what actually blocked a sale
  // from what was merely complained about.
  "final_preferred_product",
  "recommendation_response",
  "commercial_offer_made",
  "commercial_offer_response",
  "question_response_status",
  "customer_commitment_signals",
  "close_attempts",
  "customer_purchase_conditions",
  "primary_non_conversion_reason",
  // From the v1.3 spec: what the business actually got, and on what evidence.
  "confirmed_business_outcome",
  "outcome_basis",
] as const;

export type AtomicFieldKey = (typeof atomicFieldKeys)[number];

/** How many values a field may hold. */
export type Cardinality = "single" | "multiple";

/**
 * The shape of a field's value.
 *
 * `money` is separate from `number` because a spoken amount carries a scale
 * word — "35 lakh" — that has to survive extraction and be applied in code.
 */
export type ValueKind =
  "text" | "number" | "money" | "enum" | "entity" | "timestamp" | "identifier";

export type AtomicField = {
  key: AtomicFieldKey;
  /** Where the value normally comes from. */
  sourceClass: SourceClass;
  /**
   * A second legitimate origin for the same field.
   *
   * A quoted price is verified when the pricing system has it and
   * evidence-extracted when it was only spoken; a demo is evidence-extracted
   * when audible and evaluated when it has to be judged.
   */
  alternateSourceClass?: SourceClass;
  cardinality: Cardinality;
  valueKind: ValueKind;
  /** Permitted values, for enum fields. */
  values?: readonly string[];
  /**
   * Whether each value names the requirement dimension it belongs to.
   *
   * Only `additional_requirements` uses this today: a category-adaptive field
   * whose entries must say what aspect they describe (portability, floor,
   * fuel_type) so they stay queryable instead of collapsing into free text.
   */
  labelled?: boolean;
  /** Whether a value is meaningless without a citation to the transcript. */
  requiresEvidence: boolean;
  /** Whether the model produces this, as opposed to the system supplying it. */
  extracted: boolean;
  /**
   * What kind of work the field asks for, and which part of the conversation
   * settles it. Both are shown to the model per field, because a judgement read
   * as a quotation, or a closing state inferred from an opening one, are the two
   * ways a record stops meaning what it says.
   */
  task?: "extract" | "extract_list" | "evaluate" | "classify" | "verified";
  scope?: "opening" | "closing" | "full";
  /** Who the field reads from, where that changes the answer. */
  speakerSource?: "customer" | "representative" | "any";
  /** The precise extraction definition — this is the text the model is given. */
  rule: string;
};

export const arrivalIntentStates = [
  "exploratory",
  "comparing",
  "specific_product",
  "ready_to_buy",
] as const;
export const requirementOrigins = ["stated", "discovered", "inferred"] as const;
export const clarityLevels = ["none", "low", "medium", "high"] as const;
export const stockStatuses = ["available", "unavailable", "partially_available"] as const;
export const objectionResponses = ["full", "partial", "none"] as const;
export const applicability = ["yes", "no", "not_applicable"] as const;
/**
 * The verdict on a commercial action.
 *
 * `uncertain` rather than `not_applicable`, because "an opportunity existed and
 * the words do not settle whether it was taken" is a different finding from "no
 * opportunity arose" — and the second is already expressible as an abstention.
 */
export const commercialActionVerdicts = ["yes", "no", "uncertain"] as const;
/** Why a conversation did not convert, where the evidence supports one reason. */
export const nonConversionReasons = [
  "price",
  "product_fit",
  "stock",
  "competitor",
  "finance",
  "delivery_installation",
  "timing",
  "decision_dependency",
  "trust",
  "low_intent",
  "frontline_execution",
  "other",
] as const;

export const finalDecisionStates = [
  "purchased",
  "researching",
  "deferred",
  "rejected",
  "follow_up_scheduled",
] as const;
export const commercialOutcomes = ["invoice", "no_sale", "unknown"] as const;
/** What the business got, as distinct from where the customer landed. */
export const businessOutcomes = ["sale", "no_sale"] as const;
/** Which evidence settled the business outcome. */
export const outcomeBases = ["verified_metadata", "conversation_evidence"] as const;

export const atomicFields: readonly AtomicField[] = [
  // ---- Verified: identity and clock -------------------------------------
  {
    key: "conversation_id",
    sourceClass: "verified",
    cardinality: "single",
    valueKind: "identifier",
    requiresEvidence: false,
    extracted: false,
    rule: "System generated.",
  },
  {
    key: "store_id",
    sourceClass: "verified",
    cardinality: "single",
    valueKind: "identifier",
    requiresEvidence: false,
    extracted: false,
    rule: "Identity context, never inferred from the conversation.",
  },
  {
    key: "rep_id",
    sourceClass: "verified",
    cardinality: "single",
    valueKind: "identifier",
    requiresEvidence: false,
    extracted: false,
    rule: "From auth, device or roster.",
  },
  {
    key: "started_at",
    sourceClass: "verified",
    cardinality: "single",
    valueKind: "timestamp",
    requiresEvidence: false,
    extracted: false,
    rule: "Device timestamp.",
  },
  {
    key: "ended_at",
    sourceClass: "verified",
    cardinality: "single",
    valueKind: "timestamp",
    requiresEvidence: false,
    extracted: false,
    rule: "Device timestamp.",
  },

  // ---- Who walked in -----------------------------------------------------
  {
    key: "language_mix",
    sourceClass: "evidence_extracted",
    cardinality: "multiple",
    valueKind: "text",
    requiresEvidence: true,
    extracted: true,
    task: "extract",
    scope: "full",
    speakerSource: "any",
    rule: "Each distinct language actually spoken in the conversation, for example Hindi, English, or code-mixed Hinglish.",
  },
  {
    key: "customer_party_size",
    sourceClass: "evidence_extracted",
    cardinality: "single",
    valueKind: "number",
    requiresEvidence: true,
    extracted: true,
    task: "evaluate",
    scope: "full",
    speakerSource: "customer",
    rule: "The number of customers or decision-participants present, judged from what is said, not from the speaker count. Abstain if uncertain.",
  },
  {
    key: "purchase_category",
    sourceClass: "evidence_extracted",
    cardinality: "single",
    valueKind: "text",
    requiresEvidence: true,
    extracted: true,
    task: "extract",
    scope: "full",
    speakerSource: "any",
    rule: "The single product category the customer is shopping for, for example laptop, refrigerator, or 2 BHK flat.",
  },
  {
    key: "arrival_intent_state",
    sourceClass: "evaluated",
    cardinality: "single",
    valueKind: "enum",
    values: arrivalIntentStates,
    requiresEvidence: true,
    extracted: true,
    task: "classify",
    scope: "opening",
    speakerSource: "customer",
    rule: "How decided the customer already was on arrival: exploratory, comparing, specific_product, or ready_to_buy. Judge from the opening exchange.",
  },
  {
    key: "initial_request",
    sourceClass: "evidence_extracted",
    cardinality: "single",
    valueKind: "text",
    requiresEvidence: true,
    extracted: true,
    task: "extract",
    scope: "opening",
    speakerSource: "customer",
    rule: "The customer's own first stated ask, as the gist of their opening words.",
  },
  {
    key: "customer_questions",
    sourceClass: "evidence_extracted",
    cardinality: "multiple",
    valueKind: "text",
    labelled: true,
    requiresEvidence: true,
    extracted: true,
    task: "extract_list",
    scope: "full",
    speakerSource: "customer",
    rule: "Each distinct question the customer asks, as the gist of what they wanted to know, with a short snake_case label naming its topic: price, specification, comparison, availability, warranty, finance, usage, delivery, offer, or other. One entry per question. Only questions the customer asks — never the representative's questions, and never a statement rephrased as a question.",
  },

  // ---- What they needed --------------------------------------------------
  {
    key: "purchase_use_cases",
    sourceClass: "evidence_extracted",
    cardinality: "multiple",
    valueKind: "text",
    requiresEvidence: true,
    extracted: true,
    task: "extract_list",
    scope: "full",
    speakerSource: "customer",
    rule: "Each distinct purpose the product must serve, for example college, coding, gaming, or daily commute. One entry per use case.",
  },
  {
    key: "target_budget",
    sourceClass: "evidence_extracted",
    cardinality: "single",
    valueKind: "money",
    requiresEvidence: true,
    extracted: true,
    task: "extract",
    scope: "full",
    speakerSource: "customer",
    rule: "The spend figure the customer first states as their intended budget.",
  },
  {
    key: "maximum_budget",
    sourceClass: "evidence_extracted",
    cardinality: "single",
    valueKind: "money",
    requiresEvidence: true,
    extracted: true,
    task: "extract",
    scope: "full",
    speakerSource: "customer",
    rule: "The highest figure the customer explicitly says they could stretch to. A ceiling counts however it is phrased: as a stretch (I could go to 1.10 lakh), as a prohibition (not above 60,000; 60 hazaar ke upar nahi jaana chahiye), or as a revision later in the conversation that raises an earlier figure (60 se zyada, maan lo 65 tak). Take the last ceiling the customer states, not the first. Only when a ceiling was actually stated; never infer one from the target, and never compute one from a discount, offer or EMI.",
  },
  {
    key: "purchase_timing",
    sourceClass: "evidence_extracted",
    cardinality: "single",
    valueKind: "text",
    requiresEvidence: true,
    extracted: true,
    task: "extract",
    scope: "full",
    speakerSource: "customer",
    rule: "When the customer intends to buy or take the next step, for example this week, day after tomorrow, or after Diwali. A time the customer gives for returning to the store is a timing answer as well as an action, so record it here even when the return itself is captured as a next action; a clock time counts (tomorrow around 7:30). When the customer says the timing depends on something unresolved, record the condition rather than abstaining.",
  },
  {
    key: "brand_preferences",
    sourceClass: "evidence_extracted",
    cardinality: "multiple",
    valueKind: "entity",
    requiresEvidence: true,
    extracted: true,
    task: "extract_list",
    scope: "full",
    speakerSource: "customer",
    rule: "Each brand the customer explicitly says they want or prefer. A brand merely discussed is not a brand preferred.",
  },
  {
    key: "specification_requirements",
    sourceClass: "evidence_extracted",
    cardinality: "multiple",
    valueKind: "entity",
    requiresEvidence: true,
    extracted: true,
    task: "extract_list",
    scope: "full",
    speakerSource: "customer",
    rule: "Each hard technical specification the customer names explicitly, for example RTX 4060, 16 GB, 2 BHK, ready-to-move, or diesel. One entry each, kept as the customer's own terms.",
  },
  {
    key: "additional_requirements",
    sourceClass: "evidence_extracted",
    cardinality: "multiple",
    valueKind: "text",
    labelled: true,
    requiresEvidence: true,
    extracted: true,
    task: "extract_list",
    scope: "full",
    speakerSource: "customer",
    rule: "Category-relevant requirements that are not hard named specs. First infer the product category, then capture each preference the customer expresses on a dimension that matters for that category, as a dimension label plus its value: for a laptop portability=important or battery_life=6+ hours; for property floor_preference=high or facing=east; for a car fuel_type=diesel or seating=7. Use a short snake_case label for the dimension. One entry per requirement.",
  },
  {
    key: "other_constraints",
    sourceClass: "evidence_extracted",
    cardinality: "multiple",
    valueKind: "text",
    requiresEvidence: true,
    extracted: true,
    task: "extract_list",
    scope: "full",
    speakerSource: "customer",
    rule: "Each additional hard constraint not covered by another field, for example under 2 kg, a specific colour, or a specific locality. One entry each.",
  },

  // ---- How the need took shape (judged) ----------------------------------
  {
    key: "decision_drivers",
    sourceClass: "evaluated",
    cardinality: "multiple",
    valueKind: "text",
    requiresEvidence: true,
    extracted: true,
    task: "evaluate",
    scope: "full",
    speakerSource: "customer",
    rule: "The one or few factors that most influence this customer's choice, shown by what they repeat or stress, for example value for money, gaming performance, or brand trust. Base this on repeated or explicit evidence, not a single passing mention.",
  },
  {
    key: "requirement_origin",
    sourceClass: "evaluated",
    cardinality: "single",
    valueKind: "enum",
    values: requirementOrigins,
    requiresEvidence: true,
    extracted: true,
    task: "evaluate",
    scope: "full",
    speakerSource: "any",
    rule: "Whether the core requirement was stated (the customer arrived with it), discovered (found during the conversation), or inferred (the representative deduced it).",
  },
  {
    key: "requirement_clarity_start",
    sourceClass: "evaluated",
    cardinality: "single",
    valueKind: "enum",
    values: clarityLevels,
    requiresEvidence: true,
    extracted: true,
    task: "classify",
    scope: "opening",
    speakerSource: "customer",
    rule: "How clearly the customer knew what they wanted at the very opening: none, low, medium, or high. Judge on the opening exchange only.",
  },
  {
    key: "requirement_clarity_end",
    sourceClass: "evaluated",
    cardinality: "single",
    valueKind: "enum",
    values: clarityLevels,
    requiresEvidence: true,
    extracted: true,
    task: "classify",
    scope: "closing",
    speakerSource: "customer",
    rule: "How clearly the customer knew what they wanted by the close, same scale. Judge on the closing exchange only.",
  },

  // ---- What the store offered --------------------------------------------
  {
    key: "products_considered",
    sourceClass: "evidence_extracted",
    cardinality: "multiple",
    valueKind: "entity",
    requiresEvidence: true,
    extracted: true,
    task: "extract_list",
    scope: "full",
    speakerSource: "any",
    rule: "Each specific product weighed as an option during the conversation, whether or not the representative pitched it. One entry each.",
  },
  {
    key: "products_recommended",
    sourceClass: "evidence_extracted",
    cardinality: "multiple",
    valueKind: "entity",
    requiresEvidence: true,
    extracted: true,
    task: "extract_list",
    scope: "full",
    speakerSource: "representative",
    rule: "Each specific product the representative actively put forward as a recommendation. One entry each.",
  },
  {
    key: "recommendation_reasons",
    sourceClass: "evidence_extracted",
    cardinality: "multiple",
    valueKind: "text",
    requiresEvidence: true,
    extracted: true,
    task: "extract_list",
    scope: "full",
    speakerSource: "representative",
    rule: "For each recommendation, the reason the representative gives that ties the product to this customer's need. Not a bare specification restated.",
  },
  {
    key: "store_price_quoted",
    sourceClass: "evidence_extracted",
    alternateSourceClass: "verified",
    cardinality: "multiple",
    valueKind: "money",
    requiresEvidence: true,
    extracted: true,
    task: "extract_list",
    scope: "full",
    speakerSource: "representative",
    rule: "Each price the representative quotes for a store product. Prefer the system price; use the spoken figure when only spoken.",
  },

  // ---- The competition ---------------------------------------------------
  {
    key: "competitor_named",
    sourceClass: "evidence_extracted",
    cardinality: "multiple",
    valueKind: "entity",
    requiresEvidence: true,
    extracted: true,
    task: "extract_list",
    scope: "full",
    speakerSource: "any",
    rule: "Each competing seller the customer references, for example Amazon, Flipkart, Croma, or another dealer. One entry each.",
  },
  {
    key: "competitor_product",
    sourceClass: "evidence_extracted",
    cardinality: "multiple",
    valueKind: "entity",
    requiresEvidence: true,
    extracted: true,
    task: "extract_list",
    scope: "full",
    speakerSource: "any",
    rule: "The specific product the customer attributes to a competitor: brand and model where stated, otherwise the category. Do not invent a model the customer did not say.",
  },
  {
    key: "competitor_price_claim",
    sourceClass: "evidence_extracted",
    cardinality: "multiple",
    valueKind: "money",
    requiresEvidence: true,
    extracted: true,
    task: "extract_list",
    scope: "full",
    speakerSource: "any",
    rule: "Each price the customer claims a competitor is offering, recorded as the customer's claim and never as a verified price.",
  },

  // ---- Commercial context ------------------------------------------------
  {
    key: "stock_status",
    sourceClass: "verified",
    alternateSourceClass: "evidence_extracted",
    cardinality: "single",
    valueKind: "enum",
    values: stockStatuses,
    requiresEvidence: false,
    extracted: true,
    task: "extract",
    scope: "full",
    speakerSource: "any",
    rule: "Whether the wanted product is available at this store: available, unavailable, or partially_available. Inventory system preferred; what was said is a fallback, not a substitute.",
  },
  {
    key: "promotion_discussed",
    sourceClass: "evidence_extracted",
    cardinality: "multiple",
    valueKind: "text",
    requiresEvidence: true,
    extracted: true,
    task: "extract_list",
    scope: "full",
    speakerSource: "any",
    rule: "Each offer discussed, for example cashback, exchange bonus, bank or card offer, or festive discount. One entry each.",
  },
  {
    key: "finance_requested",
    sourceClass: "evidence_extracted",
    cardinality: "multiple",
    valueKind: "text",
    requiresEvidence: true,
    extracted: true,
    task: "extract_list",
    scope: "full",
    speakerSource: "customer",
    rule: "Each financing option the customer asks about or that is discussed, for example EMI, a specific bank, a tenure, or no-cost EMI. One entry each.",
  },

  // ---- Friction and how it was handled -----------------------------------
  {
    key: "objections",
    sourceClass: "evidence_extracted",
    cardinality: "multiple",
    valueKind: "text",
    requiresEvidence: true,
    extracted: true,
    task: "extract_list",
    scope: "full",
    speakerSource: "customer",
    rule: "Each distinct concern the customer raises that resists the purchase, for example price, weight, warranty, or delivery time. One object per concern; never merge two concerns into one.",
  },
  {
    key: "objection_response",
    sourceClass: "evaluated",
    cardinality: "multiple",
    valueKind: "enum",
    values: objectionResponses,
    requiresEvidence: true,
    extracted: true,
    task: "evaluate",
    scope: "full",
    speakerSource: "representative",
    rule: "For each objection, how fully the representative addressed it: full, partial, or none. Requires evidence for both the objection and the response.",
  },
  {
    key: "alternative_offered",
    sourceClass: "evaluated",
    cardinality: "single",
    valueKind: "enum",
    values: applicability,
    requiresEvidence: true,
    extracted: true,
    task: "evaluate",
    scope: "full",
    speakerSource: "representative",
    rule: "Whether the representative offered a suitable alternative when the customer's preferred product could not fit: yes, no, or not_applicable. It is only 'needed' when the preferred product failed a requirement.",
  },
  {
    key: "product_demo_performed",
    sourceClass: "evidence_extracted",
    alternateSourceClass: "evaluated",
    cardinality: "single",
    valueKind: "enum",
    values: applicability,
    requiresEvidence: true,
    extracted: true,
    task: "evaluate",
    scope: "full",
    speakerSource: "any",
    rule: "Whether the representative demonstrated or physically showed the product: yes, no, or not_applicable. Evidence where audible; a visual-only demo needs manual confirmation.",
  },
  {
    key: "cross_sell_offered",
    sourceClass: "evaluated",
    cardinality: "single",
    valueKind: "enum",
    values: commercialActionVerdicts,
    requiresEvidence: false,
    extracted: false,
    rule: "Whether the representative put something complementary in front of the customer beyond what they came in for. Derived in code from cross_sell_pitch, never asked of the model: the specification defines it as yes when at least one qualifying pitch exists, which makes it a function of the pitches and the only way it cannot contradict them. It is also unstorable as an extracted value — a no is a claim about something never said, and there is no segment to cite for it. What qualifies as a pitch is defined on cross_sell_pitch, and the no, uncertain and not-applicable readings all come from that field's own abstention.",
  },
  {
    key: "cross_sell_pitch",
    sourceClass: "evidence_extracted",
    cardinality: "multiple",
    valueKind: "text",
    labelled: true,
    requiresEvidence: true,
    extracted: true,
    task: "extract_list",
    scope: "full",
    speakerSource: "representative",
    rule: "One entry per complementary item or service the representative actively introduced, recommended or positioned beyond what the customer came in for — a bag with a laptop, a soundbar with a television, a protection plan with an appliance. Set label to its kind: product, service, warranty_service_plan, accessory, bundle_component or other. It qualifies when the representative brought it up or pushed it, whether or not the customer accepted and whether or not it was ever priced. It does not qualify when the customer asked for the item themselves and the representative merely answered, when the item substitutes for the main product rather than adding to it, or when it was named in passing with nothing put behind it. Do not collapse a mouse and a warranty plan into one entry because they were said in the same breath, and deduplicate a pitch repeated in the same terms.",
  },
  {
    key: "cross_sell_hierarchy",
    sourceClass: "evidence_extracted",
    cardinality: "multiple",
    valueKind: "text",
    labelled: true,
    requiresEvidence: true,
    extracted: true,
    task: "extract_list",
    scope: "full",
    rule: "Where each pitch sits commercially, in the same order as cross_sell_pitch. Set label to the level: primary_department, pitched_department, pitched_category, pitched_product, pitched_brand or pitched_model. Go only as deep as the conversation supports and leave the rest out entirely rather than guessing — a laptop sale with a mouse pitched gives primary_department=computers and pitched_category=mouse, and brand only if a brand was actually said. Never invent a retailer's department names from general knowledge.",
  },
  {
    key: "upsell_offered",
    sourceClass: "evaluated",
    cardinality: "single",
    valueKind: "enum",
    values: commercialActionVerdicts,
    requiresEvidence: false,
    extracted: false,
    rule: "Whether the representative moved the customer upward within the same need — a larger capacity, a higher specification, a premium tier. Derived in code from upsell_pitch, never asked of the model, for the same reasons as cross_sell_offered: the specification makes it a function of the pitches, and a no has no utterance to cite. What qualifies as an upward move is defined on upsell_pitch, and the no, uncertain and not-applicable readings all come from that field's own abstention.",
  },
  {
    key: "upsell_pitch",
    sourceClass: "evidence_extracted",
    cardinality: "multiple",
    valueKind: "text",
    labelled: true,
    requiresEvidence: true,
    extracted: true,
    task: "extract_list",
    scope: "full",
    speakerSource: "representative",
    rule: 'One entry per upward move the representative proposed within the same need, written as the transition itself — "16 GB to 32 GB", "base to Pro". Set label to what is being increased: storage, memory, capacity, size, performance, feature_tier, premium_tier, energy_efficiency, service_tier, warranty_tier or other. What makes it an upsell is a baseline the customer was already on and the representative proposing above it. Almost every real upsell is justified by a need — a customer who names 16 GB and is told their editing workload wants 32 GB has been upsold, and the reason given does not turn it back into plain advice. Suggesting the step up is enough: it need not be accepted, priced or firmly stated. What does not count is a first recommendation with no baseline to move up from, a costlier product that is simply different, a substitute for something unavailable or over budget, which is an alternative, and a higher tier the customer raised themselves where the representative only answered. Where the baseline is only a configuration rather than a named product, keep the configuration.',
  },
  {
    key: "upsell_hierarchy",
    sourceClass: "evidence_extracted",
    cardinality: "multiple",
    valueKind: "text",
    labelled: true,
    requiresEvidence: true,
    extracted: true,
    task: "extract_list",
    scope: "full",
    rule: "Where each upward move sits, in the same order as upsell_pitch. Set label to the level: department, category, from_product, from_brand, from_model, to_product, to_brand or to_model. An upsell normally stays inside one department — if it crosses into another because the item is complementary, it was a cross-sell. Never decide from an obscure model number that one product outranks another; only the conversation can establish the hierarchy.",
  },
  {
    key: "red_flags",
    sourceClass: "evaluated",
    cardinality: "multiple",
    valueKind: "text",
    labelled: true,
    requiresEvidence: true,
    extracted: true,
    rule: "Each moment a manager should review, as a short description with a label naming the category. negative_remark: the representative speaks badly about the store, a product, a brand or the customer, or is rude or dismissive. compliance_gap: an unbackable promise, a missing required disclosure, or a misrepresentation of price, stock, warranty or offer. channel_conflict: the representative steers the customer to buy elsewhere or online rather than close the sale here. other: any other clear concern. Flag only genuine concerns backed by what was said — ordinary price, stock or competitor discussion is not a red flag.",
  },

  // ---- Where it ended ----------------------------------------------------
  {
    key: "next_action",
    sourceClass: "evidence_extracted",
    cardinality: "multiple",
    valueKind: "text",
    requiresEvidence: true,
    extracted: true,
    task: "extract_list",
    scope: "closing",
    speakerSource: "any",
    rule: "Each concrete next step agreed, for example the customer to visit Saturday, or the representative to send details on WhatsApp. One entry each.",
  },
  {
    key: "final_decision_state",
    sourceClass: "evaluated",
    cardinality: "single",
    valueKind: "enum",
    values: finalDecisionStates,
    requiresEvidence: true,
    extracted: true,
    task: "classify",
    scope: "closing",
    speakerSource: "customer",
    rule: "Where the customer landed by the end: purchased, researching, deferred, rejected, or follow_up_scheduled. Based on the closing evidence.",
  },
  {
    key: "commercial_outcome",
    sourceClass: "verified",
    cardinality: "single",
    valueKind: "enum",
    values: commercialOutcomes,
    requiresEvidence: false,
    extracted: false,
    rule: "POS, or an explicitly confirmed outcome. Never read from the conversation alone.",
  },
  {
    key: "final_preferred_product",
    sourceClass: "evaluated",
    cardinality: "single",
    valueKind: "text",
    requiresEvidence: true,
    extracted: true,
    task: "evaluate",
    scope: "closing",
    speakerSource: "customer",
    rule: "The product the customer clearly prefers by the end, requiring explicit preference, selection or a clear comparative choice. The most discussed product is not the preferred one, and neither is the recommended one. If two options remain equally preferred, abstain as ambiguous rather than choosing.",
  },
  {
    key: "recommendation_response",
    sourceClass: "evaluated",
    cardinality: "multiple",
    valueKind: "text",
    labelled: true,
    requiresEvidence: true,
    extracted: true,
    task: "evaluate",
    speakerSource: "customer",
    rule: "How the customer answered each recommendation, one entry per recommendation, in the same order as products_recommended. Set label to the product. Value must be accepted, considering, rejected or unclear. Accepted means they explicitly chose it as the way forward, which is not itself a completed sale. Silence is unclear, never acceptance.",
  },
  {
    key: "commercial_offer_made",
    sourceClass: "evidence_extracted",
    cardinality: "multiple",
    valueKind: "text",
    labelled: true,
    requiresEvidence: true,
    extracted: true,
    task: "extract_list",
    speakerSource: "representative",
    rule: "Each commercial intervention the representative proactively offers to make purchase easier or more attractive. Set label to its kind: finance, discount, promotion, exchange, warranty_service_plan, accessory, installation, delivery, bundle or other. Describing a fact is not offering something; the representative must actually propose it to this customer. A promotion the customer raises is not a representative offer.",
  },
  {
    key: "commercial_offer_response",
    sourceClass: "evaluated",
    cardinality: "multiple",
    valueKind: "text",
    labelled: true,
    requiresEvidence: true,
    extracted: true,
    task: "evaluate",
    speakerSource: "customer",
    rule: "How the customer answered each offer, one entry per offer, in the same order as commercial_offer_made. Set label to the offer. Value must be accepted, interested, rejected, deferred or unclear. Silence is unclear.",
  },
  {
    key: "question_response_status",
    sourceClass: "evaluated",
    cardinality: "multiple",
    valueKind: "text",
    labelled: true,
    requiresEvidence: true,
    extracted: true,
    task: "evaluate",
    rule: "Whether each customer question was answered, one entry per question, in the same order as customer_questions. Set label to the question topic. Value must be answered, partial, unanswered or uncertain. A response answers the question even if the customer dislikes the answer. Use unanswered only when enough later conversation existed for a response to have been given.",
  },
  {
    key: "customer_commitment_signals",
    sourceClass: "evidence_extracted",
    cardinality: "multiple",
    valueKind: "text",
    labelled: true,
    requiresEvidence: true,
    extracted: true,
    task: "extract_list",
    speakerSource: "customer",
    rule: 'Each explicit sign of movement toward the transaction. Set label to its kind: explicit_purchase_commitment, final_price_after_selection, payment_or_billing, reservation, delivery_after_selection, selected_variant_confirmation or other. Context decides: an early "what is the price?" is a question, not a commitment. Never infer one from enthusiasm or politeness.',
  },
  {
    key: "close_attempts",
    sourceClass: "evidence_extracted",
    cardinality: "multiple",
    valueKind: "text",
    labelled: true,
    requiresEvidence: true,
    extracted: true,
    task: "extract_list",
    speakerSource: "representative",
    rule: "Each explicit attempt by the representative to secure a commitment, a reservation or a concrete next step. Set label to purchase_close, commitment_close, reservation_close or next_step_close. Ordinary product discussion is not a close, and a next-step close must actually ask the customer to commit to something specific rather than offer general help.",
  },
  {
    key: "customer_purchase_conditions",
    sourceClass: "evidence_extracted",
    cardinality: "multiple",
    valueKind: "text",
    requiresEvidence: true,
    extracted: true,
    task: "extract_list",
    speakerSource: "customer",
    rule: 'Each condition the customer states would allow or materially enable them to proceed — a price threshold, a required variant, approval from someone else, a finance or timing condition. Explicit conditional language is required. "This is expensive" is an objection, not a condition.',
  },
  {
    key: "primary_non_conversion_reason",
    sourceClass: "evaluated",
    cardinality: "single",
    valueKind: "enum",
    values: nonConversionReasons,
    requiresEvidence: true,
    extracted: true,
    task: "evaluate",
    rule: "The single strongest evidenced blocker to purchase in this interaction. Evaluate only when the conversation does not show an immediate purchase; where it does, abstain as unknown. A raised objection is not automatically the blocker. Use frontline_execution only where the interaction itself directly shows the failure. Where several blockers are comparably plausible, abstain as ambiguous rather than choosing.",
  },
  {
    key: "confirmed_business_outcome",
    sourceClass: "evaluated",
    alternateSourceClass: "verified",
    cardinality: "single",
    valueKind: "enum",
    values: businessOutcomes,
    requiresEvidence: true,
    extracted: true,
    task: "evaluate",
    scope: "closing",
    speakerSource: "any",
    rule: 'Whether this interaction actually ended in business, judged at the highest evidence available. Verified transaction metadata settles it outright and outranks anything said. Otherwise sale needs the conversation to show the transaction happening — payment made or being made, an invoice or bill raised, delivery or installation being scheduled for a purchase now agreed. Liking a product is not a sale; accepting a recommendation is not a sale; a commitment signal is not a sale; a close attempt is not a sale; "I will take this" on its own is not a sale. no_sale needs the customer to leave, defer or decline with the conversation covering the end. Absence of payment language is not evidence of no_sale — an interaction that simply stops is unknown. This field answers what the business got, and final_decision_state answers where the customer landed: the two disagreeing is normal, and neither should be bent to match the other.',
  },
  {
    key: "outcome_basis",
    sourceClass: "verified",
    cardinality: "single",
    valueKind: "enum",
    values: outcomeBases,
    requiresEvidence: false,
    extracted: false,
    rule: "Which evidence settled confirmed_business_outcome: verified_metadata where a confirmed transaction record decided it, conversation_evidence where only the transcript did. Determined in code from what the system holds, never asked of the model — a record that cannot say whether its sale came from the till or from a transcript is one a manager has to go and check by hand.",
  },
];

const byKey = new Map(atomicFields.map((field) => [field.key, field]));

export function atomicField(key: AtomicFieldKey): AtomicField {
  const field = byKey.get(key);
  if (!field) throw new Error(`Unknown atomic field: ${key}`);
  return field;
}

/** The fields the model is asked to produce. */
export const extractedFields = atomicFields.filter((field) => field.extracted);

/** The fields the system supplies, which the model must never be asked to guess. */
export const systemFields = atomicFields.filter((field) => !field.extracted);
