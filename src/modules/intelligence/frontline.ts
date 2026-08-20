import { closeAfterCommitmentStatus } from "@/modules/intelligence/concepts";
import { distribution, rankedShare, type RankedResult } from "@/modules/intelligence/demand";
import { isSupported, presenceOf, statedRows, statedText } from "@/modules/intelligence/effective";
import {
  DEFAULT_GUARDRAILS,
  measure,
  type Guardrails,
  type Measure,
} from "@/modules/intelligence/guardrails";
import {
  alternativeApplicableRate,
  closeAfterCommitment,
  closeAttemptIncidence,
  commercialOfferIncidence,
  crossSellIncidence,
  demoApplicableRate,
  financeDemand,
  financeQuestionRows,
  financeResponseCoverage,
  isFinanceLabel,
  nextActionCapture,
  normalizeResponseState,
  objectionFullResponseRate,
  questionResponseCoverage,
  recommendationIncidence,
  recommendationRationaleCoverage,
  upsellIncidence,
  type ResponseState,
} from "@/modules/intelligence/measures";
import { isUnresolved } from "@/modules/intelligence/outcome";
import type { PopulationRow } from "@/modules/intelligence/population";

export { normalizeResponseState, type ResponseState };

/**
 * What the frontline did, and what it left on the counter.
 *
 * Pure: takes the population, returns numbers. Every rate is delegated to the
 * canonical measures so that the same concept cannot be defined twice — this
 * file assembles the page's shape, it does not decide a denominator.
 */

const has = (row: PopulationRow, fieldKey: string): boolean =>
  statedText(row.values, fieldKey).length > 0;

/**
 * Whether a field can answer yes or no on this interaction at all.
 *
 * A management gap has to be drawn from interactions where the absence is a
 * fact rather than a gap in extraction, so every absence-based cohort is
 * measured against this population and matches only a definitive no.
 */
const decidable = (row: PopulationRow, fieldKey: string): boolean => {
  const status = presenceOf(row.values, fieldKey);
  return status === "yes" || status === "no";
};

export type FrontlineMetrics = {
  /** Of interactions where a question was asked, how many carry a response state. */
  questionResponseCoverage: Measure;
  /** How often a close was attempted at all, regardless of what preceded it. */
  closeAttemptRate: Measure;
  recommendationRate: Measure;
  recommendationRationale: Measure;
  fullObjectionHandling: Measure;
  demoRate: Measure;
  alternativeRate: Measure;
  /** Customer side: how often finance was raised at all. */
  financeDemand: Measure;
  /** Of finance questions asked, how many carry a usable recorded response. */
  financeQuestionResponse: Measure;
  /** Frontline side: how often any commercial offer was recorded. */
  proactiveOffer: Measure;
  crossSellRate: Measure;
  upsellRate: Measure;
  closeAfterCommitment: Measure;
  nextActionCapture: Measure;
};

export function computeFrontline(rows: readonly PopulationRow[]): FrontlineMetrics {
  return {
    questionResponseCoverage: questionResponseCoverage(rows),
    closeAttemptRate: closeAttemptIncidence(rows),
    recommendationRate: recommendationIncidence(rows),
    recommendationRationale: recommendationRationaleCoverage(rows),
    fullObjectionHandling: objectionFullResponseRate(rows),
    demoRate: demoApplicableRate(rows),
    alternativeRate: alternativeApplicableRate(rows),
    financeDemand: financeDemand(rows),
    financeQuestionResponse: financeResponseCoverage(rows),
    proactiveOffer: commercialOfferIncidence(rows),
    crossSellRate: crossSellIncidence(rows),
    upsellRate: upsellIncidence(rows),
    closeAfterCommitment: closeAfterCommitment(rows),
    nextActionCapture: nextActionCapture(rows),
  };
}

/** A mutually exclusive state and how many events landed in it. */
export type StateSlice = { key: string; label: string; count: number };

/**
 * How objections were answered, and whether finance questions got a response.
 *
 * Counted per event rather than per interaction: a representative who fully
 * answered two of five objections should not read the same as one who answered
 * their only objection. The finance strip deliberately says "no response status
 * recorded" rather than "unanswered" — the absence of a record is not proof
 * that nobody replied.
 */
export function responseCompositions(rows: readonly PopulationRow[]): {
  objection: StateSlice[];
  finance: StateSlice[];
} {
  const objection: Record<string, number> = { full: 0, partial: 0, none: 0 };
  for (const row of rows) {
    for (const value of statedRows(row.values, "objection_response")) {
      const state = (value.valueText ?? "").trim();
      if (state in objection) objection[state] += 1;
    }
  }

  const asked = financeQuestionRows(rows);
  const recorded = asked.filter((row) =>
    statedRows(row.values, "question_response_status").some(
      (value) => isFinanceLabel(value.label) && normalizeResponseState(value.valueText) !== null,
    ),
  ).length;

  return {
    objection: [
      { key: "full", label: "Fully addressed", count: objection.full! },
      { key: "partial", label: "Partly addressed", count: objection.partial! },
      { key: "none", label: "Not addressed", count: objection.none! },
    ],
    finance: [
      { key: "recorded", label: "Response status recorded", count: recorded },
      { key: "unrecorded", label: "No response status recorded", count: asked.length - recorded },
    ],
  };
}

/** How questions were answered overall, per interaction that asked one. */
export function questionResponseComposition(rows: readonly PopulationRow[]): StateSlice[] {
  const counts: Record<ResponseState, number> = {
    answered: 0,
    partial: 0,
    unanswered: 0,
    uncertain: 0,
  };
  let unrecorded = 0;
  for (const row of rows) {
    if (!has(row, "customer_questions")) continue;
    const states = statedRows(row.values, "question_response_status").flatMap((value) => {
      const state = normalizeResponseState(value.valueText);
      return state ? [state] : [];
    });
    if (states.length === 0) {
      unrecorded += 1;
      continue;
    }
    // The weakest recorded state wins: an interaction with one unanswered
    // question has an unanswered question, whatever else went well.
    const worst: ResponseState = states.includes("unanswered")
      ? "unanswered"
      : states.includes("partial")
        ? "partial"
        : states.includes("uncertain")
          ? "uncertain"
          : "answered";
    counts[worst] += 1;
  }
  return [
    { key: "full", label: "Fully answered", count: counts.answered },
    { key: "partial", label: "Partly answered", count: counts.partial },
    { key: "none", label: "Not answered", count: counts.unanswered },
    { key: "uncertain", label: "Uncertain", count: counts.uncertain },
    { key: "unrecorded", label: "No response status recorded", count: unrecorded },
  ];
}

/**
 * The interactions behind a specific failure, so the page can offer them.
 *
 * An action a manager cannot open is a statistic. Each cohort keeps the
 * conversation ids rather than only a count, which is what makes the drill-down
 * exact instead of a re-derived approximation of the same idea.
 */
export type ActionCohort = {
  key: string;
  /** Manager-facing sentence, completed with the count by the page. */
  headline: string;
  /** Why these interactions matched, shown on each row of the drill-down. */
  reason: string;
  /**
   * The fields whose evidence explains the match.
   *
   * A cohort defined by an absence — no reason given, no offer made — cites the
   * thing that was present instead: the recommendation nobody justified, the
   * request nobody answered. There is no transcript line for something never
   * said, and inventing one would be the exact failure the evidence rule exists
   * to prevent.
   */
  evidenceFieldKeys: string[];
  /**
   * The population the affected interactions were drawn from.
   *
   * Ten of twelve and ten of five hundred are the same headline and completely
   * different situations. Null only where no honest denominator exists.
   */
  measurable: number | null;
  conversationIds: string[];
};

export function frontlineActionCohorts(rows: readonly PopulationRow[]): ActionCohort[] {
  const cohorts: ActionCohort[] = [];

  /** Every cohort states the population it was drawn from, or null if none is honest. */
  const push = (
    key: string,
    headline: string,
    reason: string,
    evidenceFieldKeys: string[],
    measurable: number | null,
    matched: readonly PopulationRow[],
  ) => {
    if (matched.length === 0) return;
    cohorts.push({
      key,
      headline,
      reason,
      evidenceFieldKeys,
      measurable,
      conversationIds: matched.map((row) => row.conversationId),
    });
  };

  // Flags raised during extraction, surfaced as work rather than as a badge on a
  // conversation nobody opens. The flag itself is the evidence.
  const flagDecidable = rows.filter((row) => decidable(row, "red_flags"));
  push(
    "red_flag_raised",
    "carried a red flag raised during analysis",
    "At least one red flag was recorded against the interaction",
    ["red_flags"],
    flagDecidable.length,
    flagDecidable.filter((row) => presenceOf(row.values, "red_flags") === "yes"),
  );

  // Recommendation present and a reason definitively absent. An unreadable
  // reason field is a data-quality question, not a coaching one.
  const recommending = rows.filter(
    (row) => presenceOf(row.values, "products_recommended") === "yes",
  );
  const rationaleDecidable = recommending.filter((row) => decidable(row, "recommendation_reasons"));
  push(
    "recommendation_without_rationale",
    "recommended a product without a recorded reason",
    "A recommendation was made and no reason was recorded",
    ["products_recommended"],
    rationaleDecidable.length,
    rationaleDecidable.filter((row) => presenceOf(row.values, "recommendation_reasons") === "no"),
  );

  const financeAsked = financeQuestionRows(rows);
  push(
    "finance_question_without_response",
    "asked a finance question with no response status recorded",
    "A finance-labelled question exists and no finance-labelled response state was recorded",
    ["customer_questions", "question_response_status"],
    financeAsked.length,
    financeAsked.filter(
      (row) =>
        !statedRows(row.values, "question_response_status").some(
          (value) =>
            isFinanceLabel(value.label) && normalizeResponseState(value.valueText) !== null,
        ),
    ),
  );

  const objectionEvaluated = rows.filter((row) =>
    statedRows(row.values, "objection_response").some((value) =>
      ["full", "partial", "none"].includes((value.valueText ?? "").trim()),
    ),
  );
  push(
    "objection_handling_gap",
    "left an objection partly answered or unanswered",
    "At least one objection response was judged partial or none",
    ["objections", "objection_response"],
    objectionEvaluated.length,
    objectionEvaluated.filter((row) =>
      statedRows(row.values, "objection_response").some((value) => {
        const state = (value.valueText ?? "").trim();
        return state === "partial" || state === "none";
      }),
    ),
  );

  // A definitive no, never a maybe. The canonical status already refuses to
  // call an unreadable close attempt "no close after commitment"; a management
  // gap built on "not yes" would turn our own missing evidence into an
  // accusation about the floor.
  const closeDecidable = rows.filter((row) => {
    const status = closeAfterCommitmentStatus(row);
    return status === "yes" || status === "no";
  });
  push(
    "commitment_without_close_attempt",
    "showed a buying signal with no later close attempt recorded",
    "A commitment signal was recorded and no close attempt followed it",
    ["customer_commitment_signals"],
    closeDecidable.length,
    closeDecidable.filter((row) => closeAfterCommitmentStatus(row) === "no"),
  );

  // Ready to buy, outcome never established, and a close attempt definitively
  // absent. Confirmed no-sales are excluded: they are already represented as
  // confirmed-outcome cohorts, and counting them twice would double the work a
  // manager thinks they have.
  const readyToBuy = rows.filter(
    (row) => row.arrivalIntent === "ready_to_buy" && row.outcome.business === "unknown",
  );
  const readyDecidable = readyToBuy.filter((row) => decidable(row, "close_attempts"));
  push(
    "ready_to_buy_without_close_attempt",
    "arrived ready to buy with no close attempt recorded and no outcome established",
    "Arrival intent was ready to buy, the outcome was never established, and no close attempt was recorded",
    ["arrival_intent_state", "close_attempts"],
    readyDecidable.length,
    readyDecidable.filter((row) => presenceOf(row.values, "close_attempts") === "no"),
  );

  const followUp = rows.filter((row) => row.outcome.decision === "follow_up_scheduled");
  const followUpDecidable = followUp.filter((row) => decidable(row, "next_action"));
  push(
    "follow_up_without_next_action",
    "agreed a follow-up with no next action recorded",
    "The customer left on a follow-up and no next action was captured",
    ["final_decision_state"],
    followUpDecidable.length,
    followUpDecidable.filter((row) => presenceOf(row.values, "next_action") === "no"),
  );

  // Largest first: the page shows a handful, and the handful should be the ones
  // worth a manager's morning.
  return cohorts.sort((a, b) => b.conversationIds.length - a.conversationIds.length);
}

/**
 * How often a behaviour appears in sales versus non-sales.
 *
 * Association only. Interactions whose outcome was never established belong to
 * neither group and are dropped, because filing them under no-sale would
 * manufacture the very comparison this is meant to report.
 *
 * Each behaviour carries its own eligible population on each side. A single
 * global "sales N" would count a demo that never applied as a demo the
 * representative skipped, and would make two behaviours with completely
 * different denominators look directly comparable.
 */
export type OutcomeAssociation = {
  behaviourKey: string;
  label: string;
  saleRate: number | null;
  noSaleRate: number | null;
  /** Eligible interactions for this behaviour, per side. */
  saleN: number;
  noSaleN: number;
  saleAffected: number;
  noSaleAffected: number;
  differencePoints: number | null;
  strength: AssociationStrength;
};

/** Whether the two outcome groups can carry a comparison, and how strongly. */
export type AssociationStrength = "suppressed" | "directional" | "descriptive";

export type OutcomeAssociationResult = {
  rows: OutcomeAssociation[];
  /** Confirmed outcomes in scope, for context only — never a shared denominator. */
  saleTotal: number;
  noSaleTotal: number;
};

/**
 * A behaviour, and the population that could have exhibited it.
 *
 * Fixed order, never sorted by effect size. A table that reorders itself puts a
 * different row at the top each morning, and the row a manager is looking for
 * moves because something unrelated changed.
 */
const BEHAVIOURS: readonly {
  key: string;
  label: string;
  eligible: (row: PopulationRow) => boolean;
  matched: (row: PopulationRow) => boolean;
}[] = [
  {
    key: "recommendation",
    label: "Recommendation incidence",
    eligible: (row) => isSupported(row.values, "products_recommended"),
    matched: (row) => row.recommendedCount > 0,
  },
  {
    key: "rationale",
    label: "Recommendation rationale",
    eligible: (row) =>
      row.recommendedCount > 0 && isSupported(row.values, "recommendation_reasons"),
    matched: (row) => has(row, "recommendation_reasons"),
  },
  {
    key: "demo",
    label: "Demo where applicable",
    eligible: (row) => row.demo === "yes" || row.demo === "no",
    matched: (row) => row.demo === "yes",
  },
  {
    key: "alternative",
    label: "Alternative where applicable",
    eligible: (row) => row.alternative === "yes" || row.alternative === "no",
    matched: (row) => row.alternative === "yes",
  },
  {
    key: "objection_response",
    label: "Full objection response",
    eligible: (row) =>
      statedRows(row.values, "objection_response").some((value) =>
        ["full", "partial", "none"].includes((value.valueText ?? "").trim()),
      ),
    matched: (row) =>
      statedRows(row.values, "objection_response").every(
        (value) =>
          (value.valueText ?? "").trim() !== "partial" && (value.valueText ?? "").trim() !== "none",
      ),
  },
  {
    key: "finance_response",
    label: "Finance response coverage",
    eligible: (row) =>
      statedRows(row.values, "customer_questions").some((value) => isFinanceLabel(value.label)),
    matched: (row) =>
      statedRows(row.values, "question_response_status").some(
        (value) => isFinanceLabel(value.label) && normalizeResponseState(value.valueText) !== null,
      ),
  },
  {
    key: "commercial_offer",
    label: "Commercial offer",
    eligible: (row) => isSupported(row.values, "commercial_offer_made"),
    matched: (row) => has(row, "commercial_offer_made"),
  },
  {
    key: "cross_sell",
    label: "Cross-sell",
    eligible: (row) => row.crossSell === "yes" || row.crossSell === "no",
    matched: (row) => row.crossSell === "yes",
  },
  {
    key: "upsell",
    label: "Upsell",
    eligible: (row) => row.upsell === "yes" || row.upsell === "no",
    matched: (row) => row.upsell === "yes",
  },
  {
    key: "close",
    label: "Close after commitment",
    // The canonical status, so this row and the headline cannot disagree.
    eligible: (row) => {
      const status = closeAfterCommitmentStatus(row);
      return status === "yes" || status === "no";
    },
    matched: (row) => closeAfterCommitmentStatus(row) === "yes",
  },
  {
    key: "next_action",
    label: "Next action capture",
    eligible: (row) => isSupported(row.values, "next_action"),
    matched: (row) => has(row, "next_action"),
  },
];

function strengthFor(saleN: number, noSaleN: number, guardrails: Guardrails): AssociationStrength {
  if (saleN < guardrails.minimumForComparison || noSaleN < guardrails.minimumForComparison) {
    return "suppressed";
  }
  return saleN >= guardrails.minimumForConfidentDisplay &&
    noSaleN >= guardrails.minimumForConfidentDisplay
    ? "descriptive"
    : "directional";
}

export function outcomeAssociations(
  rows: readonly PopulationRow[],
  guardrails: Guardrails = DEFAULT_GUARDRAILS,
): OutcomeAssociationResult {
  const sales = rows.filter((row) => row.outcome.business === "sale");
  const noSales = rows.filter((row) => row.outcome.business === "no_sale");

  const associations = BEHAVIOURS.map(({ key, label, eligible, matched }) => {
    const saleEligible = sales.filter(eligible);
    const noSaleEligible = noSales.filter(eligible);
    const strength = strengthFor(saleEligible.length, noSaleEligible.length, guardrails);
    const saleAffected = saleEligible.filter(matched).length;
    const noSaleAffected = noSaleEligible.filter(matched).length;
    const saleRate = saleEligible.length > 0 ? saleAffected / saleEligible.length : null;
    const noSaleRate = noSaleEligible.length > 0 ? noSaleAffected / noSaleEligible.length : null;
    return {
      behaviourKey: key,
      label,
      saleRate,
      noSaleRate,
      saleN: saleEligible.length,
      noSaleN: noSaleEligible.length,
      saleAffected,
      noSaleAffected,
      // One confirmed sale against eight no-sales produces differences of sixty
      // percentage points that mean nothing whatsoever, and a disclaimer under
      // the chart does not undo the impression the numbers already made.
      differencePoints:
        strength === "suppressed" || saleRate === null || noSaleRate === null
          ? null
          : (saleRate - noSaleRate) * 100,
      strength,
    };
  });
  // Registry order, never sorted by effect. The comparison is a reference
  // table; a ranking would move rows for reasons unrelated to the row itself.
  return { rows: associations, saleTotal: sales.length, noSaleTotal: noSales.length };
}

/**
 * What was pitched alongside, and what was pitched above.
 *
 * The hierarchy fields are kept in their own lists rather than paired with the
 * pitch they belong to. The record does not link a hierarchy value to a
 * specific pitch, so joining them here would assert a pairing nobody stored —
 * and a manager reading "accessory, pitched with the washing machine" would
 * have no way to know we had guessed.
 */
export type ExpandDetail = {
  crossSell: RankedResult;
  crossSellHierarchy: RankedResult;
  upsell: RankedResult;
  upsellHierarchy: RankedResult;
};

export function expandDetail(rows: readonly PopulationRow[], limit = 5): ExpandDetail {
  return {
    crossSell: rankedShare(rows, ["cross_sell_pitch", "cross_sell_offered"], limit),
    crossSellHierarchy: rankedShare(rows, ["cross_sell_hierarchy"], limit),
    upsell: rankedShare(rows, ["upsell_pitch", "upsell_offered"], limit),
    upsellHierarchy: rankedShare(rows, ["upsell_hierarchy"], limit),
  };
}

/** What was offered, and how the customer answered it. */
export type OfferDetail = {
  made: RankedResult;
  response: { entries: import("@/modules/intelligence/demand").RankedShare[]; classified: number };
};

export function offerDetail(rows: readonly PopulationRow[], limit = 5): OfferDetail {
  return {
    made: rankedShare(rows, ["commercial_offer_made"], limit),
    response: distribution(
      rows,
      (row) => statedText(row.values, "commercial_offer_response")[0] ?? null,
    ),
  };
}

/** The steps agreed at the end, as recorded. */
export function nextActions(rows: readonly PopulationRow[], limit = 5): RankedResult {
  return rankedShare(rows, ["next_action"], limit);
}

/**
 * The short label an action card carries, per cohort.
 *
 * Fixed templates rather than the cohort's own sentence, because a card is read
 * at a glance and a clause needs a second pass. Nothing here is generated: the
 * same data always produces the same words, so two managers reading the same
 * morning see the same page.
 */
const ACTION_LABELS: Readonly<Record<string, string>> = {
  red_flag_raised: "Red flag raised",
  recommendation_without_rationale: "Recommendation lacks rationale",
  finance_question_without_response: "Finance response status missing",
  objection_handling_gap: "Objection partially resolved",
  commitment_without_close_attempt: "No close after commitment",
  ready_to_buy_without_close_attempt: "Ready to buy, no close attempt",
  follow_up_without_next_action: "No next action recorded",
  clarity_not_reached: "Requirement still unclear",
  no_preference_formed: "No preferred product",
  no_commitment_signal: "No commitment signal",
  commitment_then_no_sale: "Signalled, then no sale",
  commitment_outcome_unknown: "Signalled, outcome unknown",
  ready_to_buy_no_sale: "Ready to buy, no sale",
};

export function actionLabel(cohortKey: string): string {
  return ACTION_LABELS[cohortKey] ?? "Needs review";
}
