/**
 * Deciding whether a discovered attribute may be believed, with nobody asked.
 *
 * Every other proposal in this system ends at a person: embeddings rank the
 * categories a label might mean and someone confirms. That cannot work here.
 * Each retailer's taxonomy is hundreds of nodes, each node needs several
 * attributes, and every new customer arrives with a vocabulary nobody at ANUMA
 * has seen — so a confirm queue would be an onboarding cost that scales with the
 * customer's catalogue, which is the same as refusing the customer.
 *
 * What replaces the person is not a more confident model. It is that a wrong
 * extraction does not look like a right one *in aggregate*, even when any single
 * row is unreadable without domain knowledge. Nobody here knows what capacities
 * washing machines are sold in — but every real dimension, whatever the
 * industry, occupies a band. Fridges run a few hundred litres to a few hundred
 * more; air conditioners one ton to four; televisions forty inches to eighty.
 * Model numbers and years obey no band at all, because they are identifiers and
 * a dimension is a measurement.
 *
 * The first version of this file tested whether values *repeated*, on the
 * reasoning that real specifications cluster on a handful of sizes. Run against
 * this catalogue it was wrong in both directions at once. Refrigerator volumes —
 * 302L, 304L, 411L, 450L, 495L, every one correct — repeat almost never, and
 * would have been thrown away. A junk reading of the letter G out of model codes
 * repeated *more* than the fridges did, and would have been kept. Repetition
 * measures how finely an industry divides its sizes, which is not a fact about
 * whether the reading is right.
 *
 * Spread separates them without knowing anything about the industry: every real
 * dimension measured here fell under 7, and the junk sat at 133.
 *
 * The safe direction is deliberate. A rejected attribute means the product says
 * "we could not tell" — an insight lost. An accepted wrong one means it tells a
 * manager they had stock they never had, and one of those ends the manager's
 * trust in every number on the page. So a check that cannot settle the question
 * rejects.
 *
 * Pure, so the rule that decides what nobody reviews is testable on its own.
 */

import type { AttributeDefinition } from "@/modules/catalogue/attribute-schema";
import type { ExtractedAttribute } from "@/modules/catalogue/attribute-extract";

/**
 * The share of a node's products an attribute must read to be believed.
 *
 * Not near-total: descriptions are truncated at a column width, terse rows exist
 * in every export, and a dimension only some products state is still a real
 * dimension. But an attribute found in a handful of rows is a coincidence
 * matched against a large catalogue, not a convention.
 */
export const MINIMUM_COVERAGE = 0.2;

/**
 * How far a real dimension's values may spread, high end over low.
 *
 * Measured between the tenth and ninetieth percentiles so a single stray reading
 * cannot condemn an attribute. Against this catalogue: washing machine capacity
 * 2.7, television size 2.0, air conditioner tonnage 2.0, refrigerator volume
 * 6.7 — and a deliberately wrong reading of model-code letters, 133. The gap
 * between the widest real dimension and the junk is a factor of twenty, so the
 * threshold sits far from both rather than tuned against either.
 */
export const MAXIMUM_SPREAD = 20;

/**
 * Readings needed before spread means anything.
 *
 * Ten values agreeing is a small sample agreeing with itself. The check is a
 * statement about a convention, and a convention needs enough rows to have been
 * observed rather than assumed.
 */
export const MINIMUM_SAMPLE = 30;

export type PlausibilityVerdict = {
  usable: boolean;
  coverage: number;
  /** Ninetieth percentile over tenth. Infinite when the low end reads zero. */
  spread: number;
  distinctValues: number;
  /** Why it was rejected, for the health screen and for debugging a proposal. */
  reason:
    | "usable"
    | "too_few_readings"
    | "low_coverage"
    | "not_a_measurement"
    | "single_value_no_discrimination";
};

/** A percentile of a small sample, taken by position rather than interpolated. */
function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(fraction * sorted.length));
  return sorted[index]!;
}

/**
 * Whether an attribute, as actually read over a node, describes the products.
 *
 * Judged on the extraction rather than the proposal, because a definition that
 * reads a dimension and a definition that reads a model number look identical
 * until they are run.
 */
export function judgeAttribute(
  definition: AttributeDefinition,
  readings: readonly ExtractedAttribute[],
  itemsInNode: number,
): PlausibilityVerdict {
  const mine = readings.filter((reading) => reading.key === definition.key);
  const coverage = itemsInNode > 0 ? mine.length / itemsInNode : 0;

  const numbers = mine
    .map((reading) => reading.valueNumeric)
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);
  const low = percentile(numbers, 0.1);
  const spread = numbers.length === 0 ? 0 : low > 0 ? percentile(numbers, 0.9) / low : Infinity;

  const distinctValues = new Set(
    mine.map((reading) =>
      definition.kind === "numeric" ? String(reading.valueNumeric) : (reading.valueText ?? ""),
    ),
  ).size;

  const base = { coverage, spread, distinctValues };

  if (mine.length < MINIMUM_SAMPLE) {
    return { ...base, usable: false, reason: "too_few_readings" };
  }
  if (coverage < MINIMUM_COVERAGE) {
    return { ...base, usable: false, reason: "low_coverage" };
  }
  // An attribute every product shares tells a shopper nothing and narrows
  // nothing: a requirement naming it would be met by the whole node. Real, but
  // not worth storing as something to match on.
  if (distinctValues < 2) {
    return { ...base, usable: false, reason: "single_value_no_discrimination" };
  }
  // Categorical values have no magnitude, so there is no band for them to sit
  // in; a vocabulary that matched the wrong words shows up as coverage instead.
  if (definition.kind === "numeric" && spread > MAXIMUM_SPREAD) {
    return { ...base, usable: false, reason: "not_a_measurement" };
  }

  return { ...base, usable: true, reason: "usable" };
}
