/**
 * How far a proposal may be trusted without someone reading it.
 *
 * A retailer's taxonomy is several hundred labels. Confirming them one at a time
 * is not review, it is data entry, and a person doing it will stop reading by
 * the fiftieth row — which is worse than not asking them at all. So the queue
 * has to separate the labels where the model is genuinely unsure from the ones
 * where it plainly is not.
 *
 * The separator is the *margin* to the runner-up, not the top score. Measured
 * against AG LLC's real catalogue:
 *
 *   SmartPhone Accessories > Mobile Cases   smartphone 0.583  margin 0.076  wrong
 *   SmartPhone Accessories > Screen Prot.   smartphone 0.482  margin 0.033  wrong
 *   Notebooks > Copilot+ PC                 laptop     0.579  margin 0.196  right
 *   Notebooks > Artificial Intelligence PC  laptop     0.565  margin 0.130  right
 *   Cables & Connectors > Mobile Acc Cable  accessory  0.429  margin 0.101  right
 *
 * The scores overlap and settle nothing. The margins do not: every wrong call
 * sat below 0.10 and every right one at or above it. A label whose best two
 * categories are neck and neck is one the model cannot call, however confident
 * its top score looks.
 *
 * Pure, so the rule that decides what a person never sees is testable on its own.
 */

export type ProposalConfidence = "clear" | "ambiguous" | "none";

/**
 * The margin at which the runner-up stops being a serious contender.
 *
 * Set from the measurements above, and deliberately at the boundary rather than
 * comfortably inside it: the cost of a wrong bulk confirmation is a wrong
 * category on a dashboard, and the cost of an unnecessary question is one click.
 */
export const CLEAR_MARGIN = 0.1;

export function proposalConfidence(key: string | null, margin: number | null): ProposalConfidence {
  if (key === null) return "none";
  // No runner-up at all means nothing competed with it.
  if (margin === null) return "clear";
  return margin >= CLEAR_MARGIN ? "clear" : "ambiguous";
}

/** Whether a proposal may be confirmed without a person reading that row. */
export function isBulkConfirmable(key: string | null, margin: number | null): boolean {
  return proposalConfidence(key, margin) === "clear";
}
