import { describe, expect, it } from "vitest";

import {
  budgetPicture,
  clarityMatrix,
  computeDemand,
  distribution,
  nonConversionReasons,
  rankedShare,
} from "@/modules/intelligence/demand";
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
  earliestMs: 0,
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
    arrivalIntent: null,
    clarityStart: null,
    clarityEnd: null,
    targetBudgetMinor: null,
    maxBudgetMinor: null,
    budgetCurrency: "INR",
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

describe("what customers wanted", () => {
  it("counts an interaction once however often it repeats a use case", () => {
    const { entries } = rankedShare(
      [
        row({
          values: [
            value("purchase_use_cases", "gaming"),
            value("purchase_use_cases", "gaming"),
            value("purchase_use_cases", "video editing"),
          ],
        }),
        row({ values: [value("purchase_use_cases", "gaming")] }),
      ],
      ["purchase_use_cases"],
    );
    expect(entries[0]).toMatchObject({ value: "gaming", interactions: 2, share: 1 });
    expect(entries[1]).toMatchObject({ value: "video editing", interactions: 1 });
  });

  it("lets multi-value shares exceed a hundred per cent together", () => {
    // Two wants from one customer is two shares of 100%, not two of 50%. The
    // page must call this penetration rather than a mix.
    const { entries } = rankedShare(
      [
        row({
          values: [value("purchase_use_cases", "gaming"), value("purchase_use_cases", "work")],
        }),
      ],
      ["purchase_use_cases"],
    );
    expect(entries.reduce((sum, entry) => sum + entry.share, 0)).toBeCloseTo(2, 6);
  });

  it("does not merge free text that merely looks similar", () => {
    // Collapsing these would invent a taxonomy nobody agreed to and quietly
    // change what the number means.
    const { entries } = rankedShare(
      [
        row({ values: [value("decision_drivers", "battery life")] }),
        row({ values: [value("decision_drivers", "Battery Life")] }),
      ],
      ["decision_drivers"],
    );
    expect(entries).toHaveLength(2);
  });

  it("measures share against interactions that carried the field", () => {
    // The third record predates the field, so it is not a customer who wanted
    // nothing — it is a customer nobody asked.
    const { entries, eligible } = rankedShare(
      [
        row({ values: [value("brand_preferences", "Sony")] }),
        row({ values: [value("brand_preferences", null, null, "not_stated")] }),
        row({ values: [] }),
      ],
      ["brand_preferences"],
    );
    expect(eligible).toBe(2);
    expect(entries[0]!.share).toBe(0.5);
  });
});

describe("budgets", () => {
  it("takes the median of stated budgets and never fills a gap with zero", () => {
    const picture = budgetPicture([
      row({ targetBudgetMinor: 5_000_000 }),
      row({ targetBudgetMinor: 7_000_000 }),
      row({ targetBudgetMinor: 9_000_000 }),
      row({ targetBudgetMinor: null }),
    ]);
    expect(picture.targetMedian).toBe(7_000_000);
    expect(picture.targetObserved).toBe(3);
    expect(picture.observationRate.value).toBe(0.75);
  });

  it("requires both figures before it will call anything a stretch", () => {
    const picture = budgetPicture([
      row({ targetBudgetMinor: 5_000_000, maxBudgetMinor: 6_000_000 }),
      row({ targetBudgetMinor: 5_000_000 }),
      row({ maxBudgetMinor: 9_000_000 }),
    ]);
    expect(picture.stretchObserved).toBe(1);
    expect(picture.stretchMedian).toBe(1_000_000);
  });

  it("drops a ceiling that sits below the opening budget", () => {
    // Somebody has been misread; a negative stretch is not a finding.
    const picture = budgetPicture([
      row({ targetBudgetMinor: 8_000_000, maxBudgetMinor: 6_000_000 }),
    ]);
    expect(picture.stretchObserved).toBe(0);
    expect(picture.stretchMedian).toBeNull();
  });

  it("reports nothing rather than zero when no budget was stated", () => {
    const picture = budgetPicture([row(), row()]);
    expect(picture.targetMedian).toBeNull();
    expect(picture.observationRate.value).toBe(0);
  });
});

describe("requirement clarity", () => {
  it("places each interaction in the cell it actually travelled", () => {
    const matrix = clarityMatrix([
      row({ clarityStart: 0, clarityEnd: 3 }),
      row({ clarityStart: 1, clarityEnd: 1 }),
      row({ clarityStart: 2, clarityEnd: 2 }),
      row({ clarityStart: 1, clarityEnd: null }),
    ]);
    expect(matrix.cells[0]![3]).toBe(1);
    expect(matrix.cells[1]![1]).toBe(1);
    expect(matrix.paired).toBe(3);
  });

  it("counts the customers who arrived vague and left vague", () => {
    // The number an average hides: a mean creeping from 1.4 to 1.6 can contain
    // forty conversations that went nowhere.
    const matrix = clarityMatrix([
      row({ clarityStart: 0, clarityEnd: 1 }),
      row({ clarityStart: 1, clarityEnd: 0 }),
      row({ clarityStart: 1, clarityEnd: 3 }),
    ]);
    expect(matrix.stalledLow).toBe(2);
    expect(matrix.improved.value).toBeCloseTo(2 / 3, 6);
  });

  it("measures improvement only where both ends were readable", () => {
    const matrix = clarityMatrix([
      row({ clarityStart: 1, clarityEnd: 2 }),
      row({ clarityStart: null, clarityEnd: 3 }),
    ]);
    expect(matrix.improved.observed).toBe(1);
    expect(matrix.improved.value).toBe(1);
  });
});

describe("intent, friction and outcome", () => {
  it("measures high intent against interactions whose intent was readable", () => {
    const metrics = computeDemand([
      row({ arrivalIntent: "ready_to_buy" }),
      row({ arrivalIntent: "specific_product" }),
      row({ arrivalIntent: "exploratory" }),
      row({ arrivalIntent: null }),
    ]);
    expect(metrics.highIntent.observed).toBe(3);
    expect(metrics.highIntent.value).toBeCloseTo(2 / 3, 6);
  });

  it("asks about purchase conditions only where the visit did not close", () => {
    // A customer who bought had no condition left to state, and including them
    // would make the rate look worse the better the store did.
    const metrics = computeDemand([
      row({
        values: [
          value("confirmed_business_outcome", "sale"),
          value("customer_purchase_conditions", null, null, "not_stated"),
        ],
      }),
      row({
        values: [
          value("confirmed_business_outcome", "no_sale"),
          value("customer_purchase_conditions", "if it comes to 75"),
        ],
      }),
      row({
        values: [
          value("confirmed_business_outcome", "no_sale"),
          value("customer_purchase_conditions", null, null, "not_stated"),
        ],
      }),
    ]);
    expect(metrics.purchaseConditions.observed).toBe(2);
    expect(metrics.purchaseConditions.value).toBe(0.5);
  });

  it("excludes sales from the non-conversion reasons", () => {
    const { entries, classified } = nonConversionReasons([
      row({
        values: [
          value("confirmed_business_outcome", "sale"),
          value("primary_non_conversion_reason", "price"),
        ],
      }),
      row({
        values: [
          value("confirmed_business_outcome", "no_sale"),
          value("primary_non_conversion_reason", "price"),
        ],
      }),
    ]);
    expect(classified).toBe(1);
    expect(entries[0]).toMatchObject({ value: "price", interactions: 1, share: 1 });
  });

  it("counts only confirmed no-sales, not interactions of unknown outcome", () => {
    // The earlier version swept in every unresolved interaction — a population
    // we know nothing about — while excluding a customer who explicitly
    // declined. A chart titled "why we did not convert" cannot be built from
    // conversations where we do not know whether we converted.
    const reasons = nonConversionReasons([
      row({
        values: [
          value("confirmed_business_outcome", "no_sale"),
          value("primary_non_conversion_reason", "price"),
        ],
      }),
      row({
        values: [
          value("confirmed_business_outcome", null, null, "insufficient_evidence"),
          value("primary_non_conversion_reason", "stock"),
        ],
      }),
      row({ values: [value("confirmed_business_outcome", "no_sale")] }),
    ]);
    expect(reasons.confirmedNoSales).toBe(2);
    expect(reasons.classified).toBe(1);
    expect(reasons.coverage).toBe(0.5);
    expect(reasons.entries.map((entry) => entry.value)).toEqual(["price"]);
  });

  it("sums a fixed vocabulary to one", () => {
    const { entries } = distribution(
      [row({ arrivalIntent: "exploratory" }), row({ arrivalIntent: "comparing" })],
      (r) => r.arrivalIntent,
    );
    expect(entries.reduce((sum, entry) => sum + entry.share, 0)).toBeCloseTo(1, 6);
  });
});
