import { distribution, rankedShare, type RankedShare } from "@/modules/intelligence/demand";
import {
  DEFAULT_GUARDRAILS,
  measure,
  type Guardrails,
  type Measure,
} from "@/modules/intelligence/guardrails";
import { isUnresolved } from "@/modules/intelligence/outcome";
import type { PopulationRow, PopulationValue } from "@/modules/intelligence/population";

/**
 * What the frontline did, and what it left on the counter.
 *
 * Pure: takes the population, returns numbers. Nothing here reads the database,
 * so every denominator decision in this file is testable against a handful of
 * fabricated rows rather than only observable once a page renders.
 *
 * The recurring judgement is which interactions belong in a denominator. A demo
 * that made no sense for the product is not a demo the rep failed to give, and
 * counting it as one turns a metric a manager would act on into a number they
 * learn to ignore.
 */

const present = (row: PopulationRow, fieldKey: string): PopulationValue[] =>
  row.values.filter((value) => value.fieldKey === fieldKey && !value.abstention);

const has = (row: PopulationRow, fieldKey: string): boolean => present(row, fieldKey).length > 0;

/**
 * The canonical response states, and how observed text maps onto them.
 *
 * `question_response_status` is not constrained by a database enum, so historical
 * rows carry free text. Only wordings that map deterministically are normalised;
 * anything else is left out of the evaluated set rather than guessed into one,
 * and the raw value survives for the drill-down.
 */
export type ResponseState = "answered" | "partial" | "unanswered" | "uncertain";

const RESPONSE_STATES: Readonly<Record<string, ResponseState>> = {
  answered: "answered",
  answer: "answered",
  full: "answered",
  fully_answered: "answered",
  complete: "answered",
  partial: "partial",
  partially_answered: "partial",
  unanswered: "unanswered",
  none: "unanswered",
  not_answered: "unanswered",
  no_response: "unanswered",
  uncertain: "uncertain",
  unclear: "uncertain",
};

export function normalizeResponseState(raw: string | null): ResponseState | null {
  if (!raw) return null;
  return RESPONSE_STATES[raw.trim().toLowerCase().replaceAll(" ", "_")] ?? null;
}

/** Whether a label names the finance topic. */
const isFinanceLabel = (label: string | null): boolean =>
  (label ?? "").trim().toLowerCase() === "finance";

/** When a field's earliest citation occurs, or null if it was never cited. */
const firstAt = (row: PopulationRow, fieldKey: string): number | null => {
  const times = present(row, fieldKey).flatMap((value) =>
    typeof value.earliestMs === "number" ? [value.earliestMs] : [],
  );
  return times.length ? Math.min(...times) : null;
};

/**
 * Whether the record was even asked this field.
 *
 * A record produced before a field existed carries no row for it — not an
 * abstention, nothing. Treating that absence as "no" would make every rate look
 * worse the further back you scroll, purely because the product improved.
 */
const supported = (row: PopulationRow, fieldKey: string): boolean =>
  row.values.some((value) => value.fieldKey === fieldKey);

/** A yes/no field where "not applicable" is excluded rather than counted as no. */
function applicableRate(
  rows: readonly PopulationRow[],
  read: (row: PopulationRow) => string | null,
) {
  let eligible = 0;
  let yes = 0;
  for (const row of rows) {
    const value = read(row);
    if (value !== "yes" && value !== "no") continue;
    eligible += 1;
    if (value === "yes") yes += 1;
  }
  return measure(yes, rows.length, eligible);
}

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
  const base = rows.length;

  const recommending = rows.filter((row) => row.productsRecommendedCount > 0);
  const withRationale = recommending.filter((row) => has(row, "recommendation_reasons"));

  // Objection handling is judged per response, not per interaction: a rep who
  // fully answered two of five objections should not read the same as one who
  // answered their only objection.
  let objectionResponses = 0;
  let fullResponses = 0;
  for (const row of rows) {
    for (const value of present(row, "objection_response")) {
      if (value.valueText !== "full" && value.valueText !== "partial" && value.valueText !== "none")
        continue;
      objectionResponses += 1;
      if (value.valueText === "full") fullResponses += 1;
    }
  }

  // Finance, rebuilt. The old metric asserted that a missing finance-labelled
  // offer proved the representative had failed to answer a finance question. It
  // proved nothing of the kind: the two fields are recorded independently, and
  // the drill-down turned up a transcript where the rep plainly offered EMI and
  // the offer field was empty. What can be defended is narrower — whether a
  // question actually labelled finance has a response status recorded against
  // the same topic.
  const financeSupported = rows.filter((row) => supported(row, "finance_requested"));
  const financeAsked = rows.filter((row) =>
    present(row, "customer_questions").some((value) => isFinanceLabel(value.label)),
  );
  const financeAnswered = financeAsked.filter((row) =>
    present(row, "question_response_status").some(
      (value) => isFinanceLabel(value.label) && normalizeResponseState(value.valueText) !== null,
    ),
  );
  const offerSupported = rows.filter((row) => supported(row, "commercial_offer_made"));

  // Ordering, not presence. A close attempt made before the customer signalled
  // anything is a rep working through a script; one made after is a rep
  // responding to the person in front of them, and treating the two as the same
  // event would flatter exactly the behaviour this metric exists to find.
  // Interactions whose commitment carries no timing cannot be judged either way
  // and leave the denominator.
  const commitment = rows.filter((row) => firstAt(row, "customer_commitment_signals") !== null);
  const closedAfter = commitment.filter((row) => {
    const signalled = firstAt(row, "customer_commitment_signals")!;
    const closed = firstAt(row, "close_attempts");
    return closed !== null && closed >= signalled;
  });

  const nextActionSupported = rows.filter((row) => supported(row, "next_action"));

  const questionsAsked = rows.filter((row) => has(row, "customer_questions"));
  const closeSupported = rows.filter((row) => supported(row, "close_attempts"));

  return {
    // Coverage of our own record, not a judgement of the representative. A
    // question with no recorded response state means we did not capture what
    // happened next; it does not mean nobody answered.
    questionResponseCoverage: measure(
      questionsAsked.filter((row) =>
        present(row, "question_response_status").some(
          (value) => normalizeResponseState(value.valueText) !== null,
        ),
      ).length,
      base,
      questionsAsked.length,
    ),
    closeAttemptRate: measure(
      closeSupported.filter((row) => has(row, "close_attempts")).length,
      base,
      closeSupported.length,
    ),
    recommendationRate: measure(recommending.length, base, base),
    // Provisional: matched at interaction level because the record does not link
    // a reason to the recommendation it belongs to. Flagged in the registry and
    // surfaced on the page rather than presented as exact.
    recommendationRationale: measure(withRationale.length, base, recommending.length),
    fullObjectionHandling: measure(fullResponses, objectionResponses, objectionResponses),
    demoRate: applicableRate(rows, (row) => row.demoPerformed),
    alternativeRate: applicableRate(rows, (row) => row.alternativeOffered),
    financeDemand: measure(
      financeSupported.filter((row) => row.financeRequested).length,
      base,
      financeSupported.length,
    ),
    // Denominator is finance questions asked, not every finance mention. It says
    // a response was recorded on the topic; with several questions in one
    // conversation it cannot say which question that response belongs to, and
    // the registry marks it provisional for exactly that reason.
    financeQuestionResponse: measure(financeAnswered.length, base, financeAsked.length),
    proactiveOffer: measure(
      offerSupported.filter((row) => has(row, "commercial_offer_made")).length,
      base,
      offerSupported.length,
    ),
    // Read from the pitch fields rather than from interaction_metrics. The
    // stored counts were computed by whichever version of the pipeline last
    // touched the record, and after the v1.3 change they mean something
    // different on old rows than on new ones. Taking the numerator from a stale
    // projection while taking the denominator from the current fields produced a
    // confident 100% on records that contain no pitch at all.
    crossSellRate: measure(
      rows.filter((row) => has(row, "cross_sell_pitch")).length,
      base,
      rows.filter((row) => supported(row, "cross_sell_pitch")).length,
    ),
    upsellRate: measure(
      rows.filter((row) => has(row, "upsell_pitch")).length,
      base,
      rows.filter((row) => supported(row, "upsell_pitch")).length,
    ),
    closeAfterCommitment: measure(closedAfter.length, base, commitment.length),
    nextActionCapture: measure(
      nextActionSupported.filter((row) => has(row, "next_action")).length,
      base,
      nextActionSupported.length,
    ),
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
    for (const value of present(row, "objection_response")) {
      if (value.valueText && value.valueText in objection) objection[value.valueText] += 1;
    }
  }

  const financeAsked = rows.filter((row) =>
    present(row, "customer_questions").some((value) => isFinanceLabel(value.label)),
  );
  const recorded = financeAsked.filter((row) =>
    present(row, "question_response_status").some(
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
      {
        key: "unrecorded",
        label: "No response status recorded",
        count: financeAsked.length - recorded,
      },
    ],
  };
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
  const flagSupported = rows.filter((row) => supported(row, "red_flags"));
  push(
    "red_flag_raised",
    "carried a red flag raised during analysis",
    "At least one red flag was recorded against the interaction",
    ["red_flags"],
    flagSupported.length,
    flagSupported.filter((row) => has(row, "red_flags")),
  );

  const recommending = rows.filter((row) => row.productsRecommendedCount > 0);
  push(
    "recommendation_without_rationale",
    "recommended a product without a recorded reason",
    "A recommendation was made and no reason was recorded",
    ["products_recommended"],
    recommending.length,
    recommending.filter((row) => !has(row, "recommendation_reasons")),
  );

  const financeAsked = rows.filter((row) =>
    present(row, "customer_questions").some((value) => isFinanceLabel(value.label)),
  );
  push(
    "finance_question_without_response",
    "asked a finance question with no response status recorded",
    "A finance-labelled question exists and no finance-labelled response state was recorded",
    ["customer_questions", "question_response_status"],
    financeAsked.length,
    financeAsked.filter(
      (row) =>
        !present(row, "question_response_status").some(
          (value) =>
            isFinanceLabel(value.label) && normalizeResponseState(value.valueText) !== null,
        ),
    ),
  );

  const objectionEvaluated = rows.filter((row) =>
    present(row, "objection_response").some((value) =>
      ["full", "partial", "none"].includes(value.valueText ?? ""),
    ),
  );
  push(
    "objection_handling_gap",
    "left an objection partly answered or unanswered",
    "At least one objection response was judged partial or none",
    ["objections", "objection_response"],
    objectionEvaluated.length,
    objectionEvaluated.filter((row) =>
      present(row, "objection_response").some(
        (value) => value.valueText === "partial" || value.valueText === "none",
      ),
    ),
  );

  // Chronology, matching the metric exactly. A close recorded before the
  // customer signalled anything does not count as following it, and an
  // interaction whose signal carries no timing cannot be judged either way.
  const commitmentTimed = rows.filter(
    (row) => firstAt(row, "customer_commitment_signals") !== null,
  );
  push(
    "commitment_without_close_attempt",
    "showed a buying signal with no later close attempt recorded",
    "A commitment signal was recorded and no close attempt followed it",
    ["customer_commitment_signals"],
    commitmentTimed.length,
    commitmentTimed.filter((row) => {
      const closed = firstAt(row, "close_attempts");
      return closed === null || closed < firstAt(row, "customer_commitment_signals")!;
    }),
  );

  const readyToBuy = rows.filter((row) => row.arrivalIntent === "ready_to_buy");
  push(
    "ready_to_buy_without_close_attempt",
    "arrived ready to buy with no close attempt recorded and no outcome established",
    "Arrival intent was ready to buy, no close attempt was recorded, and the outcome is not a sale",
    ["arrival_intent_state", "customer_commitment_signals"],
    readyToBuy.length,
    readyToBuy.filter((row) => isUnresolved(row.outcome) && !has(row, "close_attempts")),
  );

  const followUp = rows.filter((row) => row.outcome.decision === "follow_up_scheduled");
  push(
    "follow_up_without_next_action",
    "agreed a follow-up with no next action recorded",
    "The customer left on a follow-up and no next action was captured",
    ["final_decision_state"],
    followUp.length,
    followUp.filter((row) => !has(row, "next_action")),
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
 */
export type OutcomeAssociation = {
  behaviourKey: string;
  label: string;
  saleRate: number | null;
  noSaleRate: number | null;
  saleN: number;
  noSaleN: number;
  differencePoints: number | null;
};

/** Whether the two outcome groups can carry a comparison, and how strongly. */
export type AssociationStrength = "suppressed" | "directional" | "descriptive";

export type OutcomeAssociationResult = {
  rows: OutcomeAssociation[];
  saleN: number;
  noSaleN: number;
  strength: AssociationStrength;
};

const BEHAVIOURS: readonly { key: string; label: string; test: (row: PopulationRow) => boolean }[] =
  [
    {
      key: "recommendation",
      label: "Recommended a product",
      test: (row) => row.productsRecommendedCount > 0,
    },
    {
      key: "rationale",
      label: "Gave a reason for the recommendation",
      test: (row) => has(row, "recommendation_reasons"),
    },
    { key: "demo", label: "Demonstrated the product", test: (row) => row.demoPerformed === "yes" },
    {
      key: "cross_sell",
      label: "Pitched something alongside",
      test: (row) => has(row, "cross_sell_pitch"),
    },
    {
      key: "upsell",
      label: "Moved the customer up a tier",
      test: (row) => has(row, "upsell_pitch"),
    },
    { key: "close", label: "Asked for the sale", test: (row) => has(row, "close_attempts") },
  ];

export function outcomeAssociations(
  rows: readonly PopulationRow[],
  guardrails: Guardrails = DEFAULT_GUARDRAILS,
): OutcomeAssociationResult {
  const sales = rows.filter((row) => row.outcome.business === "sale");
  const noSales = rows.filter((row) => row.outcome.business === "no_sale");

  // One confirmed sale against eight no-sales produces differences of sixty
  // percentage points that mean nothing whatsoever, and a disclaimer under the
  // table does not undo the impression the numbers already made. Below the bar
  // the comparison is not computed at all, so there is nothing to render.
  const strength: AssociationStrength =
    sales.length < guardrails.minimumForComparison ||
    noSales.length < guardrails.minimumForComparison
      ? "suppressed"
      : sales.length >= guardrails.minimumForConfidentDisplay &&
          noSales.length >= guardrails.minimumForConfidentDisplay
        ? "descriptive"
        : "directional";

  if (strength === "suppressed") {
    return { rows: [], saleN: sales.length, noSaleN: noSales.length, strength };
  }

  const associations = BEHAVIOURS.map(({ key, label, test }) => {
    const saleRate = sales.filter(test).length / sales.length;
    const noSaleRate = noSales.filter(test).length / noSales.length;
    return {
      behaviourKey: key,
      label,
      saleRate,
      noSaleRate,
      saleN: sales.length,
      noSaleN: noSales.length,
      differencePoints: (saleRate - noSaleRate) * 100,
    };
  }).sort((a, b) => Math.abs(b.differencePoints ?? 0) - Math.abs(a.differencePoints ?? 0));

  return { rows: associations, saleN: sales.length, noSaleN: noSales.length, strength };
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
  crossSell: { entries: RankedShare[]; eligible: number };
  crossSellHierarchy: { entries: RankedShare[]; eligible: number };
  upsell: { entries: RankedShare[]; eligible: number };
  upsellHierarchy: { entries: RankedShare[]; eligible: number };
};

export function expandDetail(rows: readonly PopulationRow[], limit = 5): ExpandDetail {
  return {
    crossSell: rankedShare(rows, ["cross_sell_pitch"], limit),
    crossSellHierarchy: rankedShare(rows, ["cross_sell_hierarchy"], limit),
    upsell: rankedShare(rows, ["upsell_pitch"], limit),
    upsellHierarchy: rankedShare(rows, ["upsell_hierarchy"], limit),
  };
}

/** What was offered, and how the customer answered it. */
export type OfferDetail = {
  made: { entries: RankedShare[]; eligible: number };
  response: { entries: RankedShare[]; classified: number };
};

export function offerDetail(rows: readonly PopulationRow[], limit = 5): OfferDetail {
  return {
    made: rankedShare(rows, ["commercial_offer_made"], limit),
    response: distribution(
      rows,
      (row) => present(row, "commercial_offer_response")[0]?.valueText ?? null,
    ),
  };
}

/** The steps agreed at the end, as recorded. */
export function nextActions(
  rows: readonly PopulationRow[],
  limit = 5,
): { entries: RankedShare[]; eligible: number } {
  return rankedShare(rows, ["next_action"], limit);
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
    const states = present(row, "question_response_status").flatMap((value) => {
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
