import type { MetricSummary } from "@/modules/interaction-metrics/summarize";

/**
 * The arithmetic of a period against the period before it.
 *
 * Pure and free of any server import so it can be unit tested directly — the
 * reader that fetches the two periods lives in `trends.ts`.
 *
 * The honesty guard matters more than the arithmetic: on a handful of
 * interactions a delta is noise, so a comparison is only published when the
 * earlier period holds enough interactions to mean anything.
 */

/** Interactions required in the earlier period before a delta is published. */
export const MIN_COMPARABLE_INTERACTIONS = 5;

/** Movement is called flat below this, so rounding noise does not read as change. */
const FLAT_EPSILON = 0.005;

export type TrendDirection = "up" | "down" | "flat";

export type TrendMetric = {
  key: string;
  label: string;
  current: number | null;
  previous: number | null;
  /** Change in the metric's own unit; null when either side is unmeasured. */
  delta: number | null;
  direction: TrendDirection;
  format: "percent" | "count" | "money";
  /** Whether a rise is good news, so the view can colour it correctly. */
  higherIsBetter: boolean;
};

/** A friction category that moved between the two periods. */
export type TrendMover = {
  key: string;
  current: number;
  previous: number;
  delta: number;
};

type Spec = {
  key: string;
  label: string;
  pick: (summary: MetricSummary) => number | null;
  format: TrendMetric["format"];
  higherIsBetter: boolean;
};

const SPECS: readonly Spec[] = [
  { key: "interactions", label: "Interactions", pick: (s) => s.interactions, format: "count", higherIsBetter: true },
  { key: "purchaseRate", label: "Purchase rate", pick: (s) => s.purchaseRate, format: "percent", higherIsBetter: true },
  { key: "clarityLiftRate", label: "Clarified need", pick: (s) => s.clarityLiftRate, format: "percent", higherIsBetter: true },
  { key: "objectionCoverage", label: "Objection coverage", pick: (s) => s.objectionCoverage, format: "percent", higherIsBetter: true },
  { key: "crossSellRate", label: "Cross-sell offered", pick: (s) => s.crossSellRate, format: "percent", higherIsBetter: true },
  { key: "redFlagRate", label: "Flagged for review", pick: (s) => s.redFlagRate, format: "percent", higherIsBetter: false },
  { key: "medianBudgetMinor", label: "Median budget", pick: (s) => s.medianBudgetMinor, format: "money", higherIsBetter: true },
];

export function computeTrendMetrics(
  current: MetricSummary,
  previous: MetricSummary,
): TrendMetric[] {
  return SPECS.map((spec) => {
    const now = spec.pick(current);
    const before = spec.pick(previous);
    const delta = now !== null && before !== null ? now - before : null;
    const epsilon = spec.format === "count" || spec.format === "money" ? 0 : FLAT_EPSILON;
    const direction: TrendDirection =
      delta === null || Math.abs(delta) <= epsilon ? "flat" : delta > 0 ? "up" : "down";
    return {
      key: spec.key,
      label: spec.label,
      current: now,
      previous: before,
      delta,
      direction,
      format: spec.format,
      higherIsBetter: spec.higherIsBetter,
    };
  });
}

/**
 * Friction categories that moved, biggest move first.
 *
 * Counted as conversations mentioning the category, not raw objections, so one
 * customer repeating a price concern three times does not look like three.
 */
export function computeFrictionMovers(
  current: ReadonlyMap<string, number>,
  previous: ReadonlyMap<string, number>,
): { rising: TrendMover[]; easing: TrendMover[] } {
  const keys = new Set([...current.keys(), ...previous.keys()]);
  const movers: TrendMover[] = [];
  for (const key of keys) {
    const now = current.get(key) ?? 0;
    const before = previous.get(key) ?? 0;
    if (now === before) continue;
    movers.push({ key, current: now, previous: before, delta: now - before });
  }
  return {
    rising: movers.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta),
    easing: movers.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta),
  };
}
