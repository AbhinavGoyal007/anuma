import { measure, type Measure } from "@/modules/intelligence/guardrails";
import { isUnresolved } from "@/modules/intelligence/outcome";
import type { PopulationRow, PopulationValue } from "@/modules/intelligence/population";

/**
 * What customers came in wanting, and where they got stuck.
 *
 * Customer-side only. What the representative did about any of it belongs to
 * Frontline — keeping the two apart is what lets a manager see that finance
 * demand rose without that fact immediately becoming an accusation about the
 * floor staff.
 *
 * Pure, so every denominator here is testable without a database.
 */

const present = (row: PopulationRow, fieldKey: string): PopulationValue[] =>
  row.values.filter((value) => value.fieldKey === fieldKey && !value.abstention);

const supported = (row: PopulationRow, fieldKey: string): boolean =>
  row.values.some((value) => value.fieldKey === fieldKey);

const HIGH_INTENT = new Set(["specific_product", "ready_to_buy"]);

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

export function rankedShare(
  rows: readonly PopulationRow[],
  fieldKeys: readonly string[],
  limit = 10,
): { entries: RankedShare[]; eligible: number } {
  const eligible = rows.filter((row) => fieldKeys.some((key) => supported(row, key))).length;
  const counts = new Map<string, { interactions: Set<string>; label: string | null }>();

  for (const row of rows) {
    for (const key of fieldKeys) {
      for (const value of present(row, key)) {
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

  const entries = [...counts.entries()]
    .map(([value, entry]) => ({
      value,
      interactions: entry.interactions.size,
      share: eligible > 0 ? entry.interactions.size / eligible : 0,
      label: entry.label,
    }))
    .sort((a, b) => b.interactions - a.interactions || a.value.localeCompare(b.value))
    .slice(0, limit);

  return { entries, eligible };
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

export type BudgetPicture = {
  /** Median of budgets customers actually stated, in minor units. */
  targetMedian: number | null;
  targetObserved: number;
  maximumMedian: number | null;
  maximumObserved: number;
  /** Median distance between the opening budget and the ceiling. */
  stretchMedian: number | null;
  stretchObserved: number;
  currency: string | null;
  /** Share of interactions that stated a budget at all. */
  observationRate: Measure;
};

export function budgetPicture(rows: readonly PopulationRow[]): BudgetPicture {
  const targets = rows.flatMap((row) =>
    row.targetBudgetMinor !== null ? [row.targetBudgetMinor] : [],
  );
  const maximums = rows.flatMap((row) => (row.maxBudgetMinor !== null ? [row.maxBudgetMinor] : []));
  // Both figures, and the ceiling must not sit below the opening budget — a
  // customer who said 80 and then 60 has been misread somewhere, and averaging
  // that in produces a negative stretch that means nothing.
  const stretches = rows.flatMap((row) =>
    row.targetBudgetMinor !== null &&
    row.maxBudgetMinor !== null &&
    row.maxBudgetMinor >= row.targetBudgetMinor
      ? [row.maxBudgetMinor - row.targetBudgetMinor]
      : [],
  );

  return {
    targetMedian: median(targets),
    targetObserved: targets.length,
    maximumMedian: median(maximums),
    maximumObserved: maximums.length,
    stretchMedian: median(stretches),
    stretchObserved: stretches.length,
    currency: rows.find((row) => row.budgetCurrency)?.budgetCurrency ?? null,
    observationRate: measure(targets.length, rows.length, rows.length),
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
  let improved = 0;
  let stalledLow = 0;

  for (const row of rows) {
    if (row.clarityStart === null || row.clarityEnd === null) continue;
    paired += 1;
    cells[row.clarityStart]![row.clarityEnd]! += 1;
    if (row.clarityEnd > row.clarityStart) improved += 1;
    if (row.clarityStart <= 1 && row.clarityEnd <= 1) stalledLow += 1;
  }

  const closeObserved = rows.filter((row) => row.clarityEnd !== null).length;
  return {
    cells,
    paired,
    improved: measure(improved, rows.length, paired),
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
  const base = rows.length;
  const intentClassified = rows.filter((row) => row.arrivalIntent !== null);

  // Purchase conditions only mean something where the visit did not close. A
  // customer who bought had no condition left to state.
  const unresolved = rows.filter((row) => isUnresolved(row.outcome));
  const conditionSupported = unresolved.filter((row) =>
    supported(row, "customer_purchase_conditions"),
  );

  const preferenceSupported = rows.filter((row) => supported(row, "final_preferred_product"));

  return {
    analysed: base,
    highIntent: measure(
      intentClassified.filter((row) => HIGH_INTENT.has(row.arrivalIntent!)).length,
      base,
      intentClassified.length,
    ),
    financeDemand: measure(rows.filter((row) => row.financeRequested).length, base, base),
    competitorPressure: measure(rows.filter((row) => row.competitorCount > 0).length, base, base),
    questionRate: measure(rows.filter((row) => row.customerQuestionCount > 0).length, base, base),
    purchaseConditions: measure(
      conditionSupported.filter((row) => present(row, "customer_purchase_conditions").length > 0)
        .length,
      unresolved.length,
      conditionSupported.length,
    ),
    outcomeClassified: measure(
      rows.filter((row) => row.outcome.business !== "unknown").length,
      base,
      base,
    ),
    preferenceFormed: measure(
      preferenceSupported.filter((row) => present(row, "final_preferred_product").length > 0)
        .length,
      base,
      preferenceSupported.length,
    ),
  };
}

/**
 * The primary observed reason among interactions confirmed as no sale.
 *
 * Drawn strictly from confirmed no-sales. The earlier version used "unresolved",
 * which swept in every interaction whose outcome was never established — a
 * population we know nothing about — while excluding a customer who explicitly
 * declined. A chart titled "why we did not convert" cannot be built from
 * conversations where we do not know whether we converted.
 *
 * This is what was observed and classified, never a proven cause.
 */
export type NoSaleReasons = {
  entries: RankedShare[];
  /** Confirmed no-sales carrying an observed reason. */
  classified: number;
  /** All confirmed no-sales, whether a reason was recorded or not. */
  confirmedNoSales: number;
  /** Share of confirmed no-sales where a reason was actually observed. */
  coverage: number | null;
};

export function nonConversionReasons(rows: readonly PopulationRow[]): NoSaleReasons {
  const confirmed = rows.filter((row) => row.outcome.business === "no_sale");
  const { entries, classified } = distribution(
    confirmed,
    (row) => present(row, "primary_non_conversion_reason")[0]?.valueText ?? null,
  );
  return {
    entries,
    classified,
    confirmedNoSales: confirmed.length,
    coverage: confirmed.length > 0 ? classified / confirmed.length : null,
  };
}
