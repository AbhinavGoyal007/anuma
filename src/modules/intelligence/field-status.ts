import { measure, type Measure } from "@/modules/intelligence/guardrails";

/**
 * The four things a field can tell us, and the one thing it must never be
 * mistaken for.
 *
 * `unusable` is the whole point. "The customer never mentioned it", "the audio
 * does not settle it" and "nobody asked this record" are three different facts,
 * and a product that collapses them into "no" reports a floor that behaved
 * worse the noisier the recording was. Every incidence rate in ANUMA is built
 * from this enum so that ANUMA not knowing something can never be rendered as a
 * negative fact about a customer or a representative.
 */
export type FieldStatus = "yes" | "no" | "unusable" | "unsupported";

/**
 * A field that can also genuinely not apply.
 *
 * A demo that made no sense for the product is not a demo somebody skipped, so
 * `not_applicable` leaves the denominator entirely rather than counting against
 * the rate — the exclusion a clinical measure specification would call a
 * denominator exclusion rather than a failure.
 */
export type ApplicableStatus = FieldStatus | "not_applicable";

/**
 * How many interactions fell into each status, for one field.
 *
 * Kept as a tally rather than a rate so a caller can build whichever
 * denominator its question needs without re-reading the rows.
 */
export type StatusTally = {
  yes: number;
  no: number;
  unusable: number;
  unsupported: number;
  notApplicable: number;
};

export function tally<T>(rows: readonly T[], read: (row: T) => ApplicableStatus): StatusTally {
  const counts: StatusTally = { yes: 0, no: 0, unusable: 0, unsupported: 0, notApplicable: 0 };
  for (const row of rows) {
    const status = read(row);
    if (status === "yes") counts.yes += 1;
    else if (status === "no") counts.no += 1;
    else if (status === "unusable") counts.unusable += 1;
    else if (status === "not_applicable") counts.notApplicable += 1;
    else counts.unsupported += 1;
  }
  return counts;
}

/**
 * An incidence rate built from statuses.
 *
 * eligible = the interactions the field was asked of and could have answered
 * (yes + no + unusable). observed = the ones that answered either way.
 * affected = the ones that answered yes. Coverage is therefore how much of the
 * question we could actually read, and it drops — rather than the rate
 * dropping — when extraction was uncertain.
 */
export function incidence<T>(rows: readonly T[], read: (row: T) => ApplicableStatus): Measure {
  const counts = tally(rows, read);
  const eligible = counts.yes + counts.no + counts.unusable;
  const observed = counts.yes + counts.no;
  return measure(counts.yes, eligible, observed);
}

/**
 * An opportunity rate, where "not applicable" is excluded outright.
 *
 * Identical to `incidence` except that a genuinely inapplicable interaction
 * never enters the denominator at all, so it cannot reduce the apparent
 * coverage of the behaviour among the interactions where the behaviour was
 * possible.
 */
export const opportunity = incidence;

/** The interactions a status-built rate counted. */
export function affectedRows<T>(rows: readonly T[], read: (row: T) => ApplicableStatus): T[] {
  return rows.filter((row) => read(row) === "yes");
}

/** The interactions a gap cohort may draw from: a definitive no, never a maybe. */
export function definitiveNo<T>(rows: readonly T[], read: (row: T) => ApplicableStatus): T[] {
  return rows.filter((row) => read(row) === "no");
}
