import type { ExtractedValue } from "@/modules/interaction-record/extraction-contract";

/**
 * Which evidence settled an interaction's business outcome.
 *
 * The v1.3 extraction spec lets `confirmed_business_outcome` rest on either a
 * verified transaction record or the transcript, and says metadata wins where
 * both exist. That decision is the system's, not the model's: we know whether a
 * till record reached us and the model does not, so asking it would be inviting
 * a guess about our own plumbing.
 *
 * The distinction is not bookkeeping. A conversion rate assembled from
 * transcripts is a reading of what people said; one assembled from receipts is a
 * fact. A dashboard that shows the two as the same number is telling a manager
 * something it cannot support, and this is the column that keeps them apart.
 */
export type OutcomeBasis = "verified_metadata" | "conversation_evidence";

export const CONFIRMED_OUTCOME_FIELD = "confirmed_business_outcome";
/** The verified field a point-of-sale integration would land in. */
export const VERIFIED_OUTCOME_FIELD = "commercial_outcome";

export function deriveOutcomeBasis(
  values: readonly Pick<ExtractedValue, "field" | "abstention" | "valueText">[],
): OutcomeBasis | null {
  const settled = (field: string) =>
    values.some((value) => value.field === field && !value.abstention && value.valueText);

  // Metadata outranks anything said, so it is tested first — and an outcome
  // nobody established has no basis at all rather than a default one.
  if (settled(VERIFIED_OUTCOME_FIELD)) return "verified_metadata";
  if (settled(CONFIRMED_OUTCOME_FIELD)) return "conversation_evidence";
  return null;
}
