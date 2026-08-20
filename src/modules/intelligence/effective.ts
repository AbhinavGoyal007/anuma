import type { ApplicableStatus, FieldStatus } from "@/modules/intelligence/field-status";
import { readOutcome, type Outcome } from "@/modules/intelligence/outcome";

/**
 * One reading of an interaction, with the precedence rule applied once.
 *
 * Three sources describe the same interaction and they disagree. The atomic
 * field values are what the model actually extracted; a human correction sits
 * beside a value and supersedes it; and `interaction_metrics` is a projection
 * written by whichever version of the pipeline last touched the record.
 *
 * Precedence, in order:
 *   1. the latest completed interaction record  (chosen in population.ts)
 *   2. the latest valid human correction        (applied in population.ts)
 *   3. the effective atomic value
 *   4. the projection — only where the atomic field is unsupported, so it has
 *      nothing to contradict
 *
 * Rule 4 is the whole point. A manager rejects a recommendation the model
 * invented, and the projection still says one happened; reading the projection
 * would show the correction on the conversation page and ignore it on every
 * dashboard. Where the atomic field exists, it wins outright.
 *
 * Every metric on the four Intelligence pages reads this and nothing else.
 * Scattering the precedence rule is how two panels end up disagreeing about the
 * same conversation.
 */

/**
 * The only abstention that settles a question as "no".
 *
 * `not_stated` means the subject did not come up. `ambiguous`,
 * `insufficient_evidence` and `unknown` mean we could not tell, which is a
 * different fact and must never be counted against anybody.
 */
const DEFINITIVE_NO = "not_stated";

export type ValueRow = {
  fieldKey: string;
  label: string | null;
  valueText: string | null;
  valueNumber: number | null;
  amountMinor: number | null;
  currency: string | null;
  abstention: string | null;
  earliestMs?: number | null;
};

/**
 * Whether something happened, and whether we can tell.
 *
 * Aliases of the canonical statuses so existing call sites keep reading
 * naturally; there is one definition, in `field-status.ts`.
 */
export type Presence = FieldStatus;

/** A yes/no field where "not applicable" is a real third answer. */
export type Applicable = ApplicableStatus;

export const rowsFor = (values: readonly ValueRow[], fieldKey: string): ValueRow[] =>
  values.filter((value) => value.fieldKey === fieldKey);

/** Non-abstained values only — the things that were actually recorded. */
export const statedRows = (values: readonly ValueRow[], fieldKey: string): ValueRow[] =>
  rowsFor(values, fieldKey).filter((value) => !value.abstention);

export const statedText = (values: readonly ValueRow[], fieldKey: string): string[] =>
  statedRows(values, fieldKey)
    .map((value) => (value.valueText ?? "").trim())
    .filter((text) => text.length > 0);

export const firstText = (values: readonly ValueRow[], fieldKey: string): string | null =>
  statedText(values, fieldKey)[0] ?? null;

/** Whether the record carries this field at all, value or abstention. */
export const isSupported = (values: readonly ValueRow[], fieldKey: string): boolean =>
  rowsFor(values, fieldKey).length > 0;

/**
 * A list-shaped field read as presence.
 *
 * A stated value means it happened. `not_stated` means it did not. Everything
 * else — the audio was unclear, two readings are defensible, the field did not
 * apply — leaves the denominator rather than being guessed into it.
 */
export function presenceOf(values: readonly ValueRow[], fieldKey: string): Presence {
  const rows = rowsFor(values, fieldKey);
  if (rows.length === 0) return "unsupported";
  if (rows.some((value) => !value.abstention && (value.valueText ?? "").trim())) return "yes";
  if (rows.some((value) => value.abstention === DEFINITIVE_NO)) return "no";
  return "unusable";
}

/** An enum field of yes / no / not_applicable. */
export function applicableOf(values: readonly ValueRow[], fieldKey: string): Applicable {
  const rows = rowsFor(values, fieldKey);
  if (rows.length === 0) return "unsupported";
  const stated = rows.find((value) => !value.abstention)?.valueText?.trim();
  if (stated === "yes" || stated === "no" || stated === "not_applicable") return stated;
  if (rows.some((value) => value.abstention === DEFINITIVE_NO)) return "no";
  return "unusable";
}

/**
 * Presence across a current field key and its legacy predecessor.
 *
 * Cross-sell and upsell were recorded as `*_offered` before the pitch fields
 * existed. Reading only the current key makes every older interaction look like
 * a missed opportunity; reading only the legacy key loses every new one. The
 * current key wins where both are present, because it is the one a correction
 * would have been written against.
 */
export function presenceAcross(
  values: readonly ValueRow[],
  currentKey: string,
  legacyKey: string,
): Presence {
  const current = presenceOf(values, currentKey);
  if (current !== "unsupported") return current;
  return presenceOf(values, legacyKey);
}

/** A money value with the currency it was spoken in. */
export type Money = { minor: number; currency: string | null };

export function moneyOf(values: readonly ValueRow[], fieldKey: string): Money[] {
  return statedRows(values, fieldKey).flatMap((value) =>
    typeof value.amountMinor === "number"
      ? [{ minor: value.amountMinor, currency: value.currency }]
      : [],
  );
}

/** The earliest citation for a field, or null where nothing was cited. */
export function firstAt(values: readonly ValueRow[], fieldKey: string): number | null {
  const times = statedRows(values, fieldKey).flatMap((value) =>
    typeof value.earliestMs === "number" ? [value.earliestMs] : [],
  );
  return times.length ? Math.min(...times) : null;
}

const CLARITY_SCALE: Readonly<Record<string, number>> = { none: 0, low: 1, medium: 2, high: 3 };

function clarityOf(values: readonly ValueRow[], fieldKey: string): number | null {
  const row = statedRows(values, fieldKey)[0];
  if (!row) return null;
  if (typeof row.valueNumber === "number") return row.valueNumber;
  const token = (row.valueText ?? "").trim().toLowerCase();
  return token in CLARITY_SCALE ? CLARITY_SCALE[token]! : null;
}

/** What the projection said, used only where the atomic field is unsupported. */
export type Projection = {
  purchaseCategory: string | null;
  arrivalIntent: string | null;
  clarityStart: number | null;
  clarityEnd: number | null;
  targetBudgetMinor: number | null;
  maxBudgetMinor: number | null;
  budgetCurrency: string | null;
  productsRecommendedCount: number;
  competitorCount: number;
  customerQuestionCount: number;
  financeRequested: boolean;
  demoPerformed: string | null;
  alternativeOffered: string | null;
};

export type EffectiveReading = {
  purchaseCategory: string | null;
  arrivalIntent: string | null;
  clarityStart: number | null;
  clarityEnd: number | null;
  targetBudget: Money[];
  maximumBudget: Money[];
  recommendedCount: number;
  questionCount: number;
  competitorCount: number;
  financeRequested: Presence;
  demo: Applicable;
  alternative: Applicable;
  crossSell: Presence;
  upsell: Presence;
  outcome: Outcome;
};

/**
 * Reads an interaction once, applying precedence to every field a metric uses.
 *
 * A count is taken from the atomic values wherever the field exists, so a
 * rejected recommendation lowers the count. Where the field was never asked,
 * the projection stands in — it is the only evidence we have, and refusing it
 * would erase interactions analysed before a field existed.
 */
export function readEffective(
  values: readonly ValueRow[],
  projection: Projection,
): EffectiveReading {
  const countOf = (fieldKey: string, projected: number): number =>
    isSupported(values, fieldKey) ? statedText(values, fieldKey).length : projected;

  const budget = (fieldKey: string, projectedMinor: number | null): Money[] => {
    if (isSupported(values, fieldKey)) return moneyOf(values, fieldKey);
    return projectedMinor === null
      ? []
      : [{ minor: projectedMinor, currency: projection.budgetCurrency }];
  };

  const enumOr = (fieldKey: string, projected: string | null): Applicable => {
    const read = applicableOf(values, fieldKey);
    if (read !== "unsupported") return read;
    return projected === "yes" || projected === "no" || projected === "not_applicable"
      ? projected
      : "unsupported";
  };

  const financeAtomic = presenceOf(values, "finance_requested");

  return {
    // `?? projection` would resurrect a stale projection the moment a manager
    // rejected the atomic value: the correction would show on the conversation
    // page and be silently undone on every dashboard. The projection may only
    // stand in where the field was never asked.
    purchaseCategory: isSupported(values, "purchase_category")
      ? firstText(values, "purchase_category")
      : projection.purchaseCategory,
    arrivalIntent: isSupported(values, "arrival_intent_state")
      ? firstText(values, "arrival_intent_state")
      : projection.arrivalIntent,
    clarityStart: isSupported(values, "requirement_clarity_start")
      ? clarityOf(values, "requirement_clarity_start")
      : projection.clarityStart,
    clarityEnd: isSupported(values, "requirement_clarity_end")
      ? clarityOf(values, "requirement_clarity_end")
      : projection.clarityEnd,
    targetBudget: budget("target_budget", projection.targetBudgetMinor),
    maximumBudget: budget("maximum_budget", projection.maxBudgetMinor),
    recommendedCount: countOf("products_recommended", projection.productsRecommendedCount),
    questionCount: countOf("customer_questions", projection.customerQuestionCount),
    competitorCount: countOf("competitor_named", projection.competitorCount),
    financeRequested:
      financeAtomic !== "unsupported"
        ? financeAtomic
        : projection.financeRequested
          ? "yes"
          : "unsupported",
    demo: enumOr("product_demo_performed", projection.demoPerformed),
    alternative: enumOr("alternative_offered", projection.alternativeOffered),
    crossSell: presenceAcross(values, "cross_sell_pitch", "cross_sell_offered"),
    upsell: presenceAcross(values, "upsell_pitch", "upsell_offered"),
    outcome: readOutcome(values),
  };
}
