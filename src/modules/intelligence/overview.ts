import { budgetPicture, clarityMatrix, computeDemand } from "@/modules/intelligence/demand";
import {
  computeFrontline,
  frontlineActionCohorts,
  type ActionCohort,
} from "@/modules/intelligence/frontline";
import { DEFAULT_THRESHOLDS, type CandidateThresholds } from "@/modules/intelligence/candidates";
import { measure, type Measure } from "@/modules/intelligence/guardrails";
import { journeyLeakageCohorts } from "@/modules/intelligence/journey";
import type { PopulationRow } from "@/modules/intelligence/population";

/**
 * The four fixed signals, three actions, six pulse figures and the hotspot
 * table the Overview is contractually made of.
 *
 * Assembled here rather than in the page so the slots are defined once and the
 * page cannot quietly gain a fifth signal because a number happened to be
 * available. Every slot is produced whether or not it has data — a metric with
 * nothing behind it becomes an empty state inside its own tile, never a hole in
 * the grid.
 */

export type SignalKey =
  "arrived_decided" | "finance_demand" | "clarity_improved" | "close_after_commitment";

export type OverviewSignal = {
  key: SignalKey;
  label: string;
  /** The atomic fields the number is read from, for the tooltip and drawer. */
  fieldKeys: string[];
  measure: Measure;
  previous: Measure | null;
  /** True where this signal is the one a manager should look at first. */
  attention: boolean;
  /** The cohort a click opens, where one exists. */
  cohortKey: string | null;
};

export function overviewSignals(
  rows: readonly PopulationRow[],
  previousRows: readonly PopulationRow[] | null,
): OverviewSignal[] {
  const demand = computeDemand(rows);
  const clarity = clarityMatrix(rows);
  const frontline = computeFrontline(rows);
  const before = previousRows
    ? {
        demand: computeDemand(previousRows),
        clarity: clarityMatrix(previousRows),
        frontline: computeFrontline(previousRows),
      }
    : null;

  return [
    {
      key: "arrived_decided",
      label: "Arrived decided",
      fieldKeys: ["arrival_intent_state"],
      measure: demand.highIntent,
      previous: before?.demand.highIntent ?? null,
      attention: false,
      cohortKey: null,
    },
    {
      key: "finance_demand",
      label: "Finance demand",
      fieldKeys: ["finance_requested"],
      measure: demand.financeDemand,
      previous: before?.demand.financeDemand ?? null,
      attention: false,
      cohortKey: "finance_question_without_response",
    },
    {
      key: "clarity_improved",
      label: "Clarity improved",
      fieldKeys: ["requirement_clarity_start", "requirement_clarity_end"],
      measure: clarity.improved,
      previous: before?.clarity.improved ?? null,
      attention: false,
      cohortKey: null,
    },
    {
      key: "close_after_commitment",
      label: "Close after commitment",
      fieldKeys: ["customer_commitment_signals", "close_attempts"],
      measure: frontline.closeAfterCommitment,
      previous: before?.frontline.closeAfterCommitment ?? null,
      // The one signal on the page that is unambiguously the store's own work
      // and unambiguously bad when low. Marked so the eye lands on it, not
      // scored — the rule is one line and a business can argue with it.
      attention:
        frontline.closeAfterCommitment.value !== null && frontline.closeAfterCommitment.value < 0.5,
      cohortKey: "commitment_without_close_attempt",
    },
  ];
}

/**
 * The three cohorts worth a manager's morning, chosen by rule.
 *
 * A raised red flag outranks a rate, because somebody has already said this
 * interaction needs a person. After that it is simply how many interactions are
 * affected: the work of reviewing them is per conversation, so thirty beats
 * three regardless of which is the larger share.
 */
export function overviewActions(
  rows: readonly PopulationRow[],
  thresholds: CandidateThresholds = DEFAULT_THRESHOLDS,
): ActionCohort[] {
  const all = [...frontlineActionCohorts(rows), ...journeyLeakageCohorts(rows)].filter(
    (cohort) => cohort.conversationIds.length >= thresholds.materialAffected,
  );
  const flagged = all.filter((cohort) => cohort.key === "red_flag_raised");
  const rest = all
    .filter((cohort) => cohort.key !== "red_flag_raised")
    .sort(
      (a, b) => b.conversationIds.length - a.conversationIds.length || a.key.localeCompare(b.key),
    );
  return [...flagged, ...rest].slice(0, 3);
}

/** One of the six figures across the bottom of the first viewport. */
export type PulseItem = {
  key: string;
  label: string;
  format: "count" | "percent" | "money";
  /** For counts, the number itself; for money, minor units; else null. */
  amount: number | null;
  currency: string | null;
  measure: Measure | null;
  previous: Measure | null;
  fieldKeys: string[];
};

export function overviewPulse(
  rows: readonly PopulationRow[],
  previousRows: readonly PopulationRow[] | null,
): PulseItem[] {
  const demand = computeDemand(rows);
  const budget = budgetPicture(rows);
  const frontline = computeFrontline(rows);
  const before = previousRows
    ? { demand: computeDemand(previousRows), frontline: computeFrontline(previousRows) }
    : null;

  return [
    {
      key: "analysed",
      label: "Analysed interactions",
      format: "count",
      amount: rows.length,
      currency: null,
      measure: null,
      previous: null,
      fieldKeys: [],
    },
    {
      key: "median_budget",
      label: "Median target budget",
      format: "money",
      amount: budget.targetMedian,
      currency: budget.currency,
      measure: budget.observationRate,
      previous: null,
      fieldKeys: ["target_budget"],
    },
    {
      key: "competitor",
      label: "Competitor mentions",
      format: "percent",
      amount: null,
      currency: null,
      measure: demand.competitorPressure,
      previous: before?.demand.competitorPressure ?? null,
      fieldKeys: ["competitor_named"],
    },
    {
      key: "outcome",
      label: "Outcome established",
      format: "percent",
      amount: null,
      currency: null,
      measure: demand.outcomeClassified,
      previous: before?.demand.outcomeClassified ?? null,
      fieldKeys: ["confirmed_business_outcome"],
    },
    {
      key: "rationale",
      label: "Recommendation rationale",
      format: "percent",
      amount: null,
      currency: null,
      measure: frontline.recommendationRationale,
      previous: before?.frontline.recommendationRationale ?? null,
      fieldKeys: ["recommendation_reasons"],
    },
    {
      key: "next_action",
      label: "Next action capture",
      format: "percent",
      amount: null,
      currency: null,
      measure: frontline.nextActionCapture,
      previous: before?.frontline.nextActionCapture ?? null,
      fieldKeys: ["next_action"],
    },
  ];
}

/**
 * Where in the estate the three management signals differ.
 *
 * By store where more than one is in scope, otherwise by category — a
 * single-store operator gets the comparison actually available to them rather
 * than a table with one row in it.
 */
export type HotspotRow = {
  key: string;
  label: string;
  size: number;
  financeDemand: Measure;
  clarityImproved: Measure;
  closeAfterCommitment: Measure;
};

export function hotspots(
  rows: readonly PopulationRow[],
  by: (row: PopulationRow) => string | null,
  labelFor: (key: string) => string,
  limit = 6,
): HotspotRow[] {
  const groups = new Map<string, PopulationRow[]>();
  for (const row of rows) {
    const key = by(row);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()]
    .map(([key, group]) => {
      const demand = computeDemand(group);
      const clarity = clarityMatrix(group);
      const frontline = computeFrontline(group);
      return {
        key,
        label: labelFor(key),
        size: group.length,
        financeDemand: demand.financeDemand,
        clarityImproved: clarity.improved,
        closeAfterCommitment: frontline.closeAfterCommitment,
      };
    })
    .sort((a, b) => b.size - a.size || a.label.localeCompare(b.label))
    .slice(0, limit);
}

/** A count expressed as a measure, so a tile can carry one shape throughout. */
export function countMeasure(value: number, of: number): Measure {
  return measure(value, of, of);
}
