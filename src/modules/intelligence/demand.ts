import { isSupported, statedRows, statedText, type Money } from "@/modules/intelligence/effective";
import type { Measure } from "@/modules/intelligence/guardrails";
import { measure } from "@/modules/intelligence/guardrails";
import {
  arrivedDecided,
  clarityImproved,
  competitorMentionIncidence,
  confirmedNoSaleReasonCoverage,
  financeDemand,
  outcomeEstablished,
  questionResponseCoverage,
} from "@/modules/intelligence/measures";
import { isUnresolved } from "@/modules/intelligence/outcome";
import type { PopulationRow } from "@/modules/intelligence/population";

/**
 * What customers came in wanting, and where they got stuck.
 *
 * Customer-side only. What the representative did about any of it belongs to
 * Frontline — keeping the two apart is what lets a manager see that finance
 * demand rose without that fact immediately becoming an accusation about the
 * floor staff.
 *
 * Every rate here is delegated to the canonical measures. This file shapes
 * distributions and lists; it does not define a business concept a second time.
 */

/**
 * How often each distinct value appears, counted by interaction.
 *
 * A customer who mentions gaming three times is one interaction wanting gaming,
 * not three. And because one customer can want several things, these shares add
 * to more than a hundred — so this is penetration, never a mix, and the page
 * must not label it as one.
 */
export type RankedShare = {
  value: string;
  interactions: number;
  share: number;
  /** Present where the field carries a requirement dimension. */
  label: string | null;
};

export type RankedResult = {
  entries: RankedShare[];
  eligible: number;
  /** Distinct values before any limit — what "Show all" must promise. */
  distinct: number;
};

export function rankedShare(
  rows: readonly PopulationRow[],
  fieldKeys: readonly string[],
  limit = 10,
): RankedResult {
  const eligible = rows.filter((row) =>
    fieldKeys.some((key) => isSupported(row.values, key)),
  ).length;
  const counts = new Map<string, { interactions: Set<string>; label: string | null }>();

  for (const row of rows) {
    for (const key of fieldKeys) {
      for (const value of statedRows(row.values, key)) {
        const text = (value.valueText ?? "").trim();
        if (!text) continue;
        // Cased and spaced as spoken. Merging near-identical free text here
        // would invent a taxonomy the business never agreed to, and the page
        // says so rather than presenting these as controlled categories.
        const entry = counts.get(text) ?? { interactions: new Set<string>(), label: value.label };
        entry.interactions.add(row.conversationId);
        counts.set(text, entry);
      }
    }
  }

  const all = [...counts.entries()]
    .map(([value, entry]) => ({
      value,
      interactions: entry.interactions.size,
      share: eligible > 0 ? entry.interactions.size / eligible : 0,
      label: entry.label,
    }))
    .sort((a, b) => b.interactions - a.interactions || a.value.localeCompare(b.value));

  // The distinct count travels with the list. "Show all 40" was a promise the
  // page could not keep when the underlying calculation had already been capped
  // at forty and the real answer was seventy-three.
  return { entries: all.slice(0, limit), eligible, distinct: all.length };
}

/** A distribution over a fixed, mutually exclusive vocabulary. */
export function distribution(
  rows: readonly PopulationRow[],
  read: (row: PopulationRow) => string | null,
): { entries: RankedShare[]; classified: number } {
  const counts = new Map<string, number>();
  let classified = 0;
  for (const row of rows) {
    const value = read(row);
    if (!value) continue;
    classified += 1;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const entries = [...counts.entries()]
    .map(([value, interactions]) => ({
      value,
      interactions,
      share: classified > 0 ? interactions / classified : 0,
      label: null,
    }))
    .sort((a, b) => b.interactions - a.interactions);
  return { entries, classified };
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

/** Budgets for one currency. Never combined with another. */
export type CurrencyBudget = {
  currency: string | null;
  targetMedian: number | null;
  targetObserved: number;
  maximumMedian: number | null;
  maximumObserved: number;
  stretchMedian: number | null;
  stretchObserved: number;
};

/**
 * What customers said they would spend, kept apart by currency.
 *
 * A median across rupees and dirhams is not a smaller number or a larger one —
 * it is not a number. There is no conversion here on purpose: an FX rate is a
 * business decision with a date on it, and inventing one inside a dashboard
 * would produce a figure nobody could reproduce.
 */
export type BudgetPicture = {
  byCurrency: CurrencyBudget[];
  /** True where more than one currency was observed in this scope. */
  mixed: boolean;
  /** Share of interactions that stated a target budget at all. */
  observationRate: Measure;
};

function budgetsFor(rows: readonly PopulationRow[], currency: string | null): CurrencyBudget {
  const inCurrency = (money: Money[]) =>
    money.filter((amount) => (amount.currency ?? null) === currency).map((amount) => amount.minor);

  const targets = rows.flatMap((row) => inCurrency(row.targetBudget).slice(0, 1));
  const maximums = rows.flatMap((row) => inCurrency(row.maximumBudget).slice(0, 1));
  // Both figures, in the same currency, and the ceiling must not sit below the
  // opening budget — a customer who said 80 and then 60 has been misread
  // somewhere, and averaging that in produces a negative stretch meaning
  // nothing.
  const stretches = rows.flatMap((row) => {
    const target = inCurrency(row.targetBudget)[0];
    const maximum = inCurrency(row.maximumBudget)[0];
    return target !== undefined && maximum !== undefined && maximum >= target
      ? [maximum - target]
      : [];
  });

  return {
    currency,
    targetMedian: median(targets),
    targetObserved: targets.length,
    maximumMedian: median(maximums),
    maximumObserved: maximums.length,
    stretchMedian: median(stretches),
    stretchObserved: stretches.length,
  };
}

export function budgetPicture(rows: readonly PopulationRow[]): BudgetPicture {
  const currencies = [
    ...new Set(
      rows.flatMap((row) =>
        [...row.targetBudget, ...row.maximumBudget].map((amount) => amount.currency ?? null),
      ),
    ),
  ].sort((a, b) => (a ?? "").localeCompare(b ?? ""));

  const stated = rows.filter((row) => row.targetBudget.length > 0).length;
  return {
    byCurrency: currencies.map((currency) => budgetsFor(rows, currency)),
    mixed: currencies.length > 1,
    observationRate: measure(stated, rows.length, rows.length),
  };
}

/**
 * Where requirement clarity started and where it ended.
 *
 * A four-by-four grid rather than an average, because the average hides the case
 * that matters: customers who arrived vague and left just as vague. A mean that
 * moves from 1.4 to 1.6 looks like progress and can contain forty conversations
 * that went nowhere.
 */
export type ClarityMatrix = {
  /** cells[start][end] — counts of interactions. */
  cells: number[][];
  paired: number;
  improved: Measure;
  clearByClose: Measure;
  /** Arrived unclear and left unclear. The number worth acting on. */
  stalledLow: number;
};

export const CLARITY_LABELS = ["None", "Low", "Medium", "High"] as const;

export function clarityMatrix(rows: readonly PopulationRow[]): ClarityMatrix {
  const cells = [0, 1, 2, 3].map(() => [0, 0, 0, 0]);
  let paired = 0;
  let stalledLow = 0;

  for (const row of rows) {
    if (row.clarityStart === null || row.clarityEnd === null) continue;
    paired += 1;
    cells[row.clarityStart]![row.clarityEnd]! += 1;
    if (row.clarityStart <= 1 && row.clarityEnd <= 1) stalledLow += 1;
  }

  const closeObserved = rows.filter((row) => row.clarityEnd !== null).length;
  return {
    cells,
    paired,
    improved: clarityImproved(rows),
    clearByClose: measure(
      rows.filter((row) => row.clarityEnd !== null && row.clarityEnd >= 2).length,
      rows.length,
      closeObserved,
    ),
    stalledLow,
  };
}

export type DemandMetrics = {
  analysed: number;
  highIntent: Measure;
  financeDemand: Measure;
  competitorPressure: Measure;
  questionRate: Measure;
  purchaseConditions: Measure;
  outcomeClassified: Measure;
  preferenceFormed: Measure;
};

export function computeDemand(rows: readonly PopulationRow[]): DemandMetrics {
  // Purchase conditions only mean something where the visit did not close. A
  // customer who bought had no condition left to state.
  const unresolved = rows.filter((row) => isUnresolved(row.outcome));
  const conditionSupported = unresolved.filter((row) =>
    isSupported(row.values, "customer_purchase_conditions"),
  );
  const preferenceSupported = rows.filter((row) =>
    isSupported(row.values, "final_preferred_product"),
  );

  return {
    analysed: rows.length,
    highIntent: arrivedDecided(rows),
    financeDemand: financeDemand(rows),
    competitorPressure: competitorMentionIncidence(rows),
    questionRate: questionResponseCoverage(rows),
    purchaseConditions: measure(
      conditionSupported.filter(
        (row) => statedText(row.values, "customer_purchase_conditions").length > 0,
      ).length,
      unresolved.length,
      conditionSupported.length,
    ),
    outcomeClassified: outcomeEstablished(rows),
    preferenceFormed: measure(
      preferenceSupported.filter(
        (row) => statedText(row.values, "final_preferred_product").length > 0,
      ).length,
      rows.length,
      preferenceSupported.length,
    ),
  };
}

/**
 * The primary observed reason among interactions confirmed as no sale.
 *
 * Drawn strictly from confirmed no-sales. An earlier version used "unresolved",
 * which swept in every interaction whose outcome was never established — a
 * population we know nothing about — while excluding a customer who explicitly
 * declined. A chart titled "why we did not convert" cannot be built from
 * conversations where we do not know whether we converted.
 *
 * This is what was observed and classified, never a proven cause.
 */
export type NoSaleReasons = {
  entries: RankedShare[];
  distinct: number;
  /** Confirmed no-sales carrying an observed reason. */
  classified: number;
  /** All confirmed no-sales, whether a reason was recorded or not. */
  confirmedNoSales: number;
  /** Share of confirmed no-sales where a reason was actually observed. */
  coverage: Measure;
};

export function nonConversionReasons(rows: readonly PopulationRow[], limit = 10): NoSaleReasons {
  const confirmed = rows.filter((row) => row.outcome.business === "no_sale");
  const { entries, classified } = distribution(
    confirmed,
    (row) => statedText(row.values, "primary_non_conversion_reason")[0] ?? null,
  );
  return {
    entries: entries.slice(0, limit),
    distinct: entries.length,
    classified,
    confirmedNoSales: confirmed.length,
    coverage: confirmedNoSaleReasonCoverage(rows),
  };
}

/**
 * Party size, bucketed to the three groups a manager acts on.
 *
 * The stored value is free text — "2", "two", "couple with child". Only values
 * that read as a number are bucketed; anything else stays out of the
 * distribution rather than being guessed into one, and the raw value is still
 * reachable through the evidence path.
 */
export function partySizeDistribution(rows: readonly PopulationRow[]): {
  entries: RankedShare[];
  classified: number;
} {
  return distribution(rows, (row) => {
    const text = statedText(row.values, "customer_party_size")[0] ?? null;
    if (!text) return null;
    const digits = text.match(/\d+/);
    if (!digits) return null;
    const size = Number(digits[0]);
    if (!Number.isFinite(size) || size <= 0) return null;
    return size >= 3 ? "3+" : String(size);
  });
}

/**
 * Where a requirement came from: the customer said it, the conversation drew it
 * out, or we inferred it.
 *
 * Counted per interaction per distinct origin, so an interaction carrying both
 * a stated and a discovered requirement appears in both — which is what the
 * field records, and collapsing it to one would lose the discovery.
 */
export const REQUIREMENT_ORIGINS = ["stated", "discovered", "inferred"] as const;

export function originStrip(rows: readonly PopulationRow[]): {
  entries: RankedShare[];
  eligible: number;
} {
  const eligible = rows.filter((row) => isSupported(row.values, "requirement_origin")).length;
  const counts = new Map<string, number>();
  for (const row of rows) {
    const seen = new Set<string>();
    for (const value of statedRows(row.values, "requirement_origin")) {
      const token = (value.valueText ?? "").trim().toLowerCase();
      const origin = REQUIREMENT_ORIGINS.find((option) => option === token);
      if (!origin || seen.has(origin)) continue;
      seen.add(origin);
      counts.set(origin, (counts.get(origin) ?? 0) + 1);
    }
  }
  return {
    entries: REQUIREMENT_ORIGINS.map((origin) => ({
      value: origin,
      interactions: counts.get(origin) ?? 0,
      share: eligible > 0 ? (counts.get(origin) ?? 0) / eligible : 0,
      label: null,
    })),
    eligible,
  };
}

/**
 * The two prices spoken in the room, kept apart from the customer's budget and
 * apart from each other's currency.
 *
 * A competitor price is what the customer said a competitor charges. Nobody has
 * checked it, and presenting it beside our own quoted prices without saying so
 * would turn hearsay into a market rate — so the label travels with the number
 * everywhere it is shown.
 */
export type PriceLine = {
  currency: string | null;
  median: number | null;
  observed: number;
};

export type ContextPrices = {
  storeQuoted: PriceLine[];
  competitorClaim: PriceLine[];
  mixed: boolean;
};

function priceLines(rows: readonly PopulationRow[], fieldKey: string): PriceLine[] {
  const amounts = rows.flatMap((row) =>
    statedRows(row.values, fieldKey).flatMap((value) =>
      typeof value.amountMinor === "number"
        ? [{ minor: value.amountMinor, currency: value.currency ?? null }]
        : [],
    ),
  );
  const currencies = [...new Set(amounts.map((amount) => amount.currency))];
  return currencies
    .sort((a, b) => (a ?? "").localeCompare(b ?? ""))
    .map((currency) => {
      const inCurrency = amounts
        .filter((amount) => amount.currency === currency)
        .map((amount) => amount.minor);
      return { currency, median: median(inCurrency), observed: inCurrency.length };
    });
}

export function contextPrices(rows: readonly PopulationRow[]): ContextPrices {
  const storeQuoted = priceLines(rows, "store_price_quoted");
  const competitorClaim = priceLines(rows, "competitor_price_claim");
  return {
    storeQuoted,
    competitorClaim,
    mixed: storeQuoted.length > 1 || competitorClaim.length > 1,
  };
}
