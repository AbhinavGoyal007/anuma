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
  "upsell_offered",
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
    sourceClass: "evidence_extracted",
    cardinality: "multiple",
    valueKind: "text",
    requiresEvidence: true,
    extracted: true,
    rule: "Each complementary product or service the representative offers alongside the main product — an accessory such as a bag, mouse, or screen guard, an extended warranty or protection plan, insurance, installation, or an add-on. One entry each. Never the main product itself.",
  },
  {
    key: "upsell_offered",
    sourceClass: "evidence_extracted",
    cardinality: "multiple",
    valueKind: "entity",
    requiresEvidence: true,
    extracted: true,
    rule: "Each step-up the representative proposes above what the customer asked for — a costlier model, more RAM or storage, or a premium variant — put forward as an upgrade or better fit. One entry each, and only when it is genuinely a higher tier than the customer's original ask.",
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
    rule: "Each explicit sign of movement toward the transaction. Set label to its kind: explicit_purchase_commitment, final_price_after_selection, payment_or_billing, reservation, delivery_after_selection, selected_variant_confirmation or other. Context decides: an early \"what is the price?\" is a question, not a commitment. Never infer one from enthusiasm or politeness.",
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
    rule: "Each condition the customer states would allow or materially enable them to proceed — a price threshold, a required variant, approval from someone else, a finance or timing condition. Explicit conditional language is required. \"This is expensive\" is an objection, not a condition.",
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
