import {
  firstAt,
  isSupported,
  statedRows,
  statedText,
  type Applicable,
  type Presence,
} from "@/modules/intelligence/effective";
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

/**
 * A presence-shaped field: yes, no, or we cannot tell.
 *
 * `eligible` is every interaction the field was asked of. `observed` is those
 * we can actually read either way. An interaction whose audio does not settle
 * the question is eligible and unobserved — it is not a no, and counting it as
 * one makes every rate look worse the noisier the recording was.
 */
function presenceMeasure(
  rows: readonly PopulationRow[],
  read: (row: PopulationRow) => Presence,
): Measure {
  const eligible = rows.filter((row) => read(row) !== "unsupported");
  const observed = eligible.filter((row) => read(row) === "yes" || read(row) === "no");
  return measure(
    observed.filter((row) => read(row) === "yes").length,
    eligible.length,
    observed.length,
  );
}

function presenceNumerator(
  rows: readonly PopulationRow[],
  read: (row: PopulationRow) => Presence,
): PopulationRow[] {
  return rows.filter((row) => read(row) === "yes");
}

/**
 * An applicability field: yes, no, or it did not apply.
 *
 * `not_applicable` stays in `eligible` and leaves `observed`. A demo that made
 * no sense for the product is not a demo the representative failed to give, and
 * counting it as one turns a metric a manager would act on into a number they
 * learn to ignore.
 */
function applicableMeasure(
  rows: readonly PopulationRow[],
  read: (row: PopulationRow) => Applicable,
): Measure {
  const eligible = rows.filter((row) => read(row) !== "unsupported");
  const observed = eligible.filter((row) => read(row) === "yes" || read(row) === "no");
  return measure(
    observed.filter((row) => read(row) === "yes").length,
    eligible.length,
    observed.length,
  );
}

/** A field-presence rate expressed against the interactions that carry the field. */
function fieldMeasure(
  rows: readonly PopulationRow[],
  fieldKey: string,
  matched: (row: PopulationRow) => boolean = (row) => statedText(row.values, fieldKey).length > 0,
): Measure {
  const eligible = rows.filter((row) => isSupported(row.values, fieldKey));
  return measure(eligible.filter(matched).length, eligible.length, eligible.length);
}

// ---- Customer demand -------------------------------------------------------

export function arrivedDecided(rows: readonly PopulationRow[]): Measure {
  const eligible = rows.length;
  const observed = rows.filter((row) => row.arrivalIntent !== null);
  return measure(
    observed.filter((row) => HIGH_INTENT.has(row.arrivalIntent!)).length,
    eligible,
    observed.length,
  );
}

export const arrivedDecidedRows = (rows: readonly PopulationRow[]): PopulationRow[] =>
  rows.filter((row) => row.arrivalIntent !== null && HIGH_INTENT.has(row.arrivalIntent));

/**
 * How often finance came up, exactly as specified.
 *
 * eligible = interactions where the field was asked · observed = interactions
 * where it can be read either way · affected = interactions where finance was
 * raised. An interaction analysed before the field existed carries no row and
 * never becomes a false.
 */
export const financeDemand = (rows: readonly PopulationRow[]): Measure =>
  presenceMeasure(rows, (row) => row.financeRequested);

export const financeDemandRows = (rows: readonly PopulationRow[]): PopulationRow[] =>
  presenceNumerator(rows, (row) => row.financeRequested);

export function competitorMentionIncidence(rows: readonly PopulationRow[]): Measure {
  return measure(rows.filter((row) => row.competitorCount > 0).length, rows.length, rows.length);
}

export const competitorMentionRows = (rows: readonly PopulationRow[]): PopulationRow[] =>
  rows.filter((row) => row.competitorCount > 0);

/**
 * Whether the conversation left the customer clearer than it found them.
 *
 * Only interactions carrying both an opening and a closing clarity can answer
 * this; the rest are eligible and unobserved.
 */
export function clarityImproved(rows: readonly PopulationRow[]): Measure {
  const observed = rows.filter((row) => row.clarityStart !== null && row.clarityEnd !== null);
  return measure(
    observed.filter((row) => row.clarityEnd! > row.clarityStart!).length,
    rows.length,
    observed.length,
  );
}

export const clarityImprovedRows = (rows: readonly PopulationRow[]): PopulationRow[] =>
  rows.filter(
    (row) =>
      row.clarityStart !== null && row.clarityEnd !== null && row.clarityEnd > row.clarityStart,
  );

export function outcomeEstablished(rows: readonly PopulationRow[]): Measure {
  return measure(
    rows.filter((row) => row.outcome.business !== "unknown").length,
    rows.length,
    rows.length,
  );
}

export const outcomeEstablishedRows = (rows: readonly PopulationRow[]): PopulationRow[] =>
  rows.filter((row) => row.outcome.business !== "unknown");

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
  return measure(
    confirmed.filter((row) => statedText(row.values, "primary_non_conversion_reason").length > 0)
      .length,
    confirmed.length,
    confirmed.length,
  );
}

// ---- Frontline execution ---------------------------------------------------

export function recommendationIncidence(rows: readonly PopulationRow[]): Measure {
  const eligible = rows.filter(
    (row) => isSupported(row.values, "products_recommended") || row.recommendedCount > 0,
  );
  return measure(
    eligible.filter((row) => row.recommendedCount > 0).length,
    eligible.length,
    eligible.length,
  );
}

export const recommendationRows = (rows: readonly PopulationRow[]): PopulationRow[] =>
  rows.filter((row) => row.recommendedCount > 0);

/**
 * Of the recommendations that were made, how many carry a recorded reason.
 *
 * Matched at interaction level: the record does not link a reason to the
 * recommendation it belongs to. The registry marks it provisional for exactly
 * that reason and the page says so.
 */
export function recommendationRationaleCoverage(rows: readonly PopulationRow[]): Measure {
  const eligible = rows.filter(
    (row) => row.recommendedCount > 0 && isSupported(row.values, "recommendation_reasons"),
  );
  return measure(
    eligible.filter((row) => statedText(row.values, "recommendation_reasons").length > 0).length,
    eligible.length,
    eligible.length,
  );
}

export const demoApplicableRate = (rows: readonly PopulationRow[]): Measure =>
  applicableMeasure(rows, (row) => row.demo);

export const demoRows = (rows: readonly PopulationRow[]): PopulationRow[] =>
  rows.filter((row) => row.demo === "yes");

export const alternativeApplicableRate = (rows: readonly PopulationRow[]): Measure =>
  applicableMeasure(rows, (row) => row.alternative);

export const alternativeRows = (rows: readonly PopulationRow[]): PopulationRow[] =>
  rows.filter((row) => row.alternative === "yes");

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

export const commercialOfferIncidence = (rows: readonly PopulationRow[]): Measure =>
  fieldMeasure(rows, "commercial_offer_made");

export const commercialOfferRows = (rows: readonly PopulationRow[]): PopulationRow[] =>
  rows.filter((row) => statedText(row.values, "commercial_offer_made").length > 0);

export const crossSellIncidence = (rows: readonly PopulationRow[]): Measure =>
  presenceMeasure(rows, (row) => row.crossSell);

export const crossSellRows = (rows: readonly PopulationRow[]): PopulationRow[] =>
  presenceNumerator(rows, (row) => row.crossSell);

export const upsellIncidence = (rows: readonly PopulationRow[]): Measure =>
  presenceMeasure(rows, (row) => row.upsell);

export const upsellRows = (rows: readonly PopulationRow[]): PopulationRow[] =>
  presenceNumerator(rows, (row) => row.upsell);

export const closeAttemptIncidence = (rows: readonly PopulationRow[]): Measure =>
  fieldMeasure(rows, "close_attempts");

export const closeAttemptRows = (rows: readonly PopulationRow[]): PopulationRow[] =>
  rows.filter((row) => statedText(row.values, "close_attempts").length > 0);

/**
 * Whether a close followed the customer's buying signal.
 *
 * Ordering, not presence. A close attempt made before the customer signalled
 * anything is a representative working through a script; one made after is a
 * representative responding to the person in front of them, and treating the
 * two as the same event would flatter exactly the behaviour this metric exists
 * to find. Interactions whose commitment carries no timing cannot be judged
 * either way and leave the denominator.
 */
export const closedAfterCommitment = (row: PopulationRow): boolean => {
  const signalled = firstAt(row.values, "customer_commitment_signals");
  if (signalled === null) return false;
  const closed = firstAt(row.values, "close_attempts");
  return closed !== null && closed >= signalled;
};

export function closeAfterCommitment(rows: readonly PopulationRow[]): Measure {
  const observed = rows.filter(
    (row) => firstAt(row.values, "customer_commitment_signals") !== null,
  );
  const eligible = rows.filter(
    (row) => statedText(row.values, "customer_commitment_signals").length > 0,
  );
  return measure(observed.filter(closedAfterCommitment).length, eligible.length, observed.length);
}

export const closeAfterCommitmentRows = (rows: readonly PopulationRow[]): PopulationRow[] =>
  rows.filter(closedAfterCommitment);

export const nextActionCapture = (rows: readonly PopulationRow[]): Measure =>
  fieldMeasure(rows, "next_action");

export const nextActionRows = (rows: readonly PopulationRow[]): PopulationRow[] =>
  rows.filter((row) => statedText(row.values, "next_action").length > 0);

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
