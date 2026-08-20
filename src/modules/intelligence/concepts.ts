import {
  firstAt,
  presenceAcross,
  presenceOf,
  statedRows,
  statedText,
} from "@/modules/intelligence/effective";
import {
  affectedRows,
  incidence,
  type ApplicableStatus,
  type FieldStatus,
} from "@/modules/intelligence/field-status";
import type { Measure } from "@/modules/intelligence/guardrails";
import type { PopulationRow } from "@/modules/intelligence/population";

/**
 * One named business concept, defined exactly once.
 *
 * Every page, every trend bin and every drill-down reads a concept from here.
 * The rule this file exists to enforce is that two functions may not answer the
 * same named business question: the moment Trend reimplements "clarity
 * improved" with a slightly different denominator, one page disagrees with
 * another and a manager stops believing both.
 *
 * A concept is a status per interaction. Everything else — the headline rate,
 * the trend bin, the cohort a tile opens — is derived from that one function,
 * so they cannot drift.
 */

export type ConceptKey =
  | "high_intent_arrivals"
  | "clarity_improved"
  | "preference_formed"
  | "close_after_commitment"
  | "competitor_mentions"
  | "finance_demand"
  | "recommendation_incidence"
  | "objection_incidence"
  | "next_action_capture"
  | "close_attempt_incidence"
  | "commercial_offer_incidence"
  | "cross_sell_incidence"
  | "upsell_incidence"
  | "demo_where_applicable"
  | "alternative_where_applicable"
  | "outcome_established";

export type Concept = {
  key: ConceptKey;
  label: string;
  /** The atomic fields the status is read from, for evidence and tooltips. */
  fieldKeys: string[];
  status: (row: PopulationRow) => ApplicableStatus;
  /** Manager-facing sentence for the cohort a click opens. */
  cohortLabel: string;
  cohortReason: string;
};

const HIGH_INTENT = new Set(["specific_product", "ready_to_buy"]);

/** A list-shaped field read as presence. */
const presence =
  (fieldKey: string) =>
  (row: PopulationRow): FieldStatus =>
    presenceOf(row.values, fieldKey);

/**
 * Whether a close attempt followed the customer's buying signal.
 *
 * One definition, used by the headline, the trend, the numerator cohort, the
 * Journey lane, the Frontline stage and the management gap. Ordering, not
 * presence: a close made before the customer signalled anything is a
 * representative working through a script, and treating the two as one event
 * would flatter exactly the behaviour this exists to find.
 *
 * An unreadable close attempt is never "no close after commitment". That would
 * turn a gap in our own record into an accusation about the floor.
 */
export function closeAfterCommitmentStatus(row: PopulationRow): FieldStatus {
  const commitment = presenceOf(row.values, "customer_commitment_signals");
  if (commitment === "unsupported") return "unsupported";
  if (commitment !== "yes") return commitment === "no" ? "unsupported" : "unusable";

  const signalled = firstAt(row.values, "customer_commitment_signals");
  // A commitment we cannot place in the recording cannot be compared with
  // anything, so the question is unanswerable rather than answered no.
  if (signalled === null) return "unusable";

  const closes = presenceOf(row.values, "close_attempts");
  if (closes === "unsupported") return "unsupported";
  if (closes === "no") return "no";
  if (closes === "unusable") return "unusable";

  const closed = firstAt(row.values, "close_attempts");
  if (closed === null) return "unusable";
  return closed >= signalled ? "yes" : "no";
}

export const CONCEPTS: Readonly<Record<ConceptKey, Concept>> = {
  high_intent_arrivals: {
    key: "high_intent_arrivals",
    label: "High-intent arrivals",
    fieldKeys: ["arrival_intent_state"],
    status: (row) =>
      row.arrivalIntent === null ? "unusable" : HIGH_INTENT.has(row.arrivalIntent) ? "yes" : "no",
    cohortLabel: "arrived already decided",
    cohortReason: "Arrival intent was a specific product or ready to buy",
  },
  clarity_improved: {
    key: "clarity_improved",
    label: "Clarity improved",
    fieldKeys: ["requirement_clarity_start", "requirement_clarity_end"],
    status: (row) =>
      row.clarityStart === null || row.clarityEnd === null
        ? "unusable"
        : row.clarityEnd > row.clarityStart
          ? "yes"
          : "no",
    cohortLabel: "left clearer about what they needed",
    cohortReason: "Requirement clarity was higher at the close than on arrival",
  },
  preference_formed: {
    key: "preference_formed",
    label: "Preference formed",
    fieldKeys: ["final_preferred_product", "requirement_clarity_end"],
    // Only asked of customers who worked out what they needed: whether somebody
    // chose a product when their requirement never became clear measures the
    // earlier stage, not this one.
    status: (row) =>
      row.clarityEnd === null || row.clarityEnd < 2
        ? "unsupported"
        : presenceOf(row.values, "final_preferred_product"),
    cohortLabel: "left having settled on a product",
    cohortReason: "The requirement was clear at the close and a preferred product was recorded",
  },
  close_after_commitment: {
    key: "close_after_commitment",
    label: "Close after commitment",
    fieldKeys: ["customer_commitment_signals", "close_attempts"],
    status: closeAfterCommitmentStatus,
    cohortLabel: "were asked for the sale after signalling",
    cohortReason: "A close attempt was recorded at or after the first commitment signal",
  },
  competitor_mentions: {
    key: "competitor_mentions",
    label: "Competitor mentions",
    fieldKeys: ["competitor_named"],
    status: presence("competitor_named"),
    cohortLabel: "named a competitor",
    cohortReason: "At least one competitor was named by the customer",
  },
  finance_demand: {
    key: "finance_demand",
    label: "Finance demand",
    fieldKeys: ["finance_requested"],
    status: (row) => row.financeRequested,
    cohortLabel: "raised finance",
    cohortReason: "At least one financing option was asked about or discussed",
  },
  recommendation_incidence: {
    key: "recommendation_incidence",
    label: "Recommendation incidence",
    fieldKeys: ["products_recommended"],
    status: presence("products_recommended"),
    cohortLabel: "were recommended a product",
    cohortReason: "At least one product was recommended",
  },
  objection_incidence: {
    key: "objection_incidence",
    label: "Objection incidence",
    fieldKeys: ["objections"],
    status: presence("objections"),
    cohortLabel: "raised an objection",
    cohortReason: "At least one objection was recorded against the interaction",
  },
  next_action_capture: {
    key: "next_action_capture",
    label: "Next action capture",
    fieldKeys: ["next_action"],
    status: presence("next_action"),
    cohortLabel: "left with a next action recorded",
    cohortReason: "A next action was captured before the customer left",
  },
  close_attempt_incidence: {
    key: "close_attempt_incidence",
    label: "Close attempt incidence",
    fieldKeys: ["close_attempts"],
    status: presence("close_attempts"),
    cohortLabel: "were asked for the sale",
    cohortReason: "At least one close attempt was recorded",
  },
  commercial_offer_incidence: {
    key: "commercial_offer_incidence",
    label: "Commercial offer incidence",
    fieldKeys: ["commercial_offer_made"],
    status: presence("commercial_offer_made"),
    cohortLabel: "were made a commercial offer",
    cohortReason: "At least one commercial offer was recorded",
  },
  cross_sell_incidence: {
    key: "cross_sell_incidence",
    label: "Cross-sell incidence",
    fieldKeys: ["cross_sell_pitch", "cross_sell_offered"],
    status: (row) => presenceAcross(row.values, "cross_sell_pitch", "cross_sell_offered"),
    cohortLabel: "were pitched something alongside",
    cohortReason: "At least one cross-sell pitch was recorded",
  },
  upsell_incidence: {
    key: "upsell_incidence",
    label: "Upsell incidence",
    fieldKeys: ["upsell_pitch", "upsell_offered"],
    status: (row) => presenceAcross(row.values, "upsell_pitch", "upsell_offered"),
    cohortLabel: "were moved up a tier",
    cohortReason: "At least one upsell pitch was recorded",
  },
  demo_where_applicable: {
    key: "demo_where_applicable",
    label: "Demo where applicable",
    fieldKeys: ["product_demo_performed"],
    status: (row) => row.demo,
    cohortLabel: "were shown the product",
    cohortReason: "A demonstration was recorded where one applied",
  },
  alternative_where_applicable: {
    key: "alternative_where_applicable",
    label: "Alternative where applicable",
    fieldKeys: ["alternative_offered"],
    status: (row) => row.alternative,
    cohortLabel: "were offered an alternative",
    cohortReason: "An alternative was offered where one applied",
  },
  outcome_established: {
    key: "outcome_established",
    label: "Outcome established",
    fieldKeys: ["confirmed_business_outcome"],
    // Known or not known. An outcome nobody established is not a no-sale, and
    // this is the one metric whose whole job is to say how often that happened.
    status: (row) => (row.outcome.business === "unknown" ? "no" : "yes"),
    cohortLabel: "ended with an established business outcome",
    cohortReason: "The business outcome was confirmed as a sale or a no sale",
  },
};

/** The headline rate for a concept. */
export function conceptMeasure(key: ConceptKey, rows: readonly PopulationRow[]): Measure {
  return incidence(rows, CONCEPTS[key].status);
}

/** Exactly the interactions that rate counted. */
export function conceptNumerator(key: ConceptKey, rows: readonly PopulationRow[]): PopulationRow[] {
  return affectedRows(rows, CONCEPTS[key].status);
}

/** The interactions a gap may be drawn from: a definitive no, never a maybe. */
export function conceptNegative(key: ConceptKey, rows: readonly PopulationRow[]): PopulationRow[] {
  const { status } = CONCEPTS[key];
  return rows.filter((row) => status(row) === "no");
}

/** Whether a field carries a definitive negative on this interaction. */
export function fieldIsDefinitelyAbsent(row: PopulationRow, fieldKey: string): boolean {
  return presenceOf(row.values, fieldKey) === "no";
}

/** Whether a field carries a stated value on this interaction. */
export function fieldIsPresent(row: PopulationRow, fieldKey: string): boolean {
  return statedText(row.values, fieldKey).length > 0;
}

export { statedRows, statedText };
