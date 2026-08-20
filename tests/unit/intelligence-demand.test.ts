import { describe, expect, it } from "vitest";

import {
  budgetPicture,
  clarityMatrix,
  computeDemand,
  contextPrices,
  distribution,
  nonConversionReasons,
  rankedShare,
} from "@/modules/intelligence/demand";
import { notStated, row, value } from "../support/population";

const budget = (minor: number) =>
  value("target_budget", String(minor), { amountMinor: minor, currency: "INR" });
const ceiling = (minor: number) =>
  value("maximum_budget", String(minor), { amountMinor: minor, currency: "INR" });
const CLARITY = ["none", "low", "medium", "high"] as const;
const clarity = (end: "start" | "end", level: number | null) =>
  level === null
    ? notStated(`requirement_clarity_${end}`)
    : value(`requirement_clarity_${end}`, CLARITY[level]!);

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
        row({ values: [notStated("brand_preferences")] }),
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
      row({ values: [budget(5_000_000)] }),
      row({ values: [budget(7_000_000)] }),
      row({ values: [budget(9_000_000)] }),
      row({ values: [notStated("target_budget")] }),
    ]);
    expect(picture.mixed).toBe(false);
    expect(picture.byCurrency[0]!.targetMedian).toBe(7_000_000);
    expect(picture.byCurrency[0]!.targetObserved).toBe(3);
    expect(picture.observationRate.value).toBe(0.75);
  });

  it("requires both figures before it will call anything a stretch", () => {
    const picture = budgetPicture([
      row({ values: [budget(5_000_000), ceiling(6_000_000)] }),
      row({ values: [budget(5_000_000)] }),
      row({ values: [ceiling(9_000_000)] }),
    ]);
    expect(picture.byCurrency[0]!.stretchObserved).toBe(1);
    expect(picture.byCurrency[0]!.stretchMedian).toBe(1_000_000);
  });

  it("drops a ceiling that sits below the opening budget", () => {
    // Somebody has been misread; a negative stretch is not a finding.
    const picture = budgetPicture([row({ values: [budget(8_000_000), ceiling(6_000_000)] })]);
    expect(picture.byCurrency[0]!.stretchObserved).toBe(0);
    expect(picture.byCurrency[0]!.stretchMedian).toBeNull();
  });

  it("reports nothing rather than zero when no budget was stated", () => {
    const picture = budgetPicture([row(), row()]);
    expect(picture.byCurrency).toEqual([]);
    expect(picture.observationRate.value).toBe(0);
  });
});

describe("requirement clarity", () => {
  it("places each interaction in the cell it actually travelled", () => {
    const matrix = clarityMatrix([
      row({ values: [clarity("start", 0), clarity("end", 3)] }),
      row({ values: [clarity("start", 1), clarity("end", 1)] }),
      row({ values: [clarity("start", 2), clarity("end", 2)] }),
      row({ values: [clarity("start", 1), clarity("end", null)] }),
    ]);
    expect(matrix.cells[0]![3]).toBe(1);
    expect(matrix.cells[1]![1]).toBe(1);
    expect(matrix.paired).toBe(3);
  });

  it("counts the customers who arrived vague and left vague", () => {
    // The number an average hides: a mean creeping from 1.4 to 1.6 can contain
    // forty conversations that went nowhere.
    const matrix = clarityMatrix([
      row({ values: [clarity("start", 0), clarity("end", 1)] }),
      row({ values: [clarity("start", 1), clarity("end", 0)] }),
      row({ values: [clarity("start", 1), clarity("end", 3)] }),
    ]);
    expect(matrix.stalledLow).toBe(2);
    expect(matrix.improved.value).toBeCloseTo(2 / 3, 6);
  });

  it("measures improvement only where both ends were readable", () => {
    const matrix = clarityMatrix([
      row({ values: [clarity("start", 1), clarity("end", 2)] }),
      row({ values: [clarity("start", null), clarity("end", 3)] }),
    ]);
    expect(matrix.improved.observed).toBe(1);
    expect(matrix.improved.value).toBe(1);
  });
});

describe("intent, friction and outcome", () => {
  it("measures high intent against interactions whose intent was readable", () => {
    const metrics = computeDemand([
      row({ values: [value("arrival_intent_state", "ready_to_buy")] }),
      row({ values: [value("arrival_intent_state", "specific_product")] }),
      row({ values: [value("arrival_intent_state", "exploratory")] }),
      row({ values: [notStated("arrival_intent_state")] }),
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
          notStated("customer_purchase_conditions"),
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
          notStated("customer_purchase_conditions"),
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
          value("confirmed_business_outcome", null, { abstention: "insufficient_evidence" }),
          value("primary_non_conversion_reason", "stock"),
        ],
      }),
      row({
        values: [
          value("confirmed_business_outcome", "no_sale"),
          notStated("primary_non_conversion_reason"),
        ],
      }),
    ]);
    expect(reasons.confirmedNoSales).toBe(2);
    expect(reasons.classified).toBe(1);
    expect(reasons.coverage.value).toBe(0.5);
    expect(reasons.entries.map((entry) => entry.value)).toEqual(["price"]);
  });

  it("sums a fixed vocabulary to one", () => {
    const { entries } = distribution(
      [
        row({ values: [value("arrival_intent_state", "exploratory")] }),
        row({ values: [value("arrival_intent_state", "comparing")] }),
      ],
      (item) => item.arrivalIntent,
    );
    expect(entries.reduce((sum, entry) => sum + entry.share, 0)).toBeCloseTo(1, 6);
  });
});

describe("currencies are never combined", () => {
  it("keeps rupees and dirhams as separate medians", () => {
    // A median across two currencies is not a smaller number or a larger one —
    // it is not a number. Nothing is converted: an FX rate is a business
    // decision with a date on it.
    const picture = budgetPicture([
      row({
        values: [value("target_budget", "50000", { amountMinor: 5_000_000, currency: "INR" })],
      }),
      row({
        values: [value("target_budget", "70000", { amountMinor: 7_000_000, currency: "INR" })],
      }),
      row({ values: [value("target_budget", "2000", { amountMinor: 200_000, currency: "AED" })] }),
    ]);
    expect(picture.mixed).toBe(true);
    expect(picture.byCurrency).toHaveLength(2);
    const inr = picture.byCurrency.find((line) => line.currency === "INR")!;
    const aed = picture.byCurrency.find((line) => line.currency === "AED")!;
    expect(inr.targetMedian).toBe(6_000_000);
    expect(inr.targetObserved).toBe(2);
    expect(aed.targetMedian).toBe(200_000);
    // No single median exists across the two, and none is offered.
    expect(picture.byCurrency.some((line) => line.currency === null)).toBe(false);
  });

  it("keeps quoted and claimed prices apart by currency too", () => {
    const prices = contextPrices([
      row({
        values: [value("store_price_quoted", "59000", { amountMinor: 5_900_000, currency: "INR" })],
      }),
      row({
        values: [value("store_price_quoted", "2400", { amountMinor: 240_000, currency: "AED" })],
      }),
    ]);
    expect(prices.mixed).toBe(true);
    expect(prices.storeQuoted).toHaveLength(2);
  });
});

describe("no-sale reasons, to the specified fixture", () => {
  it("reports share against reasons observed and coverage against confirmed no-sales", () => {
    const reasons = nonConversionReasons([
      ...Array.from({ length: 8 }, () =>
        row({
          values: [
            value("confirmed_business_outcome", "no_sale"),
            value("primary_non_conversion_reason", "price"),
          ],
        }),
      ),
      ...Array.from({ length: 8 }, () =>
        row({
          values: [
            value("confirmed_business_outcome", "no_sale"),
            value("primary_non_conversion_reason", "stock"),
          ],
        }),
      ),
      ...Array.from({ length: 4 }, () =>
        row({
          values: [
            value("confirmed_business_outcome", "no_sale"),
            notStated("primary_non_conversion_reason"),
          ],
        }),
      ),
    ]);
    expect(reasons.confirmedNoSales).toBe(20);
    expect(reasons.classified).toBe(16);
    expect(reasons.entries.find((entry) => entry.value === "price")!.share).toBe(0.5);
    expect(reasons.coverage.value).toBe(0.8);
  });
});
