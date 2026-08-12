import { extractedFields } from "@/modules/interaction-record/fields";
import type {
  ExtractedValue,
  ExtractionField,
} from "@/modules/interaction-record/extraction-contract";

/**
 * Checks that every extracted value is supported by the transcript it came from.
 *
 * Structured output guarantees the shape of a reply, not its truth: a model can
 * return a perfectly formed budget for a conversation in which nobody mentioned
 * money, and cite a segment id it invented. This is the step that catches that,
 * and it runs before anything reaches the database.
 *
 * Rejection is deliberately preferred to repair. A value that cannot be traced
 * to something a person actually said has no place in a record whose entire
 * claim is that any metric can be drilled back to its evidence.
 */

export type RejectionReason =
  | "unknown_field"
  | "missing_evidence"
  | "unknown_segment"
  | "missing_value"
  | "invalid_enum_value"
  | "missing_currency"
  | "duplicate_single_value";

export type RejectedValue = { value: ExtractedValue; reason: RejectionReason };

export type GroundingResult = {
  accepted: ExtractedValue[];
  rejected: RejectedValue[];
};

function hasValue(value: ExtractedValue, field: ExtractionField): boolean {
  switch (field.valueKind) {
    case "money":
      return value.amountMajor !== null;
    case "number":
      return value.valueNumber !== null;
    default:
      return value.valueText !== null && value.valueText.trim().length > 0;
  }
}

/**
 * Separates values the transcript supports from those it does not.
 *
 * `segmentIds` is the set of segments that genuinely exist for this
 * conversation. Anything cited outside it is a fabricated reference, which is
 * the failure mode worth catching: a hallucinated value with a real-looking
 * citation is far more damaging than an obvious blank.
 */
export function groundValues(
  values: readonly ExtractedValue[],
  segmentIds: ReadonlySet<string>,
  fields: readonly ExtractionField[] = extractedFields,
): GroundingResult {
  const accepted: ExtractedValue[] = [];
  const rejected: RejectedValue[] = [];
  const seenSingle = new Set<string>();
  // The org's field set defines what is a known field and what shape it takes.
  // Defaults to the static registry so callers that never customised behave
  // exactly as before.
  const byKey = new Map(fields.map((field) => [field.key, field]));

  for (const value of values) {
    const field = byKey.get(value.field);
    if (!field) {
      rejected.push({ value, reason: "unknown_field" });
      continue;
    }

    // An abstention is an answer. It carries no value and needs no citation,
    // because "the customer never mentioned a budget" is itself a finding.
    //
    // The value slots are cleared rather than trusted: models routinely return
    // an abstention alongside a half-formed guess, and keeping both would store
    // a fact the model itself declined to assert.
    if (value.abstention) {
      accepted.push({
        ...value,
        valueText: null,
        valueNumber: null,
        amountMajor: null,
        amountScale: null,
        currency: null,
        label: null,
      });
      continue;
    }

    if (!hasValue(value, field)) {
      rejected.push({ value, reason: "missing_value" });
      continue;
    }

    if (field.valueKind === "enum" && !field.values!.includes(value.valueText!)) {
      rejected.push({ value, reason: "invalid_enum_value" });
      continue;
    }

    if (field.valueKind === "money" && !value.currency) {
      // A number without a currency is not money, and storing it as though it
      // were is how a price band becomes meaningless.
      rejected.push({ value, reason: "missing_currency" });
      continue;
    }

    if (field.requiresEvidence) {
      if (value.evidenceSegmentIds.length === 0) {
        rejected.push({ value, reason: "missing_evidence" });
        continue;
      }
      if (value.evidenceSegmentIds.some((id) => !segmentIds.has(id))) {
        rejected.push({ value, reason: "unknown_segment" });
        continue;
      }
    }

    if (field.cardinality === "single") {
      if (seenSingle.has(field.key)) {
        // Two answers to a question that has one answer means neither is
        // trustworthy; the first is kept and the conflict is surfaced.
        rejected.push({ value, reason: "duplicate_single_value" });
        continue;
      }
      seenSingle.add(field.key);
    }

    accepted.push(value);
  }

  return { accepted, rejected };
}

/** Share of values the transcript did not support. A headline quality signal. */
export function rejectionRate(result: GroundingResult): number {
  const total = result.accepted.length + result.rejected.length;
  return total === 0 ? 0 : result.rejected.length / total;
}
