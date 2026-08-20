import {
  CONCEPTS,
  closeAfterCommitmentStatus,
  conceptMeasure,
  conceptNumerator,
  type ConceptKey,
} from "@/modules/intelligence/concepts";
import { isSupported, presenceOf, statedRows, statedText } from "@/modules/intelligence/effective";
import { incidence } from "@/modules/intelligence/field-status";
import { measure, type Measure } from "@/modules/intelligence/guardrails";
import type { PopulationRow } from "@/modules/intelligence/population";

/**
 * Every business concept on the Intelligence pages, computed exactly once.
 *
 * The rule this file exists to enforce: no page calculates a concept a second
 * time. Two panels showing 62% and 48% for the same behaviour — because one
 * divided by every interaction and the other by the interactions where the
 * field applied — is a defect nobody can see and everybody argues about, and it
 * is the fastest way to lose a manager's trust in the whole product.
 *
 * Each entry returns a `Measure` carrying its own numerator, denominator and
 * coverage, plus a `numerator` selector returning exactly the interactions
 * counted. The selector is what makes a click honest: the cohort a tile opens
 * is the set the tile counted, by construction rather than by a second query
 * written to resemble the first.
 */

const HIGH_INTENT = new Set(["specific_product", "ready_to_buy"]);

// ---- Concept-backed measures ----------------------------------------------
//
// Each of these is a one-line delegation on purpose. The definition lives in
// `concepts.ts`; if a page wants "clarity improved" it gets the same status
// function the trend bins and the drill-down use, so the three cannot drift.

const forConcept =
  (key: ConceptKey) =>
  (rows: readonly PopulationRow[]): Measure =>
    conceptMeasure(key, rows);

const rowsForConcept =
  (key: ConceptKey) =>
  (rows: readonly PopulationRow[]): PopulationRow[] =>
    conceptNumerator(key, rows);

export const arrivedDecided = forConcept("high_intent_arrivals");
export const arrivedDecidedRows = rowsForConcept("high_intent_arrivals");

export const financeDemand = forConcept("finance_demand");
export const financeDemandRows = rowsForConcept("finance_demand");

export const competitorMentionIncidence = forConcept("competitor_mentions");
export const competitorMentionRows = rowsForConcept("competitor_mentions");

export const clarityImproved = forConcept("clarity_improved");
export const clarityImprovedRows = rowsForConcept("clarity_improved");

export const preferenceFormed = forConcept("preference_formed");
export const preferenceFormedRows = rowsForConcept("preference_formed");

export const objectionIncidence = forConcept("objection_incidence");
export const objectionRows = rowsForConcept("objection_incidence");

export const recommendationIncidence = forConcept("recommendation_incidence");
export const recommendationRows = rowsForConcept("recommendation_incidence");

export const outcomeEstablished = forConcept("outcome_established");
export const outcomeEstablishedRows = rowsForConcept("outcome_established");

export const demoApplicableRate = forConcept("demo_where_applicable");
export const demoRows = rowsForConcept("demo_where_applicable");

export const alternativeApplicableRate = forConcept("alternative_where_applicable");
export const alternativeRows = rowsForConcept("alternative_where_applicable");

export const crossSellIncidence = forConcept("cross_sell_incidence");
export const crossSellRows = rowsForConcept("cross_sell_incidence");

export const upsellIncidence = forConcept("upsell_incidence");
export const upsellRows = rowsForConcept("upsell_incidence");

export const closeAttemptIncidence = forConcept("close_attempt_incidence");
export const closeAttemptRows = rowsForConcept("close_attempt_incidence");

export const closeAfterCommitment = forConcept("close_after_commitment");
export const closeAfterCommitmentRows = rowsForConcept("close_after_commitment");

export const nextActionCapture = forConcept("next_action_capture");
export const nextActionRows = rowsForConcept("next_action_capture");

export const commercialOfferIncidence = forConcept("commercial_offer_incidence");
export const commercialOfferRows = rowsForConcept("commercial_offer_incidence");

/** Sales among interactions whose outcome we actually know. Never over everything. */
export function saleAmongEstablished(rows: readonly PopulationRow[]): Measure {
  const observed = rows.filter((row) => row.outcome.business !== "unknown");
  return measure(
    observed.filter((row) => row.outcome.business === "sale").length,
    rows.length,
    observed.length,
  );
}

/** Of confirmed no-sales, how many carry an observed reason. */
export function confirmedNoSaleReasonCoverage(rows: readonly PopulationRow[]): Measure {
  const confirmed = rows.filter((row) => row.outcome.business === "no_sale");
  return incidence(confirmed, (row) => presenceOf(row.values, "primary_non_conversion_reason"));
}

/**
 * Of the recommendations that were made, how many carry a recorded reason.
 *
 * Matched at interaction level: the record does not link a reason to the
 * recommendation it belongs to. The registry marks it provisional for exactly
 * that reason and the page says so.
 */
export function recommendationRationaleCoverage(rows: readonly PopulationRow[]): Measure {
  const recommending = rows.filter(
    (row) => CONCEPTS.recommendation_incidence.status(row) === "yes",
  );
  return incidence(recommending, (row) => presenceOf(row.values, "recommendation_reasons"));
}

const OBJECTION_STATES = new Set(["full", "partial", "none"]);

/**
 * Objection handling, counted per objection rather than per conversation.
 *
 * A representative who fully answered two of five objections should not read the
 * same as one who answered their only objection.
 */
export function objectionFullResponseRate(rows: readonly PopulationRow[]): Measure {
  let judged = 0;
  let full = 0;
  for (const row of rows) {
    for (const value of statedRows(row.values, "objection_response")) {
      const state = (value.valueText ?? "").trim();
      if (!OBJECTION_STATES.has(state)) continue;
      judged += 1;
      if (state === "full") full += 1;
    }
  }
  return measure(full, judged, judged);
}

/** Whether a label names the finance topic. */
export const isFinanceLabel = (label: string | null): boolean =>
  (label ?? "").trim().toLowerCase() === "finance";

export const financeQuestionRows = (rows: readonly PopulationRow[]): PopulationRow[] =>
  rows.filter((row) =>
    statedRows(row.values, "customer_questions").some((value) => isFinanceLabel(value.label)),
  );

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

/**
 * Maps observed response text onto the canonical states.
 *
 * `question_response_status` is not constrained by a database enum, so historical
 * rows carry free text. Only wordings that map deterministically are normalised;
 * anything else is left out of the evaluated set rather than guessed into one,
 * and the raw value survives for the drill-down.
 */
export function normalizeResponseState(raw: string | null): ResponseState | null {
  if (!raw) return null;
  return RESPONSE_STATES[raw.trim().toLowerCase().replaceAll(" ", "_")] ?? null;
}

const hasFinanceResponse = (row: PopulationRow): boolean =>
  statedRows(row.values, "question_response_status").some(
    (value) => isFinanceLabel(value.label) && normalizeResponseState(value.valueText) !== null,
  );

/**
 * Of the finance questions asked, how many carry a recorded response state.
 *
 * Coverage of our own record, not a judgement of the representative. An earlier
 * version asserted that a missing finance-labelled offer proved the question had
 * gone unanswered; the drill-down turned up a transcript where the rep plainly
 * offered EMI and the offer field was empty.
 */
export function financeResponseCoverage(rows: readonly PopulationRow[]): Measure {
  const asked = financeQuestionRows(rows);
  return measure(asked.filter(hasFinanceResponse).length, asked.length, asked.length);
}

export const financeResponseRows = (rows: readonly PopulationRow[]): PopulationRow[] =>
  financeQuestionRows(rows).filter(hasFinanceResponse);

/** Whether any customer question carries a readable response state. */
export function questionResponseCoverage(rows: readonly PopulationRow[]): Measure {
  const asked = rows.filter((row) => statedText(row.values, "customer_questions").length > 0);
  return measure(
    asked.filter((row) =>
      statedRows(row.values, "question_response_status").some(
        (value) => normalizeResponseState(value.valueText) !== null,
      ),
    ).length,
    asked.length,
    asked.length,
  );
}

/**
 * The canonical measures a headline can be built from, keyed for the URL.
 *
 * A tile names a key; the drawer resolves the same key to the same numerator.
 * That is what makes "18" on the page and "18" in the drawer the same eighteen
 * interactions rather than two counts that happen to agree today.
 */
export const NUMERATOR_COHORTS: Readonly<
  Record<
    string,
    {
      label: string;
      reason: string;
      fieldKeys: string[];
      rows: (rows: readonly PopulationRow[]) => PopulationRow[];
      measure: (rows: readonly PopulationRow[]) => Measure;
    }
  >
> = {
  arrived_decided: {
    label: "arrived already decided",
    reason: "Arrival intent was a specific product or ready to buy",
    fieldKeys: ["arrival_intent_state"],
    rows: arrivedDecidedRows,
    measure: arrivedDecided,
  },
  finance_demand: {
    label: "raised finance",
    reason: "At least one financing option was asked about or discussed",
    fieldKeys: ["finance_requested"],
    rows: financeDemandRows,
    measure: financeDemand,
  },
  clarity_improved: {
    label: "left clearer about what they needed",
    reason: "Requirement clarity was higher at the close than on arrival",
    fieldKeys: ["requirement_clarity_start", "requirement_clarity_end"],
    rows: clarityImprovedRows,
    measure: clarityImproved,
  },
  close_after_commitment: {
    label: "were asked for the sale after signalling",
    reason: "A close attempt was recorded at or after the first commitment signal",
    fieldKeys: ["customer_commitment_signals", "close_attempts"],
    rows: closeAfterCommitmentRows,
    measure: closeAfterCommitment,
  },
  preference_formed: {
    label: "left having settled on a product",
    reason: "The requirement was clear at the close and a preferred product was recorded",
    fieldKeys: ["final_preferred_product", "requirement_clarity_end"],
    rows: preferenceFormedRows,
    measure: preferenceFormed,
  },
  objection_raised: {
    label: "raised an objection",
    reason: "At least one objection was recorded against the interaction",
    fieldKeys: ["objections"],
    rows: objectionRows,
    measure: objectionIncidence,
  },
  recommendation_made: {
    label: "were recommended a product",
    reason: "At least one product was recommended",
    fieldKeys: ["products_recommended"],
    rows: recommendationRows,
    measure: recommendationIncidence,
  },
  competitor_mentioned: {
    label: "named a competitor",
    reason: "At least one competitor was named by the customer",
    fieldKeys: ["competitor_named"],
    rows: competitorMentionRows,
    measure: competitorMentionIncidence,
  },
  outcome_established: {
    label: "ended with an established business outcome",
    reason: "The business outcome was confirmed as a sale or a no sale",
    fieldKeys: ["confirmed_business_outcome"],
    rows: outcomeEstablishedRows,
    measure: outcomeEstablished,
  },
  next_action_captured: {
    label: "left with a next action recorded",
    reason: "A next action was captured before the customer left",
    fieldKeys: ["next_action"],
    rows: nextActionRows,
    measure: nextActionCapture,
  },
};
