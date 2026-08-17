/**
 * Deterministic per-conversation metrics, computed from the atomic facts.
 *
 * The founder's guide is unambiguous: the model extracts observations, code
 * calculates metrics, and an LLM is never allowed to produce an executive
 * number. Everything here is a pure function of the field values — no model, no
 * network, no guesses — so a manager who drills into a metric always reaches
 * the same arithmetic and, beneath it, the same evidence.
 *
 * These are interaction-level. Aggregation across conversations happens a layer
 * up, in SQL, over the rows this produces.
 */

export const INTERACTION_METRICS_VERSION = "im.v4";

/** The slice of a stored field value these metrics need. */
export type MetricInputValue = {
  fieldKey: string;
  valueText: string | null;
  valueNumber: number | null;
  amountMinor: number | null;
  currency: string | null;
  abstention: string | null;
};

/** How addressed an objection was, on the guide's 0..1 scale. */
const RESPONSE_VALUE: Readonly<Record<string, number>> = {
  full: 1,
  partial: 0.5,
  none: 0,
};

/** Requirement clarity as an ordinal, so a delta is meaningful. */
const CLARITY_LEVEL: Readonly<Record<string, number>> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};

export type InteractionMetrics = {
  arrivalIntent: string | null;
  decisionState: string | null;

  clarityStart: number | null;
  clarityEnd: number | null;
  clarityDelta: number | null;

  targetBudgetMinor: number | null;
  maxBudgetMinor: number | null;
  budgetCurrency: string | null;

  useCaseCount: number;
  requirementCount: number;
  productsConsideredCount: number;
  productsRecommendedCount: number;

  objectionCount: number;
  /** Mean of how well objections were addressed, 0..1, or null when there were none. */
  objectionCoverage: number | null;
  alternativeOffered: string | null;

  competitorCount: number;
  /** (ourPrice − competitorPrice) / competitorPrice, as a fraction. Null unless both exist. */
  priceGap: number | null;
  /** Where the competitor price came from. Always "claimed" until a feed verifies it. */
  priceGapBasis: "claimed" | null;

  financeRequested: boolean;
  promotionDiscussed: boolean;
  demoPerformed: string | null;

  /** Complementary offers made (accessories, warranty, add-ons). */
  crossSellCount: number;
  /** Step-up offers made (a costlier model, more RAM, a premium variant). */
  upsellCount: number;
  /** Moments flagged for manager review (negative remark, compliance, channel conflict). */
  redFlagCount: number;
  /** Questions the customer asked — a proxy for where the range confuses people. */
  customerQuestionCount: number;
};

/** Values for one field that carry a real (non-abstained) value. */
function present(values: readonly MetricInputValue[], fieldKey: string): MetricInputValue[] {
  return values.filter((value) => value.fieldKey === fieldKey && value.abstention === null);
}

function singleText(values: readonly MetricInputValue[], fieldKey: string): string | null {
  return present(values, fieldKey)[0]?.valueText ?? null;
}

function median(numbers: readonly number[]): number | null {
  if (numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function clarityValue(level: string | null): number | null {
  return level === null ? null : (CLARITY_LEVEL[level] ?? null);
}

/**
 * Mean of how well the conversation's objections were addressed.
 *
 * The objections and their responses are separate fields with no explicit
 * pairing, so this averages the responses that exist rather than pretending to
 * match each one to its objection. It is null, not zero, when nothing was
 * objected to — no friction is not the same as unhandled friction.
 */
function objectionCoverage(values: readonly MetricInputValue[]): number | null {
  const responses = present(values, "objection_response")
    .map((value) => (value.valueText === null ? null : RESPONSE_VALUE[value.valueText]))
    .filter((score): score is number => score !== undefined && score !== null);
  if (responses.length === 0) return null;
  return responses.reduce((sum, score) => sum + score, 0) / responses.length;
}

/**
 * The price gap between the store's quote and the customer's competitor claim.
 *
 * Medians on each side keep a single stray number from swinging the result when
 * several prices were quoted. Computed only when the two currencies match and
 * the competitor figure is above zero, and always flagged as a claim — the
 * customer said it, nobody verified it.
 */
function priceGap(values: readonly MetricInputValue[]): {
  gap: number | null;
  basis: "claimed" | null;
} {
  const storePrices = present(values, "store_price_quoted");
  const competitorPrices = present(values, "competitor_price_claim");

  const store = median(
    storePrices.map((value) => value.amountMinor).filter((n): n is number => n !== null),
  );
  const competitor = median(
    competitorPrices.map((value) => value.amountMinor).filter((n): n is number => n !== null),
  );
  if (store === null || competitor === null || competitor <= 0) return { gap: null, basis: null };

  const storeCurrency = storePrices.find((v) => v.currency)?.currency;
  const competitorCurrency = competitorPrices.find((v) => v.currency)?.currency;
  if (storeCurrency && competitorCurrency && storeCurrency !== competitorCurrency) {
    return { gap: null, basis: null };
  }

  return { gap: (store - competitor) / competitor, basis: "claimed" };
}

export function computeInteractionMetrics(values: readonly MetricInputValue[]): InteractionMetrics {
  const targetBudget = present(values, "target_budget")[0] ?? null;
  const maxBudget = present(values, "maximum_budget")[0] ?? null;
  const clarityStart = clarityValue(singleText(values, "requirement_clarity_start"));
  const clarityEnd = clarityValue(singleText(values, "requirement_clarity_end"));
  const { gap, basis } = priceGap(values);

  return {
    arrivalIntent: singleText(values, "arrival_intent_state"),
    decisionState: singleText(values, "final_decision_state"),

    clarityStart,
    clarityEnd,
    clarityDelta: clarityStart !== null && clarityEnd !== null ? clarityEnd - clarityStart : null,

    targetBudgetMinor: targetBudget?.amountMinor ?? null,
    maxBudgetMinor: maxBudget?.amountMinor ?? null,
    budgetCurrency: targetBudget?.currency ?? maxBudget?.currency ?? null,

    useCaseCount: present(values, "purchase_use_cases").length,
    requirementCount:
      present(values, "specification_requirements").length +
      present(values, "additional_requirements").length,
    productsConsideredCount: present(values, "products_considered").length,
    productsRecommendedCount: present(values, "products_recommended").length,

    objectionCount: present(values, "objections").length,
    objectionCoverage: objectionCoverage(values),
    alternativeOffered: singleText(values, "alternative_offered"),

    competitorCount: present(values, "competitor_named").length,
    priceGap: gap,
    priceGapBasis: basis,

    financeRequested: present(values, "finance_requested").length > 0,
    promotionDiscussed: present(values, "promotion_discussed").length > 0,
    demoPerformed: singleText(values, "product_demo_performed"),

    // Counted from the pitches. Before the v1.3 spec these fields held one row
    // per offer, so counting rows was the count; now the offer is a pitch and
    // the field beside it is a verdict that is present even when the answer is
    // no. Counting the old way would score every "nothing was offered" as a
    // cross-sell and put the rate at 100% on exactly the conversations a
    // manager opens the dashboard to find.
    crossSellCount: present(values, "cross_sell_pitch").length,
    upsellCount: present(values, "upsell_pitch").length,
    redFlagCount: present(values, "red_flags").length,
    customerQuestionCount: present(values, "customer_questions").length,
  };
}
