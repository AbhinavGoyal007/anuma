/**
 * How an interaction ended, on the two axes that answer different questions.
 *
 * The business outcome says what the store got: a sale, or not. The decision
 * state says where the customer landed: they bought, they are still looking,
 * they deferred, they declined, they booked a follow-up. These disagree
 * constantly and legitimately — a customer who says they will come back on
 * Saturday has a decision state of follow_up_scheduled and no sale, and forcing
 * either field to agree with the other destroys the more useful of the two.
 *
 * The analytics brief asks for one field carrying six values: sale, no_sale,
 * follow_up, researching, deferred, unknown. That merges the axes back
 * together. Every cohort it needs is still available here — ready-to-buy left
 * unresolved, follow-up with no next action — but read from the field that
 * actually holds each part, rather than from one field pretending to hold both.
 */

/** What the business got. From confirmed_business_outcome. */
export type BusinessOutcome = "sale" | "no_sale" | "unknown";

/** Where the customer landed. From final_decision_state. */
export type DecisionState =
  "purchased" | "researching" | "deferred" | "rejected" | "follow_up_scheduled" | "unknown";

export type Outcome = {
  business: BusinessOutcome;
  decision: DecisionState;
  /** Which evidence settled the business outcome, where one did. */
  basis: "verified_metadata" | "conversation_evidence" | null;
};

const BUSINESS_VALUES = new Set<string>(["sale", "no_sale"]);
const DECISION_VALUES = new Set<string>([
  "purchased",
  "researching",
  "deferred",
  "rejected",
  "follow_up_scheduled",
]);

export type OutcomeInputValue = {
  fieldKey: string;
  valueText: string | null;
  abstention: string | null;
};

function stated(values: readonly OutcomeInputValue[], fieldKey: string): string | null {
  const row = values.find((value) => value.fieldKey === fieldKey && !value.abstention);
  return row?.valueText ?? null;
}

export function readOutcome(values: readonly OutcomeInputValue[]): Outcome {
  const business = stated(values, "confirmed_business_outcome");
  const decision = stated(values, "final_decision_state");
  const basis = stated(values, "outcome_basis");
  return {
    business: business && BUSINESS_VALUES.has(business) ? (business as BusinessOutcome) : "unknown",
    decision: decision && DECISION_VALUES.has(decision) ? (decision as DecisionState) : "unknown",
    basis: basis === "verified_metadata" || basis === "conversation_evidence" ? basis : null,
  };
}

/**
 * Whether the interaction ended without the customer buying and without the
 * question being closed — the population every leakage cohort is drawn from.
 *
 * A confirmed sale is resolved. So is an outright rejection: the customer
 * decided, and chasing it is not the same work as chasing someone who is still
 * deciding. Everything in between is unresolved, including the interactions
 * where the business outcome is simply unknown, because "we do not know whether
 * this became a sale" is precisely the case a manager should look at.
 */
export function isUnresolved(outcome: Outcome): boolean {
  if (outcome.business === "sale" || outcome.decision === "purchased") return false;
  if (outcome.decision === "rejected") return false;
  return true;
}

/** Whether the customer left with a further step agreed. */
export function isFollowUp(outcome: Outcome): boolean {
  return outcome.decision === "follow_up_scheduled";
}

/**
 * Whether the outcome is classified well enough to compare behaviours across.
 *
 * Sale-versus-no-sale association is the one place an unknown outcome cannot be
 * carried along: an interaction of unknown result belongs to neither group, and
 * silently filing it under no_sale would manufacture the comparison.
 */
export function isOutcomeClassified(outcome: Outcome): boolean {
  return outcome.business !== "unknown";
}

/** Display order for the outcome lane, most resolved first. */
export const DECISION_ORDER: readonly DecisionState[] = [
  "purchased",
  "follow_up_scheduled",
  "researching",
  "deferred",
  "rejected",
  "unknown",
];

export const DECISION_LABELS: Readonly<Record<DecisionState, string>> = {
  purchased: "Purchased",
  follow_up_scheduled: "Follow-up agreed",
  researching: "Still researching",
  deferred: "Deferred",
  rejected: "Declined",
  unknown: "Not established",
};

export const BUSINESS_LABELS: Readonly<Record<BusinessOutcome, string>> = {
  sale: "Sale",
  no_sale: "No sale",
  unknown: "Not established",
};
