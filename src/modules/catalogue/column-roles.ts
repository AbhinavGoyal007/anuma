/**
 * Working out what a retailer's columns mean, and refusing to take their word.
 *
 * Every catalogue this system has seen arrived in a different shape. The
 * electronics export puts a whole product into one description string. The
 * Delaware dealer feed has no description and declares bodystyle, fueltype,
 * price and mileage as columns. Both were made to fit by a converter written by
 * hand, and a converter per client is the same as refusing clients: nobody with
 * three hundred products is going to wait for an integrator.
 *
 * So a model reads the header and a sample of rows once per file and says what
 * each column is. That proposal is then checked here against the column itself,
 * because the checks are cheap and the failure modes are specific and silent.
 *
 * A column proposed as the identifier whose values repeat is not an identifier,
 * whatever it is called — and believing it would collapse a hundred products
 * into one. A column proposed as price that does not parse as money is not
 * price, and would put a budget comparison on top of model numbers. A column
 * proposed as a category with a distinct value for every row is not a category;
 * it is a serial number, and grouping by it produces a report with one row per
 * product.
 *
 * Pure, so the rule that decides how a client's entire catalogue is read can be
 * tested without a file, a model or a database.
 */

/**
 * What a column turned out to be.
 *
 * Deliberately small. Anything a retailer records that is not one of these is an
 * attribute — which is the general case, not the leftover.
 */
export type ColumnRole =
  | "identifier"
  | "description"
  | "brand"
  | "category_1"
  | "category_2"
  | "category_3"
  | "price"
  | "msrp"
  | "currency"
  | "stock"
  | "location"
  | "as_of"
  | "attribute"
  | "ignore";

export type ProposedColumn = {
  column: string;
  role: ColumnRole;
  valueKind?: "numeric" | "categorical" | "text";
  unit?: string | null;
};

/** What the column actually contains, measured rather than described. */
export type ColumnProfile = {
  column: string;
  values: string[];
};

export type ColumnVerdict = {
  column: string;
  role: ColumnRole;
  valueKind: "numeric" | "categorical" | "text" | null;
  unit: string | null;
  accepted: boolean;
  reason:
    | "accepted"
    | "not_unique"
    | "mostly_empty"
    | "not_numeric"
    | "implausible_money"
    | "too_many_values_for_a_category"
    | "too_few_values_to_describe"
    | "no_variation";
  distinctValues: number;
  nullShare: number;
  sampleValues: string[];
};

/**
 * How nearly unique an identifier must be.
 *
 * Not exactly one, because real exports carry duplicate rows and the loader
 * already handles those. But a column where a tenth of the values repeat is
 * describing a group of products, not naming one.
 */
export const IDENTIFIER_UNIQUENESS = 0.95;

/**
 * How much of a column may be empty before it cannot carry a role.
 *
 * A price column that is blank on most rows will produce a catalogue that
 * silently answers "nothing within budget" for most of the range.
 */
export const MAXIMUM_NULL_SHARE = 0.5;

/**
 * How repetitive a category must be.
 *
 * A category exists to put products in groups. One distinct value per two rows
 * is not grouping anything, and a report grouped by it has as many rows as the
 * catalogue.
 */
export const CATEGORY_MAXIMUM_DISTINCT_SHARE = 0.5;

/** Money outside this range is a model number, a year, or a mistake. */
export const PLAUSIBLE_MONEY = { min: 1, max: 100_000_000 };

const MONEY = /^[^\d-]{0,3}\s*(-?[\d,]+(?:\.\d+)?)\s*[^\d]{0,4}$/;

/** The numeric value of a money-ish cell, or null if it is not one. */
export function parseMoney(raw: string): number | null {
  const text = raw.trim();
  if (text.length === 0) return null;
  const match = MONEY.exec(text);
  if (!match) return null;
  const value = Number(match[1]!.replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

function profileOf(values: readonly string[]) {
  const present = values.filter((value) => value.trim().length > 0);
  const distinct = new Set(present.map((value) => value.trim().toLowerCase()));
  return {
    present,
    distinct: distinct.size,
    nullShare: values.length === 0 ? 1 : 1 - present.length / values.length,
  };
}

/**
 * Whether a column can carry the role a model proposed for it.
 *
 * Rejection is never fatal to the load. The role goes unassigned and the
 * catalogue is poorer for it, which is recoverable; a wrong role is not.
 */
export function judgeColumn(
  proposal: ProposedColumn,
  profile: ColumnProfile,
): ColumnVerdict {
  const { present, distinct, nullShare } = profileOf(profile.values);
  const base = {
    column: proposal.column,
    role: proposal.role,
    valueKind: proposal.valueKind ?? null,
    unit: proposal.unit ?? null,
    distinctValues: distinct,
    nullShare: Number(nullShare.toFixed(4)),
    sampleValues: [...new Set(present)].slice(0, 6),
  };
  const rows = profile.values.length;
  const reject = (reason: ColumnVerdict["reason"]) => ({ ...base, accepted: false, reason });

  if (proposal.role === "ignore") return { ...base, accepted: true, reason: "accepted" };

  if (present.length === 0) return reject("mostly_empty");

  switch (proposal.role) {
    case "identifier": {
      if (nullShare > 0) return reject("mostly_empty");
      if (distinct / Math.max(rows, 1) < IDENTIFIER_UNIQUENESS) return reject("not_unique");
      return { ...base, accepted: true, reason: "accepted" };
    }

    case "price":
    case "msrp": {
      if (nullShare > MAXIMUM_NULL_SHARE) return reject("mostly_empty");
      const parsed = present.map(parseMoney).filter((value): value is number => value !== null);
      if (parsed.length / present.length < 0.8) return reject("not_numeric");
      const positive = parsed.filter((value) => value > 0);
      if (positive.length === 0) return reject("implausible_money");
      const sorted = [...positive].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)]!;
      if (median < PLAUSIBLE_MONEY.min || median > PLAUSIBLE_MONEY.max) {
        return reject("implausible_money");
      }
      return { ...base, accepted: true, reason: "accepted", valueKind: "numeric" };
    }

    case "category_1":
    case "category_2":
    case "category_3": {
      if (nullShare > MAXIMUM_NULL_SHARE) return reject("mostly_empty");
      if (distinct < 2) return reject("no_variation");
      if (distinct / Math.max(rows, 1) > CATEGORY_MAXIMUM_DISTINCT_SHARE) {
        return reject("too_many_values_for_a_category");
      }
      return { ...base, accepted: true, reason: "accepted", valueKind: "categorical" };
    }

    case "description": {
      // A description distinguishes products. One repeated string across the
      // whole file is a label, and reading attributes out of it would give every
      // product the same ones.
      if (distinct < 2) return reject("no_variation");
      return { ...base, accepted: true, reason: "accepted", valueKind: "text" };
    }

    case "stock": {
      if (nullShare > MAXIMUM_NULL_SHARE) return reject("mostly_empty");
      const numeric = present.filter((value) => Number.isFinite(Number(value.trim())));
      if (numeric.length / present.length < 0.8) return reject("not_numeric");
      return { ...base, accepted: true, reason: "accepted", valueKind: "numeric" };
    }

    case "attribute": {
      if (nullShare > MAXIMUM_NULL_SHARE) return reject("mostly_empty");
      // An attribute every product shares narrows nothing; one with a distinct
      // value per row is an identifier wearing an attribute's name.
      if (distinct < 2) return reject("no_variation");
      if (proposal.valueKind !== "numeric" && distinct / Math.max(rows, 1) > 0.9) {
        return reject("too_many_values_for_a_category");
      }
      return { ...base, accepted: true, reason: "accepted" };
    }

    default:
      return { ...base, accepted: true, reason: "accepted" };
  }
}

/**
 * The roles that may only be held once, resolved when a model proposes two.
 *
 * Ties are broken by fewest empties, then by the column that varies most, on the
 * reasoning that the more complete and more specific column is the real one.
 */
const SINGULAR: ColumnRole[] = [
  "identifier", "description", "brand", "category_1", "category_2", "category_3",
  "price", "msrp", "currency", "stock", "location", "as_of",
];

/**
 * How much a column reads like something a person wrote rather than a code.
 *
 * Retailers ship both: `DEPT_ID` holds R01 and `DEPT_NAME` holds Electronics,
 * and they carry the same grouping. Picking between them on completeness alone
 * is a coin toss they both win, and the coin came down on the codes — which puts
 * "R0101" on a dashboard where a category head expects "Televisions".
 *
 * Scored on the share of values that are words: letters and spaces, no digits.
 */
function readability(verdict: ColumnVerdict): number {
  const samples = verdict.sampleValues;
  if (samples.length === 0) return 0;
  const wordy = samples.filter((value) => /^[^\d]*[a-z][^\d]*$/i.test(value.trim()));
  return wordy.length / samples.length;
}

/** Roles whose value a person reads directly, and so should not be a code. */
const HUMAN_FACING: ColumnRole[] = ["category_1", "category_2", "category_3", "brand"];

export function resolveConflicts(verdicts: readonly ColumnVerdict[]): ColumnVerdict[] {
  const resolved = [...verdicts];
  for (const role of SINGULAR) {
    const holders = resolved.filter((verdict) => verdict.accepted && verdict.role === role);
    if (holders.length < 2) continue;
    const prefersWords = HUMAN_FACING.includes(role);
    const winner = [...holders].sort(
      (a, b) =>
        (prefersWords ? readability(b) - readability(a) : 0) ||
        a.nullShare - b.nullShare ||
        b.distinctValues - a.distinctValues,
    )[0]!;
    for (const holder of holders) {
      if (holder === winner) continue;
      // Demoted rather than discarded: a second plausible category column is
      // still something the products vary by.
      holder.role = "attribute";
      holder.valueKind = holder.valueKind ?? "categorical";
    }
  }
  return resolved;
}
