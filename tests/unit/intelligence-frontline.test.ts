import { describe, expect, it } from "vitest";

import {
  computeFrontline,
  frontlineActionCohorts,
  outcomeAssociations,
} from "@/modules/intelligence/frontline";
import { readOutcome } from "@/modules/intelligence/outcome";
import type { PopulationRow, PopulationValue } from "@/modules/intelligence/population";

const value = (
  fieldKey: string,
  valueText: string | null,
  label: string | null = null,
  abstention: string | null = null,
): PopulationValue => ({
  fieldKey,
  label,
  valueText,
  valueNumber: null,
  amountMinor: null,
  currency: null,
  abstention,
  hasEvidence: true,
});

let seq = 0;
function row(overrides: Partial<PopulationRow> = {}): PopulationRow {
  const values = overrides.values ?? [];
  return {
    conversationId: `c${(seq += 1)}`,
    recordId: `r${seq}`,
    startedAt: "2026-08-01T10:00:00Z",
    locationId: null,
    representativeMembershipId: null,
    teamId: null,
    purchaseCategory: "laptop",
    arrivalIntent: "comparing",
    clarityStart: 1,
    clarityEnd: 2,
    targetBudgetMinor: null,
    maxBudgetMinor: null,
    budgetCurrency: null,
    productsRecommendedCount: 0,
    objectionCount: 0,
    objectionCoverage: null,
    competitorCount: 0,
    financeRequested: false,
    demoPerformed: null,
    alternativeOffered: null,
    crossSellCount: 0,
    upsellCount: 0,
    customerQuestionCount: 0,
    ...overrides,
    values,
    outcome: readOutcome(values),
  };
}

describe("denominators that decide whether a frontline metric is fair", () => {
  it("excludes not-applicable from the demo rate rather than counting it as a failure", () => {
    // A demo that made no sense for the product is not a demo the rep skipped.
    const metrics = computeFrontline([
      row({ demoPerformed: "yes" }),
      row({ demoPerformed: "no" }),
      row({ demoPerformed: "not_applicable" }),
      row({ demoPerformed: null }),
    ]);
    expect(metrics.demoRate.observed).toBe(2);
    expect(metrics.demoRate.value).toBe(0.5);
    expect(metrics.demoRate.eligible).toBe(4);
  });

  it("does not count a record that predates a field as a negative example", () => {
    // The old record carries no cross_sell_pitch row at all. Counting it as "no
    // cross-sell" would make every rate look worse the further back you scroll,
    // purely because the product improved.
    const metrics = computeFrontline([
      row({ values: [value("cross_sell_pitch", "laptop bag", "accessory")] }),
      row({ values: [value("cross_sell_pitch", null, null, "not_stated")] }),
      row({ values: [] }),
    ]);
    expect(metrics.crossSellRate.observed).toBe(2);
    expect(metrics.crossSellRate.value).toBe(0.5);
  });

  it("ignores a stored count that disagrees with the pitches on the record", () => {
    // interaction_metrics is written by whichever version of the pipeline last
    // touched the record. After the v1.3 change the stored count means something
    // different on old rows, and trusting it here reported a confident 100% on
    // records containing no pitch at all.
    const metrics = computeFrontline([
      row({ upsellCount: 3, values: [value("upsell_pitch", null, null, "not_stated")] }),
      row({ upsellCount: 0, values: [value("upsell_pitch", "16 GB to 32 GB", "memory")] }),
    ]);
    expect(metrics.upsellRate.value).toBe(0.5);
  });

  it("measures rationale against interactions that recommended, not against everything", () => {
    const metrics = computeFrontline([
      row({ productsRecommendedCount: 1, values: [value("recommendation_reasons", "battery")] }),
      row({ productsRecommendedCount: 2 }),
      row({ productsRecommendedCount: 0 }),
      row({ productsRecommendedCount: 0 }),
    ]);
    expect(metrics.recommendationRationale.observed).toBe(2);
    expect(metrics.recommendationRationale.value).toBe(0.5);
  });

  it("judges objections per response, not per interaction", () => {
    // One interaction with three objections, two fully handled, should not read
    // as a single fully-handled interaction.
    const metrics = computeFrontline([
      row({
        objectionCount: 3,
        values: [
          value("objection_response", "full"),
          value("objection_response", "full"),
          value("objection_response", "partial"),
        ],
      }),
    ]);
    expect(metrics.fullObjectionHandling.observed).toBe(3);
    expect(metrics.fullObjectionHandling.value).toBeCloseTo(2 / 3, 6);
  });

  it("reports the finance gap as the failure, measured against finance requests", () => {
    const metrics = computeFrontline([
      row({
        financeRequested: true,
        values: [value("commercial_offer_made", "12-month EMI", "finance")],
      }),
      row({ financeRequested: true }),
      row({ financeRequested: true }),
      row({ financeRequested: false }),
    ]);
    expect(metrics.financeOfferGap.observed).toBe(3);
    expect(metrics.financeOfferGap.value).toBeCloseTo(2 / 3, 6);
  });

  it("counts an interaction once however many pitches it contained", () => {
    const metrics = computeFrontline([
      row({
        values: [
          value("cross_sell_pitch", "bag", "accessory"),
          value("cross_sell_pitch", "warranty", "warranty_service_plan"),
          value("cross_sell_pitch", "mouse", "accessory"),
        ],
      }),
      row({ values: [value("cross_sell_pitch", null, null, "not_stated")] }),
    ]);
    expect(metrics.crossSellRate.affected).toBe(1);
    expect(metrics.crossSellRate.value).toBe(0.5);
  });

  it("returns null rather than zero when nothing was eligible", () => {
    const metrics = computeFrontline([row(), row()]);
    expect(metrics.demoRate.value).toBeNull();
    expect(metrics.financeOfferGap.value).toBeNull();
  });
});

describe("the interactions behind each failure", () => {
  it("finds a ready-to-buy customer who was never asked for the sale", () => {
    const cohorts = frontlineActionCohorts([
      row({
        arrivalIntent: "ready_to_buy",
        values: [value("confirmed_business_outcome", "no_sale")],
      }),
      row({
        arrivalIntent: "ready_to_buy",
        values: [
          value("confirmed_business_outcome", "sale"),
          value("close_attempts", "shall I bill it"),
        ],
      }),
    ]);
    const cohort = cohorts.find((c) => c.key === "ready_to_buy_without_close_attempt");
    expect(cohort?.conversationIds).toHaveLength(1);
  });

  it("catches a follow-up agreed with nothing to actually do", () => {
    const cohorts = frontlineActionCohorts([
      row({ values: [value("final_decision_state", "follow_up_scheduled")] }),
      row({
        values: [
          value("final_decision_state", "follow_up_scheduled"),
          value("next_action", "call Saturday"),
        ],
      }),
    ]);
    expect(
      cohorts.find((c) => c.key === "follow_up_without_next_action")?.conversationIds,
    ).toHaveLength(1);
  });

  it("keeps the conversation ids so the count can be opened", () => {
    const cohorts = frontlineActionCohorts([
      row({ productsRecommendedCount: 1 }),
      row({ productsRecommendedCount: 2 }),
    ]);
    const cohort = cohorts.find((c) => c.key === "recommendation_without_rationale");
    expect(cohort?.conversationIds).toHaveLength(2);
    expect(cohort?.conversationIds.every(Boolean)).toBe(true);
  });

  it("orders cohorts by how many interactions they affect", () => {
    const cohorts = frontlineActionCohorts([
      row({ productsRecommendedCount: 1 }),
      row({ productsRecommendedCount: 1 }),
      row({ financeRequested: true }),
    ]);
    expect(cohorts[0]!.key).toBe("recommendation_without_rationale");
  });
});

describe("behaviour against outcome", () => {
  it("drops interactions whose outcome was never established", () => {
    // Filing an unknown outcome under no-sale would manufacture the comparison.
    const associations = outcomeAssociations([
      row({ demoPerformed: "yes", values: [value("confirmed_business_outcome", "sale")] }),
      row({ demoPerformed: "no", values: [value("confirmed_business_outcome", "no_sale")] }),
      row({ demoPerformed: "no", values: [] }),
    ]);
    const demo = associations.find((a) => a.behaviourKey === "demo");
    expect(demo?.saleN).toBe(1);
    expect(demo?.noSaleN).toBe(1);
    expect(demo?.differencePoints).toBeCloseTo(100, 6);
  });

  it("reports nothing rather than a difference when one side is empty", () => {
    const associations = outcomeAssociations([
      row({ values: [value("confirmed_business_outcome", "sale")] }),
    ]);
    expect(associations.every((a) => a.differencePoints === null)).toBe(true);
  });
});
