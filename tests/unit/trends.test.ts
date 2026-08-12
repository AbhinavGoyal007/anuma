import { describe, expect, it } from "vitest";

import {
  summarizeMetricRows,
  type MetricRowSlice,
} from "@/modules/interaction-metrics/summarize";
import {
  computeFrictionMovers,
  computeTrendMetrics,
} from "@/modules/interaction-metrics/trend-math";

/**
 * Period-over-period movement drives decisions ("price friction is rising"), so
 * the arithmetic and — more importantly — the refusal to compare thin samples
 * are pinned here.
 */

function row(over: Partial<MetricRowSlice> = {}): MetricRowSlice {
  return {
    decision_state: null,
    clarity_start: null,
    clarity_end: null,
    objection_coverage: null,
    alternative_offered: null,
    demo_performed: null,
    cross_sell_count: 0,
    red_flag_count: 0,
    target_budget_minor: null,
    budget_currency: null,
    ...over,
  };
}

function metric(metrics: ReturnType<typeof computeTrendMetrics>, key: string) {
  return metrics.find((m) => m.key === key)!;
}

describe("summarizeMetricRows", () => {
  it("computes rates over the rows that were actually measured", () => {
    const summary = summarizeMetricRows([
      row({ decision_state: "purchased", clarity_start: 1, clarity_end: 3, demo_performed: "yes" }),
      row({ decision_state: "deferred", clarity_start: 2, clarity_end: 2, demo_performed: "no" }),
      // Unmeasured clarity and demo must not enter either denominator.
      row({ decision_state: "researching" }),
    ]);

    expect(summary.interactions).toBe(3);
    expect(summary.purchaseRate).toBeCloseTo(1 / 3);
    expect(summary.clarityLiftRate).toBe(0.5); // 1 improved of 2 measured
    expect(summary.demoRate).toBe(0.5);
  });

  it("returns null, not zero, for a rate nothing measured", () => {
    const summary = summarizeMetricRows([row()]);
    expect(summary.objectionCoverage).toBeNull();
    expect(summary.demoRate).toBeNull();
    expect(summary.clarityLiftRate).toBeNull();
  });

  it("takes the median budget so one outlier cannot move it", () => {
    const summary = summarizeMetricRows([
      row({ target_budget_minor: 5_000_000, budget_currency: "INR" }),
      row({ target_budget_minor: 8_000_000 }),
      row({ target_budget_minor: 900_000_000 }),
    ]);
    expect(summary.medianBudgetMinor).toBe(8_000_000);
    expect(summary.budgetCurrency).toBe("INR");
  });
});

describe("computeTrendMetrics", () => {
  it("reports direction and signed delta in the metric's own unit", () => {
    const current = summarizeMetricRows([
      row({ decision_state: "purchased" }),
      row({ decision_state: "purchased" }),
    ]);
    const previous = summarizeMetricRows([
      row({ decision_state: "purchased" }),
      row({ decision_state: "deferred" }),
    ]);
    const metrics = computeTrendMetrics(current, previous);

    expect(metric(metrics, "purchaseRate").delta).toBeCloseTo(0.5); // 100% vs 50%
    expect(metric(metrics, "purchaseRate").direction).toBe("up");
    expect(metric(metrics, "interactions").direction).toBe("flat");
  });

  it("calls a rounding-level move flat rather than a trend", () => {
    const a = summarizeMetricRows([row({ objection_coverage: 0.8 })]);
    const b = summarizeMetricRows([row({ objection_coverage: 0.803 })]);
    expect(metric(computeTrendMetrics(b, a), "objectionCoverage").direction).toBe("flat");
  });

  it("leaves delta null when either side was never measured", () => {
    const measured = summarizeMetricRows([row({ objection_coverage: 0.8 })]);
    const unmeasured = summarizeMetricRows([row()]);
    const m = metric(computeTrendMetrics(measured, unmeasured), "objectionCoverage");
    expect(m.current).toBe(0.8);
    expect(m.previous).toBeNull();
    // A period with nothing to measure is not a decline; it is unknown.
    expect(m.delta).toBeNull();
    expect(m.direction).toBe("flat");
  });

  it("knows which metrics are bad when they rise", () => {
    const metrics = computeTrendMetrics(summarizeMetricRows([]), summarizeMetricRows([]));
    expect(metric(metrics, "redFlagRate").higherIsBetter).toBe(false);
    expect(metric(metrics, "purchaseRate").higherIsBetter).toBe(true);
  });
});

describe("computeFrictionMovers", () => {
  it("splits risers from easers, biggest move first", () => {
    const { rising, easing } = computeFrictionMovers(
      new Map([
        ["price / budget", 9],
        ["stock / delivery", 1],
        ["weight / size", 4],
      ]),
      new Map([
        ["price / budget", 2],
        ["stock / delivery", 5],
        ["weight / size", 4],
      ]),
    );

    expect(rising.map((m) => m.key)).toEqual(["price / budget"]);
    expect(rising[0]!.delta).toBe(7);
    expect(easing.map((m) => m.key)).toEqual(["stock / delivery"]);
    // Unchanged categories are not movement.
    expect([...rising, ...easing].some((m) => m.key === "weight / size")).toBe(false);
  });

  it("treats a newly appearing category as a rise from zero", () => {
    const { rising } = computeFrictionMovers(new Map([["trust / quality", 3]]), new Map());
    expect(rising[0]).toEqual({ key: "trust / quality", current: 3, previous: 0, delta: 3 });
  });
});
