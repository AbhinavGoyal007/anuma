import { budgetPicture, clarityMatrix, computeDemand } from "@/modules/intelligence/demand";
import {
  arrivedDecided,
  clarityImproved,
  closeAfterCommitment,
  competitorMentionIncidence,
  financeDemand,
  nextActionCapture,
  outcomeEstablished,
  recommendationRationaleCoverage,
} from "@/modules/intelligence/measures";
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
  const before = <T>(read: (subject: readonly PopulationRow[]) => T): T | null =>
    previousRows ? read(previousRows) : null;
  const close = closeAfterCommitment(rows);

  return [
    {
      key: "arrived_decided",
      label: "Arrived decided",
      fieldKeys: ["arrival_intent_state"],
      measure: arrivedDecided(rows),
      previous: before(arrivedDecided),
      attention: false,
      cohortKey: "arrived_decided",
    },
    {
      key: "finance_demand",
      label: "Finance demand",
      fieldKeys: ["finance_requested"],
      measure: financeDemand(rows),
      previous: before(financeDemand),
      attention: false,
      cohortKey: "finance_demand",
    },
    {
      key: "clarity_improved",
      label: "Clarity improved",
      fieldKeys: ["requirement_clarity_start", "requirement_clarity_end"],
      measure: clarityImproved(rows),
      previous: before(clarityImproved),
      attention: false,
      cohortKey: "clarity_improved",
    },
    {
      key: "close_after_commitment",
      label: "Close after commitment",
      fieldKeys: ["customer_commitment_signals", "close_attempts"],
      measure: close,
      previous: before(closeAfterCommitment),
      // The one signal on the page that is unambiguously the store's own work
      // and unambiguously bad when low. Marked so the eye lands on it, not
      // scored — the rule is one line and a business can argue with it.
      attention: close.value !== null && close.value < 0.5,
      cohortKey: "close_after_commitment",
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
  /** `mixed_currency` refuses to print a median across two currencies. */
  format: "count" | "percent" | "money" | "mixed_currency";
  /** For counts, the number itself; for money, minor units; else null. */
  amount: number | null;
  currency: string | null;
  measure: Measure | null;
  previous: Measure | null;
  fieldKeys: string[];
  /** The numerator cohort a click opens, where one exists. */
  cohortKey: string | null;
};

export function overviewPulse(
  rows: readonly PopulationRow[],
  previousRows: readonly PopulationRow[] | null,
): PulseItem[] {
  const budget = budgetPicture(rows);
  const before = <T>(read: (subject: readonly PopulationRow[]) => T): T | null =>
    previousRows ? read(previousRows) : null;
  // One currency or none: a median is a number. More than one and it is not,
  // so the tile says so rather than adding rupees to dirhams.
  const single = budget.byCurrency.length === 1 ? budget.byCurrency[0]! : null;

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
      cohortKey: null,
    },
    {
      key: "median_budget",
      label: "Median target budget",
      format: budget.mixed ? "mixed_currency" : "money",
      amount: single?.targetMedian ?? null,
      currency: single?.currency ?? null,
      measure: budget.observationRate,
      previous: null,
      fieldKeys: ["target_budget"],
      cohortKey: null,
    },
    {
      key: "competitor",
      label: "Competitor mentions",
      format: "percent",
      amount: null,
      currency: null,
      measure: competitorMentionIncidence(rows),
      previous: before(competitorMentionIncidence),
      fieldKeys: ["competitor_named"],
      cohortKey: "competitor_mentioned",
    },
    {
      key: "outcome",
      label: "Outcome established",
      format: "percent",
      amount: null,
      currency: null,
      measure: outcomeEstablished(rows),
      previous: before(outcomeEstablished),
      fieldKeys: ["confirmed_business_outcome"],
      cohortKey: "outcome_established",
    },
    {
      key: "rationale",
      label: "Recommendation rationale",
      format: "percent",
      amount: null,
      currency: null,
      measure: recommendationRationaleCoverage(rows),
      previous: before(recommendationRationaleCoverage),
      fieldKeys: ["recommendation_reasons"],
      cohortKey: null,
    },
    {
      key: "next_action",
      label: "Next action capture",
      format: "percent",
      amount: null,
      currency: null,
      measure: nextActionCapture(rows),
      previous: before(nextActionCapture),
      fieldKeys: ["next_action"],
      cohortKey: "next_action_captured",
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
      return {
        key,
        label: labelFor(key),
        size: group.length,
        financeDemand: financeDemand(group),
        clarityImproved: clarityImproved(group),
        closeAfterCommitment: closeAfterCommitment(group),
      };
    })
    .sort((a, b) => b.size - a.size || a.label.localeCompare(b.label))
    .slice(0, limit);
}

/** A count expressed as a measure, so a tile can carry one shape throughout. */
export function countMeasure(value: number, of: number): Measure {
  return measure(value, of, of);
}
