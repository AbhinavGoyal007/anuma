/**
 * Summarising a set of interaction metric rows into rates.
 *
 * One pure function serves both comparisons in the product: a period against
 * the period before it, and a store against its siblings. They ask the same
 * question of different slices, so they must compute it the same way — two
 * summarisers would eventually disagree and a manager would find the seam.
 *
 * Every rate is null rather than zero when nothing was measured. "No objections
 * were raised" and "objections were raised and none were handled" are different
 * findings, and a zero would state the second when only the first is true.
 */

/** The slice of a metrics row a summary needs. */
export type MetricRowSlice = {
  decision_state: string | null;
  clarity_start: number | null;
  clarity_end: number | null;
  objection_coverage: number | null;
  alternative_offered: string | null;
  demo_performed: string | null;
  cross_sell_count: number | null;
  red_flag_count: number | null;
  target_budget_minor: number | null;
  budget_currency: string | null;
};

export type MetricSummary = {
  interactions: number;
  purchased: number;
  purchaseRate: number | null;
  /** Share of measured interactions where the customer left clearer. */
  clarityLiftRate: number | null;
  objectionCoverage: number | null;
  alternativeOfferRate: number | null;
  demoRate: number | null;
  crossSellRate: number | null;
  redFlagRate: number | null;
  medianBudgetMinor: number | null;
  budgetCurrency: string | null;
};

function mean(numbers: readonly number[]): number | null {
  if (numbers.length === 0) return null;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

function median(numbers: readonly number[]): number | null {
  if (numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** Share of rows satisfying `hit` among those `eligible` measured at all. */
function rate(
  rows: readonly MetricRowSlice[],
  eligible: (row: MetricRowSlice) => boolean,
  hit: (row: MetricRowSlice) => boolean,
): number | null {
  const measured = rows.filter(eligible);
  if (measured.length === 0) return null;
  return measured.filter(hit).length / measured.length;
}

export function summarizeMetricRows(rows: readonly MetricRowSlice[]): MetricSummary {
  const budgets = rows
    .map((row) => (row.target_budget_minor === null ? null : Number(row.target_budget_minor)))
    .filter((n): n is number => n !== null);

  return {
    interactions: rows.length,
    purchased: rows.filter((row) => row.decision_state === "purchased").length,
    purchaseRate:
      rows.length > 0
        ? rows.filter((r) => r.decision_state === "purchased").length / rows.length
        : null,
    clarityLiftRate: rate(
      rows,
      (row) => row.clarity_start !== null && row.clarity_end !== null,
      (row) => (row.clarity_end ?? 0) > (row.clarity_start ?? 0),
    ),
    objectionCoverage: mean(
      rows
        .map((row) => (row.objection_coverage === null ? null : Number(row.objection_coverage)))
        .filter((n): n is number => n !== null),
    ),
    alternativeOfferRate: rate(
      rows,
      (row) => row.alternative_offered === "yes" || row.alternative_offered === "no",
      (row) => row.alternative_offered === "yes",
    ),
    demoRate: rate(
      rows,
      (row) => row.demo_performed === "yes" || row.demo_performed === "no",
      (row) => row.demo_performed === "yes",
    ),
    crossSellRate:
      rows.length > 0
        ? rows.filter((r) => (r.cross_sell_count ?? 0) > 0).length / rows.length
        : null,
    redFlagRate:
      rows.length > 0 ? rows.filter((r) => (r.red_flag_count ?? 0) > 0).length / rows.length : null,
    medianBudgetMinor: median(budgets),
    budgetCurrency: rows.find((row) => row.budget_currency)?.budget_currency ?? null,
  };
}

/** The columns a summary needs, for a PostgREST select. */
export const SUMMARY_COLUMNS =
  "decision_state, clarity_start, clarity_end, objection_coverage, alternative_offered, demo_performed, cross_sell_count, red_flag_count, target_budget_minor, budget_currency";
