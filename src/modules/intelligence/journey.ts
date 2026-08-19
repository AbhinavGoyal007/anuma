import type { ActionCohort } from "@/modules/intelligence/frontline";
import { measure, type Measure } from "@/modules/intelligence/guardrails";
import { isUnresolved } from "@/modules/intelligence/outcome";
import type { PopulationRow, PopulationValue } from "@/modules/intelligence/population";

/**
 * How far customers got, and where they stopped getting further.
 *
 * Not a funnel. A funnel's narrowing width asserts that everyone entering at the
 * top was obliged to pass through every stage, and these conversations were not:
 * a customer can arrive having already chosen, or leave without ever forming a
 * preference, without either being a failure. What is shown is how much of a
 * cohort was *observed* in each state, which is a weaker and truer claim.
 *
 * Two numbers per stage, because they answer different questions. Stage reach is
 * the share of the whole cohort seen in that state. Conditional progression is
 * the share of those who reached the previous state and then reached this one —
 * that is the one that localises a problem, because a stage can look thin simply
 * because the stage before it was.
 */

const present = (row: PopulationRow, fieldKey: string): PopulationValue[] =>
  row.values.filter((value) => value.fieldKey === fieldKey && !value.abstention);

const has = (row: PopulationRow, fieldKey: string): boolean => present(row, fieldKey).length > 0;

const supported = (row: PopulationRow, fieldKey: string): boolean =>
  row.values.some((value) => value.fieldKey === fieldKey);

export const JOURNEY_COHORTS = ["high_intent", "ready_to_buy", "specific_product", "all"] as const;
export type JourneyCohortKey = (typeof JOURNEY_COHORTS)[number];

export const COHORT_LABELS: Readonly<Record<JourneyCohortKey, string>> = {
  high_intent: "Arrived decided",
  ready_to_buy: "Ready to buy",
  specific_product: "Asked for a product",
  all: "Everyone analysed",
};

export function selectCohort(
  rows: readonly PopulationRow[],
  key: JourneyCohortKey,
): PopulationRow[] {
  switch (key) {
    case "ready_to_buy":
      return rows.filter((row) => row.arrivalIntent === "ready_to_buy");
    case "specific_product":
      return rows.filter((row) => row.arrivalIntent === "specific_product");
    case "high_intent":
      return rows.filter(
        (row) => row.arrivalIntent === "ready_to_buy" || row.arrivalIntent === "specific_product",
      );
    default:
      return [...rows];
  }
}

export type JourneyStage = {
  key: string;
  label: string;
  /** What reaching this state means, in a manager's words. */
  meaning: string;
  reached: number;
  /** Reached, over the whole cohort. */
  reach: Measure;
  /**
   * Reached, over those who reached the previous state.
   *
   * Null on the first stage, and null where the previous state had nobody in it
   * — a percentage of zero people is not a small number, it is not a number.
   */
  progression: Measure | null;
  /** In the previous state and not this one. The gap worth opening. */
  lost: number;
  /** The leakage cohort a reader lands on by clicking the gap above this stage. */
  gapCohortKey: string | null;
};

/** Whether an interaction was observed in each journey state. */
const STATES: readonly {
  key: string;
  label: string;
  meaning: string;
  gapCohortKey: string | null;
  test: (row: PopulationRow) => boolean;
  /** A record that never carried the field cannot be counted as not reaching. */
  fieldKey?: string;
}[] = [
  {
    key: "entered",
    label: "In the cohort",
    meaning: "Everyone in the selected group.",
    gapCohortKey: null,
    test: () => true,
  },
  {
    key: "requirement_clear",
    label: "Knew what they needed",
    meaning: "Requirement clarity reached medium or high by the close.",
    gapCohortKey: "clarity_not_reached",
    test: (row) => row.clarityEnd !== null && row.clarityEnd >= 2,
  },
  {
    key: "preference_formed",
    label: "Settled on a product",
    meaning: "Ended the conversation on a specific preferred product.",
    gapCohortKey: "no_preference_formed",
    test: (row) => has(row, "final_preferred_product"),
    fieldKey: "final_preferred_product",
  },
  {
    key: "commitment",
    label: "Showed they were ready",
    meaning: "Gave at least one explicit buying signal.",
    gapCohortKey: "no_commitment_signal",
    test: (row) => has(row, "customer_commitment_signals"),
    fieldKey: "customer_commitment_signals",
  },
  {
    key: "sale",
    label: "Bought",
    meaning: "The outcome was established as a sale.",
    gapCohortKey: "commitment_then_no_sale",
    test: (row) => row.outcome.business === "sale",
    fieldKey: "confirmed_business_outcome",
  },
];

/**
 * The stages, with each gap sized by the group its link actually opens.
 *
 * The leakage cohorts are computed first and passed in, because the number
 * printed on a gap has to be the number of interactions behind it. Deriving the
 * two separately let the rail claim eighteen stopped before a sale while the
 * link opened fourteen — and a count that disagrees with the list it opens is
 * worse than no count, because a reader checks it once and stops trusting the
 * page.
 *
 * These states are observed independently rather than passed through in order. A
 * customer can show a buying signal without ever having settled on one product,
 * so a later stage can hold more interactions than an earlier one. The rail says
 * so rather than hiding it behind a shape that only ever narrows.
 */
export function journeyStages(
  cohort: readonly PopulationRow[],
  leakage: readonly ActionCohort[] = journeyLeakageCohorts(cohort),
): JourneyStage[] {
  const lostAt = new Map(leakage.map((item) => [item.key, item.conversationIds.length]));
  const stages: JourneyStage[] = [];
  let previousReached: PopulationRow[] = [...cohort];

  STATES.forEach((state, index) => {
    // A record produced before a field existed has not failed to reach the
    // state; nobody asked. It leaves the denominator rather than counting
    // against the store.
    const eligible = state.fieldKey
      ? cohort.filter((row) => supported(row, state.fieldKey!))
      : [...cohort];
    const reachedRows = eligible.filter(state.test);

    const priorEligible =
      index === 0 ? [] : previousReached.filter((row) => eligible.includes(row));
    const progressed = priorEligible.filter(state.test);

    stages.push({
      key: state.key,
      label: state.label,
      meaning: state.meaning,
      reached: reachedRows.length,
      reach: measure(reachedRows.length, cohort.length, eligible.length),
      progression:
        index === 0 || priorEligible.length === 0
          ? null
          : measure(progressed.length, priorEligible.length, priorEligible.length),
      lost: state.gapCohortKey ? (lostAt.get(state.gapCohortKey) ?? 0) : 0,
      gapCohortKey: state.gapCohortKey,
    });

    previousReached = reachedRows;
  });

  return stages;
}

/**
 * What the representative did, laid alongside the customer's journey.
 *
 * Kept in a separate lane rather than mixed into the stages above, because
 * these are not states a customer passes through. Putting "demo performed"
 * between "settled on a product" and "showed they were ready" would imply an
 * order that does not exist.
 */
export type InterventionRate = { key: string; label: string; measure: Measure };

export function interventions(cohort: readonly PopulationRow[]): InterventionRate[] {
  const size = cohort.length;
  const rate = (test: (row: PopulationRow) => boolean, fieldKey?: string) => {
    const eligible = fieldKey ? cohort.filter((row) => supported(row, fieldKey)) : [...cohort];
    return measure(eligible.filter(test).length, size, eligible.length);
  };
  return [
    {
      key: "recommendation",
      label: "Recommended something",
      measure: rate((row) => row.productsRecommendedCount > 0),
    },
    {
      key: "demo",
      label: "Showed the product",
      measure: rate((row) => row.demoPerformed === "yes"),
    },
    {
      key: "alternative",
      label: "Offered an alternative",
      measure: rate((row) => row.alternativeOffered === "yes"),
    },
    {
      key: "offer",
      label: "Made a commercial offer",
      measure: rate((row) => has(row, "commercial_offer_made"), "commercial_offer_made"),
    },
    {
      key: "close",
      label: "Asked for the sale",
      measure: rate((row) => has(row, "close_attempts"), "close_attempts"),
    },
  ];
}

/**
 * The interactions that stopped between one state and the next.
 *
 * Same shape as the frontline action cohorts, so one drill-down serves both.
 */
export function journeyLeakageCohorts(cohort: readonly PopulationRow[]): ActionCohort[] {
  const cohorts: ActionCohort[] = [];

  const push = (
    key: string,
    headline: string,
    reason: string,
    evidenceFieldKeys: string[],
    measurable: number | null,
    rows: PopulationRow[],
  ) => {
    if (rows.length === 0) return;
    cohorts.push({
      key,
      headline,
      reason,
      evidenceFieldKeys,
      measurable,
      conversationIds: rows.map((row) => row.conversationId),
    });
  };

  const clarityMeasurable = cohort.filter((row) => row.clarityEnd !== null);
  push(
    "clarity_not_reached",
    "left with their requirement still unclear",
    "Requirement clarity was still none or low at the close",
    ["requirement_clarity_end", "customer_questions"],
    clarityMeasurable.length,
    clarityMeasurable.filter((row) => row.clarityEnd! <= 1),
  );

  const preferenceMeasurable = cohort.filter(
    (row) =>
      row.clarityEnd !== null && row.clarityEnd >= 2 && supported(row, "final_preferred_product"),
  );
  push(
    "no_preference_formed",
    "had a clear requirement with no preferred product observed",
    "Requirement was clear at the close and no preferred product was recorded",
    ["specification_requirements", "products_considered"],
    preferenceMeasurable.length,
    preferenceMeasurable.filter((row) => !has(row, "final_preferred_product")),
  );

  const commitmentMeasurable = cohort.filter(
    (row) => has(row, "final_preferred_product") && supported(row, "customer_commitment_signals"),
  );
  push(
    "no_commitment_signal",
    "settled on a product with no commitment signal observed",
    "A preferred product was recorded and no commitment signal was observed",
    ["final_preferred_product", "objections"],
    commitmentMeasurable.length,
    commitmentMeasurable.filter((row) => !has(row, "customer_commitment_signals")),
  );

  // Split deliberately. "Signalled and did not buy" and "signalled and we never
  // found out" look the same in a filter and mean opposite things to a manager:
  // one is a sale to chase, the other is a gap in our own record.
  const signalled = cohort.filter((row) => has(row, "customer_commitment_signals"));
  push(
    "commitment_then_no_sale",
    "showed a buying signal and the outcome was a confirmed no sale",
    "A commitment signal was recorded and the business outcome was confirmed as no sale",
    ["customer_commitment_signals", "primary_non_conversion_reason"],
    signalled.length,
    signalled.filter((row) => row.outcome.business === "no_sale"),
  );
  push(
    "commitment_outcome_unknown",
    "showed a buying signal with no outcome established",
    "A commitment signal was recorded and no business outcome was established either way",
    ["customer_commitment_signals", "next_action"],
    signalled.length,
    signalled.filter((row) => row.outcome.business === "unknown"),
  );

  const readyToBuy = cohort.filter((row) => row.arrivalIntent === "ready_to_buy");
  push(
    "ready_to_buy_no_sale",
    "arrived ready to buy and the outcome was a confirmed no sale",
    "Arrival intent was ready to buy and the business outcome was confirmed as no sale",
    ["arrival_intent_state", "primary_non_conversion_reason"],
    readyToBuy.length,
    readyToBuy.filter((row) => row.outcome.business === "no_sale"),
  );

  return cohorts.sort((a, b) => b.conversationIds.length - a.conversationIds.length);
}

/** Where in the estate the journey is breaking, by store or category. */
export type JourneyBreakdownRow = {
  key: string;
  label: string;
  size: number;
  requirementClear: Measure;
  preferenceFormed: Measure;
  commitment: Measure;
  sale: Measure;
};

export function journeyBreakdown(
  cohort: readonly PopulationRow[],
  by: (row: PopulationRow) => string | null,
  labelFor: (key: string) => string,
): JourneyBreakdownRow[] {
  const groups = new Map<string, PopulationRow[]>();
  for (const row of cohort) {
    const key = by(row);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return [...groups.entries()]
    .map(([key, rows]) => {
      const stages = journeyStages(rows);
      const stage = (name: string) => stages.find((item) => item.key === name)!.reach;
      return {
        key,
        label: labelFor(key),
        size: rows.length,
        requirementClear: stage("requirement_clear"),
        preferenceFormed: stage("preference_formed"),
        commitment: stage("commitment"),
        sale: stage("sale"),
      };
    })
    .sort((a, b) => b.size - a.size);
}
