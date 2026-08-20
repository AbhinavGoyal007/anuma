import { budgetPicture } from "@/modules/intelligence/demand";
import { frontlineActionCohorts, type ActionCohort } from "@/modules/intelligence/frontline";
import { measure, type Measure } from "@/modules/intelligence/guardrails";
import { journeyLeakageCohorts } from "@/modules/intelligence/journey";
import {
  arrivedDecided,
  clarityImproved,
  closeAfterCommitment,
  competitorMentionIncidence,
  financeDemand,
  nextActionCapture,
  objectionIncidence,
  preferenceFormed,
  recommendationIncidence,
} from "@/modules/intelligence/measures";
import type { PopulationRow } from "@/modules/intelligence/population";

/**
 * The Overview's fixed furniture.
 *
 * Everything here is a registry rather than a calculation that picks its own
 * winner. The four signals are the same four every morning, in the same
 * positions; the six pulse figures likewise; the trend offers the same six tabs
 * whether or not any of them moved. A manager who opens this page every day
 * learns where to look once.
 *
 * Only the priority actions reorder, and only inside a stated tier structure —
 * the data decides which three appear, never what kind of thing may appear.
 */

export type SignalKey =
  "high_intent_arrivals" | "clarity_improved" | "preference_formed" | "close_after_commitment";

export type OverviewSignal = {
  key: SignalKey;
  label: string;
  /** The atomic fields the number is read from, for the tooltip and drawer. */
  fieldKeys: string[];
  measure: Measure;
  previous: Measure | null;
  /** The numerator cohort a click opens. Never the inverse gap. */
  cohortKey: string;
};

/** Fixed forever: exactly these four, in this order. Finance is not here. */
export function overviewSignals(
  rows: readonly PopulationRow[],
  previousRows: readonly PopulationRow[] | null,
): OverviewSignal[] {
  const before = (read: (subject: readonly PopulationRow[]) => Measure): Measure | null =>
    previousRows ? read(previousRows) : null;

  return [
    {
      key: "high_intent_arrivals",
      label: "High-intent arrivals",
      fieldKeys: ["arrival_intent_state"],
      measure: arrivedDecided(rows),
      previous: before(arrivedDecided),
      cohortKey: "arrived_decided",
    },
    {
      key: "clarity_improved",
      label: "Clarity improved",
      fieldKeys: ["requirement_clarity_start", "requirement_clarity_end"],
      measure: clarityImproved(rows),
      previous: before(clarityImproved),
      cohortKey: "clarity_improved",
    },
    {
      key: "preference_formed",
      label: "Preference formed",
      fieldKeys: ["final_preferred_product", "requirement_clarity_end"],
      measure: preferenceFormed(rows),
      previous: before(preferenceFormed),
      cohortKey: "preference_formed",
    },
    {
      key: "close_after_commitment",
      label: "Close after commitment",
      fieldKeys: ["customer_commitment_signals", "close_attempts"],
      measure: closeAfterCommitment(rows),
      previous: before(closeAfterCommitment),
      cohortKey: "close_after_commitment",
    },
  ];
}

/**
 * Priority actions, chosen by a stated tier order rather than by size alone.
 *
 * A confirmed red flag outranks a large execution gap because somebody has
 * already said that interaction needs a person, and an interaction where a
 * ready-to-buy customer left without a sale outranks a rate. Only inside a tier
 * does volume decide, and ties fall back to the registry order below so the
 * same data always produces the same three rows.
 */
export const PRIORITY_TIERS: readonly (readonly string[])[] = [
  // Tier 1 — confirmed or high-consequence.
  ["red_flag_raised", "ready_to_buy_no_sale", "commitment_then_no_sale"],
  // Tier 2 — high-intent uncertainty.
  ["commitment_outcome_unknown", "ready_to_buy_without_close_attempt"],
  // Tier 3 — execution review.
  [
    "commitment_without_close_attempt",
    "objection_handling_gap",
    "recommendation_without_rationale",
    "finance_question_without_response",
    "follow_up_without_next_action",
  ],
];

/** Below this a cohort is not worth a manager's morning. */
export const MINIMUM_PRIORITY_AFFECTED = 5;

/** Exactly three rows; a slot with nothing to put in it stays empty. */
export const PRIORITY_ROWS = 3;

function selectPriority(
  cohorts: readonly ActionCohort[],
  tiers: readonly (readonly string[])[],
): (ActionCohort | null)[] {
  const byKey = new Map(cohorts.map((cohort) => [cohort.key, cohort]));
  const chosen: ActionCohort[] = [];

  for (const tier of tiers) {
    const available = tier
      .flatMap((key) => {
        const cohort = byKey.get(key);
        return cohort && cohort.conversationIds.length >= MINIMUM_PRIORITY_AFFECTED
          ? [{ cohort, rank: tier.indexOf(key) }]
          : [];
      })
      .sort(
        (a, b) =>
          b.cohort.conversationIds.length - a.cohort.conversationIds.length || a.rank - b.rank,
      );
    for (const { cohort } of available) {
      if (chosen.length >= PRIORITY_ROWS) break;
      chosen.push(cohort);
    }
    if (chosen.length >= PRIORITY_ROWS) break;
  }

  // The three slots always exist. An empty one says so rather than being filled
  // with a different kind of metric to avoid the gap.
  return Array.from({ length: PRIORITY_ROWS }, (_, index) => chosen[index] ?? null);
}

export function overviewPriorityActions(rows: readonly PopulationRow[]): (ActionCohort | null)[] {
  return selectPriority(
    [...frontlineActionCohorts(rows), ...journeyLeakageCohorts(rows)],
    PRIORITY_TIERS,
  );
}

/** Frontline reviews draw from the frontline cohorts only. */
export const FRONTLINE_PRIORITY_TIERS: readonly (readonly string[])[] = [
  ["red_flag_raised"],
  [
    "ready_to_buy_without_close_attempt",
    "commitment_without_close_attempt",
    "objection_handling_gap",
  ],
  [
    "recommendation_without_rationale",
    "finance_question_without_response",
    "follow_up_without_next_action",
  ],
];

export function frontlinePriorityReviews(rows: readonly PopulationRow[]): (ActionCohort | null)[] {
  return selectPriority(frontlineActionCohorts(rows), FRONTLINE_PRIORITY_TIERS);
}

/** One of the six figures across the Business Pulse. Fixed forever. */
export type PulseItem = {
  key: string;
  label: string;
  /** `mixed_currency` refuses to print a median across two currencies. */
  format: "percent" | "money" | "mixed_currency";
  /** Money in minor units; null for rates. */
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
  const before = (read: (subject: readonly PopulationRow[]) => Measure): Measure | null =>
    previousRows ? read(previousRows) : null;
  // One currency or none: a median is a number. More than one and it is not,
  // so the tile says so rather than adding rupees to dirhams.
  const single = budget.byCurrency.length === 1 ? budget.byCurrency[0]! : null;

  return [
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
      key: "finance_demand",
      label: "Finance demand",
      format: "percent",
      amount: null,
      currency: null,
      measure: financeDemand(rows),
      previous: before(financeDemand),
      fieldKeys: ["finance_requested"],
      cohortKey: "finance_demand",
    },
    {
      key: "competitor_mentions",
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
      key: "recommendation_incidence",
      label: "Recommendation incidence",
      format: "percent",
      amount: null,
      currency: null,
      measure: recommendationIncidence(rows),
      previous: before(recommendationIncidence),
      fieldKeys: ["products_recommended"],
      cohortKey: "recommendation_made",
    },
    {
      key: "objection_incidence",
      label: "Objection incidence",
      format: "percent",
      amount: null,
      currency: null,
      measure: objectionIncidence(rows),
      previous: before(objectionIncidence),
      fieldKeys: ["objections"],
      cohortKey: "objection_raised",
    },
    {
      key: "next_action_capture",
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
 * The Overview breakdown: the same four management signals, by store or by
 * category, with the dimension chosen by the reader rather than by the data.
 *
 * Auto-switching to whichever dimension "had more in it" moved the page under
 * the reader and made two mornings incomparable.
 */
export type BreakdownDimension = "stores" | "categories";

export type BreakdownRow = {
  key: string;
  label: string;
  size: number;
  highIntent: Measure;
  clarityImproved: Measure;
  preferenceFormed: Measure;
  closeAfterCommitment: Measure;
};

export function overviewBreakdown(
  rows: readonly PopulationRow[],
  by: (row: PopulationRow) => string | null,
  labelFor: (key: string) => string,
): BreakdownRow[] {
  const groups = new Map<string, PopulationRow[]>();
  for (const row of rows) {
    const key = by(row);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()]
    .map(([key, group]) => ({
      key,
      label: labelFor(key),
      size: group.length,
      highIntent: arrivedDecided(group),
      clarityImproved: clarityImproved(group),
      preferenceFormed: preferenceFormed(group),
      closeAfterCommitment: closeAfterCommitment(group),
    }))
    .sort((a, b) => b.size - a.size || a.label.localeCompare(b.label));
}

/** A count expressed as a measure, so a tile can carry one shape throughout. */
export function countMeasure(value: number, of: number): Measure {
  return measure(value, of, of);
}
