import { describe, expect, it } from "vitest";

import { readOutcome } from "@/modules/intelligence/outcome";
import type { PopulationRow } from "@/modules/intelligence/population";
import {
  buildSeries,
  DEFAULT_TREND,
  qualifies,
  selectPrincipalSeries,
  TREND_METRICS,
} from "@/modules/intelligence/trend";

const NOW = new Date("2026-08-19T12:00:00.000Z");
const metric = (key: string) => TREND_METRICS.find((item) => item.key === key)!;

let seq = 0;
function row(startedAt: string, overrides: Partial<PopulationRow> = {}): PopulationRow {
  return {
    conversationId: `c${(seq += 1)}`,
    recordId: `r${seq}`,
    startedAt,
    locationId: null,
    representativeMembershipId: null,
    teamId: null,
    purchaseCategory: "laptop",
    arrivalIntent: "exploratory",
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
    values: [],
    outcome: readOutcome([]),
    ...overrides,
  };
}

/** `count` interactions in one week, `matched` of them naming a competitor. */
const week = (iso: string, count: number, matched = 0) =>
  Array.from({ length: count }, (_, index) =>
    row(iso, { competitorCount: index < matched ? 1 : 0 }),
  );

describe("binning on conversation time", () => {
  it("leaves a week with no conversations as a gap, never a zero", () => {
    // Zero customers asking about finance and no customers at all are different
    // facts. Joining across a quiet week would draw a slope out of an absence.
    const series = buildSeries(
      [...week("2026-08-10T10:00:00Z", 10, 5), ...week("2026-07-27T10:00:00Z", 10, 5)],
      metric("competitor_pressure"),
      30,
      NOW,
    );
    const empty = series.points.find((point) => point.eligible === 0);
    expect(empty?.value).toBeNull();
    expect(series.points.some((point) => point.value === 0)).toBe(false);
  });

  it("does not plot a bin too thin to carry a rate", () => {
    // Three conversations give 0% or 100% and nothing between.
    const series = buildSeries(
      week("2026-08-10T10:00:00Z", 3, 3),
      metric("competitor_pressure"),
      30,
      NOW,
    );
    const bin = series.points.find((point) => point.eligible === 3);
    expect(bin?.value).toBeNull();
    expect(bin?.thin).toBe(true);
  });

  it("plots a bin that clears the bar", () => {
    const series = buildSeries(
      week("2026-08-10T10:00:00Z", DEFAULT_TREND.minimumPerBin, 4),
      metric("competitor_pressure"),
      30,
      NOW,
    );
    const bin = series.points.find((point) => point.eligible === DEFAULT_TREND.minimumPerBin);
    expect(bin?.value).toBeCloseTo(4 / DEFAULT_TREND.minimumPerBin, 6);
    expect(bin?.thin).toBe(false);
  });

  it("counts interactions against the population that could answer the question", () => {
    // Arrival intent that could not be classified is not a customer who arrived
    // undecided; it is a customer nobody could read.
    const rows = [
      ...Array.from({ length: 8 }, () =>
        row("2026-08-10T10:00:00Z", { arrivalIntent: "ready_to_buy" }),
      ),
      ...Array.from({ length: 8 }, () => row("2026-08-10T10:00:00Z", { arrivalIntent: null })),
    ];
    const series = buildSeries(rows, metric("high_intent_arrival"), 30, NOW);
    const bin = series.points.find((point) => point.eligible > 0);
    expect(bin?.eligible).toBe(8);
    expect(bin?.value).toBe(1);
  });
});

describe("whether a line is worth drawing", () => {
  it("refuses a series with too few plotted bins", () => {
    const series = buildSeries(
      week("2026-08-10T10:00:00Z", 20, 10),
      metric("competitor_pressure"),
      90,
      NOW,
    );
    expect(series.plotted).toBe(1);
    expect(qualifies(series)).toBe(false);
  });

  it("accepts a series once enough bins carry a value", () => {
    const rows = ["2026-08-10", "2026-08-03", "2026-07-27", "2026-07-20"].flatMap((day) =>
      week(`${day}T10:00:00Z`, 10, 5),
    );
    expect(qualifies(buildSeries(rows, metric("competitor_pressure"), 90, NOW))).toBe(true);
  });

  it("reports nothing at all rather than an empty chart", () => {
    // Two thin weeks cannot carry any signal, so the page falls back instead of
    // rendering an axis with nothing on it.
    expect(selectPrincipalSeries(week("2026-08-10T10:00:00Z", 3, 1), 90, NOW)).toBeNull();
  });
});

describe("choosing what to lead with", () => {
  const dense = (matchedByWeek: readonly number[]) =>
    ["2026-08-10", "2026-08-03", "2026-07-27", "2026-07-20"].flatMap((day, index) =>
      week(`${day}T10:00:00Z`, 10, matchedByWeek[index] ?? 0),
    );

  it("prefers a rate that actually moved", () => {
    const picked = selectPrincipalSeries(dense([9, 1, 9, 1]), 90, NOW);
    expect(picked?.series.metric.format).toBe("percent");
    expect(picked?.series.movement).not.toBeNull();
  });

  it("is stable — the same rows always choose the same signal", () => {
    const rows = dense([9, 1, 9, 1]);
    expect(selectPrincipalSeries(rows, 90, NOW)?.series.metric.key).toBe(
      selectPrincipalSeries([...rows].reverse(), 90, NOW)?.series.metric.key,
    );
  });

  it("only calls out a movement large enough to matter", () => {
    const flat = buildSeries(dense([5, 5, 5, 5]), metric("competitor_pressure"), 90, NOW);
    expect(flat.movement).toBeNull();
  });

  it("offers the other qualifying signals as alternatives", () => {
    const picked = selectPrincipalSeries(dense([9, 1, 9, 1]), 90, NOW);
    expect(picked!.available.length).toBeGreaterThan(1);
  });
});
