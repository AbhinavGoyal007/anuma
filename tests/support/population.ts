import { readEffective, type ValueRow } from "@/modules/intelligence/effective";
import type { PopulationRow, PopulationValue } from "@/modules/intelligence/population";

/**
 * Interactions built the way the loader builds them.
 *
 * Fixtures used to assemble a `PopulationRow` by hand, which let a test assert a
 * denominator the production path could never produce — the projection said one
 * thing and the atomic values said another, and only the test knew which. Every
 * fixture now goes through the same effective reader the loader uses, so a test
 * that passes is a statement about the real precedence rule.
 */

export const value = (
  fieldKey: string,
  valueText: string | null,
  options: {
    label?: string | null;
    abstention?: string | null;
    amountMinor?: number | null;
    currency?: string | null;
    valueNumber?: number | null;
    earliestMs?: number | null;
  } = {},
): PopulationValue => ({
  fieldKey,
  label: options.label ?? null,
  valueText,
  valueNumber: options.valueNumber ?? null,
  amountMinor: options.amountMinor ?? null,
  currency: options.currency ?? (options.amountMinor === undefined ? null : "INR"),
  abstention: options.abstention ?? null,
  hasEvidence: true,
  // `?? 0` would turn an explicit null — a value nobody could place in
  // the recording — back into the very start of it.
  earliestMs: options.earliestMs === undefined ? 0 : options.earliestMs,
});

/** A field recorded as definitively absent — the subject never came up. */
export const notStated = (fieldKey: string): PopulationValue =>
  value(fieldKey, null, { abstention: "not_stated" });

/** A field recorded but unreadable — the audio or wording does not settle it. */
export const unreadable = (fieldKey: string): PopulationValue =>
  value(fieldKey, null, { abstention: "insufficient_evidence" });

/** What `interaction_metrics` claims, used only where the atomic field is absent. */
export type ProjectionOverrides = Partial<Parameters<typeof readEffective>[1]>;

const EMPTY_PROJECTION: Parameters<typeof readEffective>[1] = {
  purchaseCategory: null,
  arrivalIntent: null,
  clarityStart: null,
  clarityEnd: null,
  targetBudgetMinor: null,
  maxBudgetMinor: null,
  budgetCurrency: null,
  productsRecommendedCount: 0,
  competitorCount: 0,
  customerQuestionCount: 0,
  financeRequested: false,
  demoPerformed: null,
  alternativeOffered: null,
};

let sequence = 0;

export type RowOptions = {
  conversationId?: string;
  recordId?: string;
  startedAt?: string;
  locationId?: string | null;
  representativeMembershipId?: string | null;
  teamId?: string | null;
  values?: PopulationValue[];
  /** Only consulted where the matching atomic field is unsupported. */
  projection?: ProjectionOverrides;
};

export function row(options: RowOptions = {}): PopulationRow {
  const values = options.values ?? [];
  const id = `c${(sequence += 1)}`;
  return {
    conversationId: options.conversationId ?? id,
    recordId: options.recordId ?? `r${sequence}`,
    startedAt: options.startedAt ?? "2026-08-01T10:00:00Z",
    // `?? "store-1"` would turn an explicit null — an interaction with no store
    // — back into a store, which is the case these tests exist to cover.
    locationId: options.locationId === undefined ? "store-1" : options.locationId,
    representativeMembershipId: options.representativeMembershipId ?? null,
    teamId: options.teamId ?? null,
    ...readEffective(values as ValueRow[], { ...EMPTY_PROJECTION, ...options.projection }),
    values,
  };
}

/** Resets the id counter so a test can assert on stable ids. */
export function resetRowIds(): void {
  sequence = 0;
}
