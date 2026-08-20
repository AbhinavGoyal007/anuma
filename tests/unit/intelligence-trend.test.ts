import { describe, expect, it } from "vitest";

import { buildSeries, DEFAULT_TREND, qualifies, TREND_METRICS } from "@/modules/intelligence/trend";
import { notStated, row as buildRow, value } from "../support/population";

const NOW = new Date("2026-08-19T12:00:00.000Z");
const metric = (key: string) => TREND_METRICS.find((item) => item.key === key)!;

/** `count` interactions in one week, `matched` of them naming a competitor. */
const week = (iso: string, count: number, matched = 0) =>
  Array.from({ length: count }, (_, index) =>
    buildRow({
      startedAt: iso,
      values: [
        index < matched ? value("competitor_named", "Croma") : notStated("competitor_named"),
      ],
    }),
  );

describe("binning on conversation time", () => {
  it("leaves a week with no conversations as a gap, never a zero", () => {
    // Zero customers asking about finance and no customers at all are different
    // facts. Joining across a quiet week would draw a slope out of an absence.
    const series = buildSeries(
      [...week("2026-08-10T10:00:00Z", 10, 5), ...week("2026-07-27T10:00:00Z", 10, 5)],
      metric("competitor_mentions"),
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
      metric("competitor_mentions"),
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
      metric("competitor_mentions"),
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
        buildRow({
          startedAt: "2026-08-10T10:00:00Z",
          values: [value("arrival_intent_state", "ready_to_buy")],
        }),
      ),
      ...Array.from({ length: 8 }, () =>
        buildRow({
          startedAt: "2026-08-10T10:00:00Z",
          values: [notStated("arrival_intent_state")],
        }),
      ),
    ];
    const series = buildSeries(rows, metric("high_intent_arrivals"), 30, NOW);
    const bin = series.points.find((point) => point.eligible > 0);
    expect(bin?.eligible).toBe(8);
    expect(bin?.value).toBe(1);
  });
});

describe("whether a line is worth drawing", () => {
  it("refuses a series with too few plotted bins", () => {
    const series = buildSeries(
      week("2026-08-10T10:00:00Z", 20, 10),
      metric("competitor_mentions"),
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
    expect(qualifies(buildSeries(rows, metric("competitor_mentions"), 90, NOW))).toBe(true);
  });

  it("refuses to qualify a series built on thin weeks", () => {
    // Three interactions in one week cannot carry a rate. The slot says so
    // rather than drawing an axis with nothing on it — and rather than
    // substituting a metric the reader did not ask about.
    const thin = buildSeries(
      week("2026-08-10T10:00:00Z", 3, 1),
      metric("competitor_mentions"),
      90,
      NOW,
    );
    expect(qualifies(thin)).toBe(false);
  });
});

describe("the tracked signal is chosen by the reader", () => {
  const dense = (matchedByWeek: readonly number[]) =>
    ["2026-08-10", "2026-08-03", "2026-07-27", "2026-07-20"].flatMap((day, index) =>
      week(`${day}T10:00:00Z`, 10, matchedByWeek[index] ?? 0),
    );

  it("only calls out a movement large enough to matter", () => {
    const flat = buildSeries(dense([5, 5, 5, 5]), metric("competitor_mentions"), 90, NOW);
    expect(flat.movement).toBeNull();
  });

  it("reports the movement when one is real", () => {
    const swung = buildSeries(dense([9, 1, 9, 1]), metric("competitor_mentions"), 90, NOW);
    expect(swung.movement).not.toBeNull();
  });

  it("offers the same six signals whatever the data did", () => {
    // No automatic promotion: the chart never picks its own subject, so two
    // mornings are comparable.
    expect(TREND_METRICS.map((item) => item.key)).toEqual([
      "high_intent_arrivals",
      "clarity_improved",
      "preference_formed",
      "close_after_commitment",
      "competitor_mentions",
      "finance_demand",
    ]);
  });
});
