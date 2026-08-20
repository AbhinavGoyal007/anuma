/**
 * What a human correction does to a value.
 *
 * This used to live inside the database read, where it could only be checked by
 * looking at a page and hoping. It is the rule most likely to be quietly wrong,
 * and a value a manager rejected still counting is the product telling someone
 * their correction did nothing.
 *
 * Which record a conversation is counted through is a separate question and
 * belongs with Coverage — see `currentRecordCandidate`, which ties the choice to
 * the conversation's active transcription run.
 */

export type Correction = {
  fieldValueId: string;
  correctedText: string | null;
  isRejected: boolean;
  createdAt: string;
};

export type CorrectionOutcome =
  { kind: "kept" } | { kind: "corrected"; text: string } | { kind: "rejected" };

/**
 * What the latest human correction says about a stored value.
 *
 * The model's original is never edited — a correction sits beside it — so the
 * newest correction per value is the one that counts. A rejection removes the
 * value from every metric rather than merely marking it, because a manager who
 * rejects a reading is saying it should not have been there, and leaving it in
 * the denominator honours the letter of that and not the point.
 */
export function correctionFor(
  valueId: string,
  corrections: readonly Correction[],
): CorrectionOutcome {
  let latest: Correction | null = null;
  for (const correction of corrections) {
    if (correction.fieldValueId !== valueId) continue;
    if (!latest || correction.createdAt > latest.createdAt) latest = correction;
  }
  if (!latest) return { kind: "kept" };
  if (latest.isRejected) return { kind: "rejected" };
  return latest.correctedText
    ? { kind: "corrected", text: latest.correctedText }
    : // A correction that cleared the text without rejecting the value says
      // nothing usable, so the original stands rather than becoming blank.
      { kind: "kept" };
}

/**
 * What corrections cannot reach today.
 *
 * The table stores replacement text and a rejection flag, and nothing else. A
 * misread number, a wrong currency, a mislabelled requirement dimension or a
 * misplaced pitch level cannot be corrected — only rejected wholesale. Recorded
 * here so the limit is stated in the product rather than discovered by a manager
 * whose correction changed a chart in a way they did not expect.
 */
export const CORRECTION_LIMITS =
  "Corrections replace text or reject a value. A numeric amount, a currency, a requirement label or a pitch hierarchy level cannot be corrected in place — rejecting the value is the only way to keep it out of a metric.";
