import { describe, expect, it } from "vitest";

import {
  computeInteractionMetrics,
  type MetricInputValue,
} from "@/modules/interaction-metrics/compute";

/**
 * These are executive numbers, so the guide forbids a model producing them. The
 * arithmetic lives here and is pinned, because a metric that is silently wrong
 * is worse than no metric — a manager acts on it either way.
 */

function value(over: Partial<MetricInputValue> & { fieldKey: string }): MetricInputValue {
  return {
    valueText: null,
    valueNumber: null,
    amountMinor: null,
    currency: null,
    abstention: null,
    ...over,
  };
}

describe("objection coverage", () => {
  it("averages how well the objections were addressed", () => {
    const metrics = computeInteractionMetrics([
      value({ fieldKey: "objections", valueText: "too expensive" }),
      value({ fieldKey: "objections", valueText: "too far" }),
      value({ fieldKey: "objection_response", valueText: "full" }),
      value({ fieldKey: "objection_response", valueText: "partial" }),
    ]);

    expect(metrics.objectionCount).toBe(2);
    expect(metrics.objectionCoverage).toBe(0.75); // (1 + 0.5) / 2
  });

  it("is null, not zero, when nothing was objected to", () => {
    // No friction is not the same as friction left unhandled.
    const metrics = computeInteractionMetrics([
      value({ fieldKey: "purchase_category", valueText: "laptop" }),
    ]);
    expect(metrics.objectionCount).toBe(0);
    expect(metrics.objectionCoverage).toBeNull();
  });
});

describe("cross-sell and upsell", () => {
  it("counts each complementary and step-up offer separately", () => {
    const metrics = computeInteractionMetrics([
      value({ fieldKey: "cross_sell_pitch", valueText: "laptop bag" }),
      value({ fieldKey: "cross_sell_pitch", valueText: "2-year warranty" }),
      value({ fieldKey: "upsell_pitch", valueText: "128 GB to 256 GB" }),
      value({ fieldKey: "cross_sell_pitch", valueText: "abstained", abstention: "not_stated" }),
    ]);
    expect(metrics.crossSellCount).toBe(2); // the abstained one does not count
    expect(metrics.upsellCount).toBe(1);
  });

  it("is zero when nothing extra was offered", () => {
    const metrics = computeInteractionMetrics([
      value({ fieldKey: "purchase_category", valueText: "laptop" }),
    ]);
    expect(metrics.crossSellCount).toBe(0);
    expect(metrics.upsellCount).toBe(0);
  });

  it("does not count an explicit no as an offer", () => {
    // cross_sell_offered holds a verdict on every conversation that reached one,
    // so counting its values rather than the pitches beside it would put the
    // cross-sell rate at 100% — including on the conversations where the
    // representative pitched nothing, which is the number a manager is looking
    // for in the first place.
    const metrics = computeInteractionMetrics([
      value({ fieldKey: "cross_sell_offered", valueText: "no" }),
      value({ fieldKey: "upsell_offered", valueText: "no" }),
    ]);
    expect(metrics.crossSellCount).toBe(0);
    expect(metrics.upsellCount).toBe(0);
  });
});

describe("red flags", () => {
  it("counts each flagged moment and stays zero on a clean interaction", () => {
    const flagged = computeInteractionMetrics([
      value({ fieldKey: "red_flags", valueText: "told the customer Amazon is always cheaper" }),
      value({ fieldKey: "red_flags", valueText: "promised same-day delivery not offered" }),
    ]);
    expect(flagged.redFlagCount).toBe(2);

    const clean = computeInteractionMetrics([
      value({ fieldKey: "purchase_category", valueText: "laptop" }),
    ]);
    expect(clean.redFlagCount).toBe(0);
  });
});

describe("price gap", () => {
  it("computes (store − competitor) / competitor and flags it as a claim", () => {
    const metrics = computeInteractionMetrics([
      value({ fieldKey: "store_price_quoted", amountMinor: 8_100_000, currency: "INR" }),
      value({ fieldKey: "competitor_price_claim", amountMinor: 7_800_000, currency: "INR" }),
    ]);

    // 81,000 vs 78,000 → 3.85%, the guide's own example.
    expect(metrics.priceGap).toBeCloseTo(0.0385, 4);
    expect(metrics.priceGapBasis).toBe("claimed");
  });

  it("takes medians so one stray quote does not swing it", () => {
    const metrics = computeInteractionMetrics([
      value({ fieldKey: "store_price_quoted", amountMinor: 5_000_000, currency: "INR" }),
      value({ fieldKey: "store_price_quoted", amountMinor: 6_000_000, currency: "INR" }),
      value({ fieldKey: "store_price_quoted", amountMinor: 7_000_000, currency: "INR" }),
      value({ fieldKey: "competitor_price_claim", amountMinor: 6_000_000, currency: "INR" }),
    ]);
    expect(metrics.priceGap).toBe(0); // median store 60k vs competitor 60k
  });

  it("refuses to compare across currencies", () => {
    const metrics = computeInteractionMetrics([
      value({ fieldKey: "store_price_quoted", amountMinor: 8_100_000, currency: "INR" }),
      value({ fieldKey: "competitor_price_claim", amountMinor: 1_000_00, currency: "USD" }),
    ]);
    expect(metrics.priceGap).toBeNull();
  });

  it("is null when only one side of the comparison exists", () => {
    const metrics = computeInteractionMetrics([
      value({ fieldKey: "store_price_quoted", amountMinor: 8_100_000, currency: "INR" }),
    ]);
    expect(metrics.priceGap).toBeNull();
  });
});

describe("requirement clarity", () => {
  it("turns the ordinal levels into a delta", () => {
    const metrics = computeInteractionMetrics([
      value({ fieldKey: "requirement_clarity_start", valueText: "low" }),
      value({ fieldKey: "requirement_clarity_end", valueText: "high" }),
    ]);
    expect(metrics.clarityStart).toBe(1);
    expect(metrics.clarityEnd).toBe(3);
    expect(metrics.clarityDelta).toBe(2);
  });

  it("leaves the delta null when an endpoint is missing", () => {
    const metrics = computeInteractionMetrics([
      value({ fieldKey: "requirement_clarity_start", valueText: "low" }),
    ]);
    expect(metrics.clarityDelta).toBeNull();
  });
});

describe("counts and flags", () => {
  it("counts the multi-valued demand fields", () => {
    const metrics = computeInteractionMetrics([
      value({ fieldKey: "purchase_use_cases", valueText: "college" }),
      value({ fieldKey: "purchase_use_cases", valueText: "gaming" }),
      value({ fieldKey: "specification_requirements", valueText: "RTX 4060" }),
      value({ fieldKey: "additional_requirements", valueText: "important" }),
      value({ fieldKey: "competitor_named", valueText: "Amazon" }),
    ]);
    expect(metrics.useCaseCount).toBe(2);
    expect(metrics.requirementCount).toBe(2); // spec + additional
    expect(metrics.competitorCount).toBe(1);
  });

  it("does not count an abstained field", () => {
    const metrics = computeInteractionMetrics([
      value({ fieldKey: "competitor_named", abstention: "not_stated" }),
    ]);
    expect(metrics.competitorCount).toBe(0);
  });

  it("reads the single-valued outcome fields", () => {
    const metrics = computeInteractionMetrics([
      value({ fieldKey: "arrival_intent_state", valueText: "exploratory" }),
      value({ fieldKey: "final_decision_state", valueText: "follow_up_scheduled" }),
      value({ fieldKey: "alternative_offered", valueText: "yes" }),
      value({ fieldKey: "finance_requested", valueText: "loan" }),
    ]);
    expect(metrics.arrivalIntent).toBe("exploratory");
    expect(metrics.decisionState).toBe("follow_up_scheduled");
    expect(metrics.alternativeOffered).toBe("yes");
    expect(metrics.financeRequested).toBe(true);
    expect(metrics.promotionDiscussed).toBe(false);
  });

  it("carries the budget through with its currency", () => {
    const metrics = computeInteractionMetrics([
      value({ fieldKey: "target_budget", amountMinor: 350_000_000, currency: "INR" }),
    ]);
    expect(metrics.targetBudgetMinor).toBe(350_000_000);
    expect(metrics.budgetCurrency).toBe("INR");
  });
});
