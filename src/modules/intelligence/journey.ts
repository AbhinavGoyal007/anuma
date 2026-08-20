import {
  distribution,
  rankedShare,
  type RankedResult,
  type RankedShare,
} from "@/modules/intelligence/demand";
import { CONCEPTS } from "@/modules/intelligence/concepts";
import { isSupported, presenceOf, statedText } from "@/modules/intelligence/effective";
import type { ActionCohort } from "@/modules/intelligence/frontline";
import { measure, type Measure } from "@/modules/intelligence/guardrails";
import {
  alternativeApplicableRate,
  closeAttemptIncidence,
  commercialOfferIncidence,
  demoApplicableRate,
  outcomeEstablished,
  preferenceFormed,
  recommendationIncidence,
} from "@/modules/intelligence/measures";
import { DECISION_LABELS, DECISION_ORDER } from "@/modules/intelligence/outcome";
import type { PopulationRow } from "@/modules/intelligence/population";

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

const has = (row: PopulationRow, fieldKey: string): boolean =>
  statedText(row.values, fieldKey).length > 0;

const supported = (row: PopulationRow, fieldKey: string): boolean =>
  isSupported(row.values, fieldKey);

export const JOURNEY_COHORTS = ["high_intent", "ready_to_buy", "specific_product", "all"] as const;
export type JourneyCohortKey = (typeof JOURNEY_COHORTS)[number];

export const COHORT_LABELS: Readonly<Record<JourneyCohortKey, string>> = {
  high_intent: "High intent",
  ready_to_buy: "Ready to buy",
  specific_product: "Specific product",
  all: "All analysed",
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
  /**
   * The gap immediately before this stage, sized by the group its link opens.
   *
   * Both numbers come from the leakage cohort's own denominator, so "5 of 8 had
   * the next state observed" and "3 next-state observations missing" are
   * complementary and the second is exactly what the link opens. Deriving them
   * separately let the rail print a number the drill-down then contradicted,
   * which a reader checks once and never trusts again.
   */
  gap: {
    cohortKey: string;
    /** Interactions that could have carried the next state. */
    measurable: number;
    /** Of those, how many did. */
    observed: number;
    /** Of those, how many did not. */
    missing: number;
    share: number | null;
  } | null;
};

/**
 * The customer decision states, and only those.
 *
 * A sale was the last stop on this rail, and even with careful copy that made
 * the whole thing read as a funnel ending in a purchase — as though buying were
 * the state after showing interest, and anyone not there had dropped out. The
 * business result is a different axis and now sits below, beside the customer's
 * own closing state, where the two can be read as the separate facts they are.
 */
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
    label: "Cohort",
    meaning: "Everyone in the selected group.",
    gapCohortKey: null,
    test: () => true,
  },
  {
    key: "requirement_clear",
    label: "Requirement clear",
    meaning: "Requirement clarity reached medium or high by the close.",
    gapCohortKey: "clarity_not_reached",
    test: (row) => row.clarityEnd !== null && row.clarityEnd >= 2,
  },
  {
    key: "preference_formed",
    label: "Preference formed",
    meaning: "Ended the conversation on a specific preferred product.",
    gapCohortKey: "no_preference_formed",
    test: (row) => has(row, "final_preferred_product"),
    fieldKey: "final_preferred_product",
  },
  {
    key: "commitment",
    label: "Commitment signal",
    meaning: "Gave at least one explicit buying signal.",
    gapCohortKey: "no_commitment_signal",
    test: (row) => has(row, "customer_commitment_signals"),
    fieldKey: "customer_commitment_signals",
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
  const lostAt = new Map(
    leakage.map((item) => [
      item.key,
      {
        missing: item.conversationIds.length,
        // The population that could answer, not the whole cohort: a record that
        // never carried the field has not failed to reach the state.
        measurable: item.measurable ?? item.conversationIds.length,
      },
    ]),
  );
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

    const leak = state.gapCohortKey ? (lostAt.get(state.gapCohortKey) ?? null) : null;
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
      gap:
        state.gapCohortKey === null || leak === null
          ? null
          : {
              cohortKey: state.gapCohortKey,
              measurable: leak.measurable,
              observed: leak.measurable - leak.missing,
              missing: leak.missing,
              share:
                leak.measurable > 0 ? (leak.measurable - leak.missing) / leak.measurable : null,
            },
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
  // Delegated to the canonical measures, so the same behaviour cannot read one
  // way here and another way on Frontline. It did exactly that once: demo was
  // divided by the whole cohort here and by the interactions where it applied
  // there, and one fact showed as 4% on one page and 13% on the other.
  return [
    {
      key: "recommendation",
      label: "Recommended something",
      measure: recommendationIncidence(cohort),
    },
    { key: "demo", label: "Showed the product", measure: demoApplicableRate(cohort) },
    {
      key: "alternative",
      label: "Offered an alternative",
      measure: alternativeApplicableRate(cohort),
    },
    {
      key: "offer",
      label: "Made a commercial offer",
      measure: commercialOfferIncidence(cohort),
    },
    { key: "close", label: "Asked for the sale", measure: closeAttemptIncidence(cohort) },
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
    // Pushed even when empty. The rail's gaps are fixed slots that must render
    // whatever the data holds, and they take their denominator from here — a
    // cohort that vanished when nothing was missing took the slot with it.
    // Callers that list gaps as work filter on the count.
    cohorts.push({
      key,
      headline,
      reason,
      evidenceFieldKeys,
      measurable,
      conversationIds: rows.map((row) => row.conversationId),
    });
  };

  // Clarity is a graded reading rather than a presence, so "still unclear" is
  // already a definitive answer where the field was readable at all.
  const clarityMeasurable = cohort.filter((row) => row.clarityEnd !== null);
  push(
    "clarity_not_reached",
    "left with their requirement still unclear",
    "Requirement clarity was still none or low at the close",
    ["requirement_clarity_end", "customer_questions"],
    clarityMeasurable.length,
    clarityMeasurable.filter((row) => row.clarityEnd! <= 1),
  );

  // Clear requirement, and a preferred product definitively absent. An
  // unreadable preference is a data-quality question, not a decision that
  // stopped.
  const preferenceDecidable = cohort.filter((row) => {
    const status = CONCEPTS.preference_formed.status(row);
    return status === "yes" || status === "no";
  });
  push(
    "no_preference_formed",
    "had a clear requirement with no preferred product observed",
    "Requirement was clear at the close and no preferred product was recorded",
    ["specification_requirements", "products_considered"],
    preferenceDecidable.length,
    preferenceDecidable.filter((row) => CONCEPTS.preference_formed.status(row) === "no"),
  );

  const commitmentDecidable = cohort.filter((row) => {
    if (!has(row, "final_preferred_product")) return false;
    const status = presenceOf(row.values, "customer_commitment_signals");
    return status === "yes" || status === "no";
  });
  push(
    "no_commitment_signal",
    "settled on a product with no commitment signal observed",
    "A preferred product was recorded and no commitment signal was observed",
    ["final_preferred_product", "objections"],
    commitmentDecidable.length,
    commitmentDecidable.filter(
      (row) => presenceOf(row.values, "customer_commitment_signals") === "no",
    ),
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

/** A labelled slice of a cohort, for the two outcome distributions. */
export type OutcomeSlice = { key: string; label: string; count: number; share: number };

/**
 * What the business got, and where the customer landed.
 *
 * Two distributions rather than one, because an unestablished outcome is not a
 * no-sale and a customer who agreed to come back is not a failure. Reading them
 * side by side is the fastest way to see how much of the picture we simply do
 * not have.
 */
export function outcomeDistributions(cohort: readonly PopulationRow[]): {
  business: OutcomeSlice[];
  decision: OutcomeSlice[];
} {
  const size = cohort.length || 1;
  const slice = (key: string, label: string, matched: number): OutcomeSlice => ({
    key,
    label,
    count: matched,
    share: matched / size,
  });

  return {
    business: [
      slice("sale", "Sale", cohort.filter((row) => row.outcome.business === "sale").length),
      slice(
        "no_sale",
        "No sale",
        cohort.filter((row) => row.outcome.business === "no_sale").length,
      ),
      slice(
        "unknown",
        "Unconfirmed",
        cohort.filter((row) => row.outcome.business === "unknown").length,
      ),
    ],
    decision: DECISION_ORDER.map((state) =>
      slice(
        state,
        DECISION_LABELS[state],
        cohort.filter((row) => row.outcome.decision === state).length,
      ),
    ).filter((entry) => entry.count > 0),
  };
}

/** Where in the estate the journey is breaking, by store or category. */
export type JourneyBreakdownRow = {
  key: string;
  label: string;
  size: number;
  requirementClear: Measure;
  preferenceFormed: Measure;
  commitment: Measure;
  /** Whether we ended up knowing the result at all — not whether it was a sale. */
  outcomeEstablished: Measure;
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
        // The canonical helper, so this column and the Overview signal of the
        // same name cannot drift apart.
        preferenceFormed: preferenceFormed(rows),
        commitment: stage("commitment"),
        // Whether the result became known, which is a question about our own
        // record. Sale rate lives on the outcome panels, where the two axes are
        // shown side by side and cannot be read as one.
        outcomeEstablished: outcomeEstablished(rows),
      };
    })
    .sort((a, b) => b.size - a.size);
}

/**
 * What was on the table, what was put forward, and what the customer settled on.
 *
 * Three separate lists rather than one funnel. A product can be preferred
 * without ever having been recommended — the customer walked in wanting it —
 * and a shape that only ever narrows would quietly deny that.
 */
export type ProductPath = {
  considered: RankedResult;
  recommended: RankedResult;
  preferred: RankedResult;
  /** How customers reacted to what was recommended. */
  response: { entries: RankedShare[]; classified: number };
};

export function productPath(cohort: readonly PopulationRow[], limit = 5): ProductPath {
  return {
    considered: rankedShare(cohort, ["products_considered"], limit),
    recommended: rankedShare(cohort, ["products_recommended"], limit),
    preferred: rankedShare(cohort, ["final_preferred_product"], limit),
    response: distribution(
      cohort,
      (row) => statedText(row.values, "recommendation_response")[0] ?? null,
      "recommendation_response",
    ),
  };
}

/**
 * The five fixed diagnosis rows.
 *
 * Always these five, always in this order, whatever the counts are. Sorting
 * them by size would put a different row at the top each morning and turn a
 * reference table into a ranking — and the row a manager is looking for would
 * move because something unrelated got worse.
 *
 * Each is a place the decision stopped being observed, not a place it failed:
 * a state we did not record is a hole in our own evidence, and the wording
 * everywhere says so.
 */
export const DIAGNOSIS_ROWS: readonly { cohortKey: string; label: string }[] = [
  { cohortKey: "clarity_not_reached", label: "Requirement still unclear" },
  { cohortKey: "no_preference_formed", label: "Clear requirement, no preferred product observed" },
  { cohortKey: "no_commitment_signal", label: "Preferred product, no commitment signal observed" },
  { cohortKey: "commitment_then_no_sale", label: "Commitment signal + confirmed no-sale" },
  { cohortKey: "commitment_outcome_unknown", label: "Commitment signal + outcome unknown" },
];

export type DiagnosisRow = {
  cohortKey: string;
  label: string;
  affected: number;
  /** The population that could have answered, or null where none is honest. */
  measurable: number | null;
  rate: number | null;
};

export function journeyDiagnosis(leakage: readonly ActionCohort[]): DiagnosisRow[] {
  const byKey = new Map(leakage.map((cohort) => [cohort.key, cohort]));
  return DIAGNOSIS_ROWS.map((row) => {
    const cohort = byKey.get(row.cohortKey);
    const affected = cohort?.conversationIds.length ?? 0;
    const measurable = cohort?.measurable ?? null;
    return {
      cohortKey: row.cohortKey,
      label: row.label,
      affected,
      measurable,
      // A rate over nothing is not a small rate; it is not a rate.
      rate: measurable && measurable > 0 ? affected / measurable : null,
    };
  });
}
