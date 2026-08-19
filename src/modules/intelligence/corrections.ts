/**
 * The two rules that decide which rows an analysis is allowed to count.
 *
 * Both used to live inside the database read, where they could only be checked
 * by looking at a page and hoping. They are the rules most likely to be quietly
 * wrong — a conversation counted twice inflates every rate by however often it
 * was reprocessed, and a value a manager rejected still counting is the product
 * telling someone their correction did nothing.
 */

/** Enough of an interaction record to choose between versions of it. */
export type RecordChoice = { id: string; conversationId: string; createdAt: string };

/**
 * One record per conversation: the most recently completed.
 *
 * A conversation that has been re-extracted leaves several records behind it,
 * and every one of them holds a full set of values. Counting them all would not
 * fail loudly; it would make every rate look busier the more the pipeline
 * improved.
 */
export function currentRecordIds(records: readonly RecordChoice[]): string[] {
  const newest = new Map<string, RecordChoice>();
  for (const record of records) {
    const held = newest.get(record.conversationId);
    if (!held || isNewer(record, held)) newest.set(record.conversationId, record);
  }
  return [...newest.values()].map((record) => record.id);
}

/**
 * Which of two records for the same conversation is the current one.
 *
 * Timestamp first, then id. The tie-break is not pedantry: two records written
 * in the same transaction can share a created_at to the microsecond, and without
 * a second key the winner depends on the order the database happened to return
 * rows. That makes a page quietly non-deterministic — the same filters produce a
 * different number on refresh — which is the hardest kind of bug to be believed
 * about.
 */
function isNewer(candidate: RecordChoice, held: RecordChoice): boolean {
  if (candidate.createdAt !== held.createdAt) return candidate.createdAt > held.createdAt;
  return candidate.id > held.id;
}

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
