/**
 * How much a stated fact can be trusted, and why.
 *
 * The founder's guide makes this the centre of ANUMA's trust model: every fact
 * carries a source class rather than a bare confidence number, because a
 * confidence score tells a category head nothing about whether a figure came
 * from an invoice or from a model's reading of a noisy shop floor.
 *
 * The four classes are displayed differently on purpose. "Invoice ₹79,999 at
 * 16:07" and "across this sample, larger price gaps accompanied lower
 * conversion" are both true and must never be worded as if they were the same
 * kind of statement.
 */
export const sourceClasses = ["verified", "evidence_extracted", "evaluated", "inferred"] as const;

export type SourceClass = (typeof sourceClasses)[number];

export const sourceClassMeaning: Readonly<Record<SourceClass, string>> = {
  /** Authoritative business-system or deterministic fact. Invoice, roster, clock. */
  verified: "Authoritative business-system or deterministic fact",
  /** Read from what was actually said. Must link to an utterance and timestamp. */
  evidence_extracted: "Extracted from what was actually said",
  /** Judgement against an explicit rubric. Must expose evidence, rubric and model version. */
  evaluated: "Judgement against an explicit rubric",
  /** Statistical conclusion across facts. Never presented as a direct observation. */
  inferred: "Statistical or business conclusion drawn across facts",
};

/**
 * Why a field has no value.
 *
 * Abstention is a feature, not a gap. A field left blank is indistinguishable
 * from a field the model failed on, and both look identical on a dashboard. An
 * explicit reason lets a manager tell "the customer never mentioned a budget"
 * apart from "we could not make out what they said", which are different
 * commercial facts.
 */
export const abstentionReasons = [
  /** The subject did not come up at all. */
  "not_stated",
  /** It came up but the audio or wording does not settle it. */
  "insufficient_evidence",
  /** More than one reading is defensible. */
  "ambiguous",
  /** Not applicable, or genuinely undetermined. */
  "unknown",
] as const;

export type AbstentionReason = (typeof abstentionReasons)[number];
