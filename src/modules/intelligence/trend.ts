import { DEFAULT_GUARDRAILS, type Guardrails } from "@/modules/intelligence/guardrails";
import type { PopulationRow } from "@/modules/intelligence/population";

/**
 * Movement over real time, when the data can actually carry it.
 *
 * A line is the most persuasive shape on any dashboard, which is exactly why it
 * is the easiest one to lie with. Four conversations in a week produce a rate
 * that is 0% or 100% and nothing in between, and joining those points draws a
 * dramatic slope out of noise. So every rule here exists to decide whether to
 * draw anything at all — and the honest answer is often no, in which case the
 * page falls back to stating where things stand.
 *
 * Binned on conversation time, never on when a record happened to be processed.
 * A week nobody walked in is a gap in the line, not a zero: zero customers
 * asking about finance and no customers at all are different facts.
 */

export type TrendGuardrails = {
  /** Interactions a bin needs before its rate is plotted at all. */
  minimumPerBin: number;
  /** Plotted bins needed before a line is worth drawing. */
  minimumBins: number;
  /** Percentage points a move must clear before it is called out. */
  materialPoints: number;
};

export const DEFAULT_TREND: TrendGuardrails = {
  minimumPerBin: 8,
  minimumBins: 4,
  materialPoints: 10,
};

/**
 * The signals a manager would accept as a tracked line.
 *
 * Each carries its own eligibility, so a bin's denominator is the interactions
 * that could have answered the question rather than everything that walked in.
 * Order is the tie-break when two signals move by the same amount, which keeps
 * the default selection stable between refreshes.
 */
export type TrendMetric = {
  key: string;
  label: string;
  /** Null for a count; otherwise the interactions that could contribute. */
  eligible: ((row: PopulationRow) => boolean) | null;
  matched: (row: PopulationRow) => boolean;
  format: "percent" | "count";
};

export const TREND_METRICS: readonly TrendMetric[] = [
  {
    key: "high_intent_arrival",
    label: "Arrived already decided",
    eligible: (row) => row.arrivalIntent !== null,
    matched: (row) =>
      row.arrivalIntent === "ready_to_buy" || row.arrivalIntent === "specific_product",
    format: "percent",
  },
  {
    key: "finance_demand",
    label: "Finance was raised",
    // Only interactions we can read either way. An unreadable one is not a no.
    eligible: (row) => row.financeRequested === "yes" || row.financeRequested === "no",
    matched: (row) => row.financeRequested === "yes",
    format: "percent",
  },
  {
    key: "competitor_pressure",
    label: "A competitor was named",
    eligible: () => true,
    matched: (row) => row.competitorCount > 0,
    format: "percent",
  },
  {
    key: "clarity_improved",
    label: "Requirements became clearer",
    eligible: (row) => row.clarityStart !== null && row.clarityEnd !== null,
    matched: (row) => row.clarityEnd! > row.clarityStart!,
    format: "percent",
  },
  {
    // The label has to describe the predicate exactly. This one previously read
    // "Left without an established outcome" while matching a much broader
    // unresolved predicate that included customers who had explicitly declined
    // — a line whose name was a claim the data did not make.
    key: "outcome_not_established",
    label: "Outcome not established",
    eligible: () => true,
    matched: (row) => row.outcome.business === "unknown",
    format: "percent",
  },
  {
    key: "analysed_volume",
    label: "Interactions analysed",
    eligible: null,
    matched: () => true,
    format: "count",
  },
];

export type TrendPoint = {
  /** Start of the bin, ISO date. */
  from: string;
  label: string;
  /** Null where the bin could not support the metric — a gap, never a zero. */
  value: number | null;
  matched: number;
  eligible: number;
  /** True where the bin held interactions but too few to plot a rate. */
  thin: boolean;
};

export type TrendSeries = {
  metric: TrendMetric;
  points: TrendPoint[];
  /** Bins carrying a plotted value. */
  plotted: number;
  /** The largest validated move between consecutive plotted bins. */
  movement: { fromLabel: string; toLabel: string; points: number } | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Monday of the week a timestamp falls in, as an ISO date. */
function weekStart(iso: string): string {
  const date = new Date(iso);
  const day = (date.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - day);
  return monday.toISOString().slice(0, 10);
}

function dayStart(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/**
 * Bins present in the window, including the empty ones.
 *
 * Generated from the window rather than from the data, so a week with no
 * conversations appears as a gap in the line instead of silently closing it and
 * making a quiet fortnight look continuous.
 */
function binsFor(days: number, now: Date): { from: string; label: string }[] {
  const weekly = days > 7;
  const step = weekly ? 7 : 1;
  const count = Math.ceil(days / step);
  const anchor = weekly ? weekStart(now.toISOString()) : dayStart(now.toISOString());
  const bins: { from: string; label: string }[] = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const start = new Date(new Date(`${anchor}T00:00:00Z`).getTime() - index * step * DAY_MS);
    const iso = start.toISOString().slice(0, 10);
    bins.push({
      from: iso,
      label: start.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }),
    });
  }
  return bins;
}

export function buildSeries(
  rows: readonly PopulationRow[],
  metric: TrendMetric,
  days: number,
  now: Date = new Date(),
  trend: TrendGuardrails = DEFAULT_TREND,
): TrendSeries {
  const weekly = days > 7;
  const grouped = new Map<string, PopulationRow[]>();
  for (const row of rows) {
    const key = weekly ? weekStart(row.startedAt) : dayStart(row.startedAt);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  const points: TrendPoint[] = binsFor(days, now).map((bin) => {
    const inBin = grouped.get(bin.from) ?? [];
    if (metric.format === "count") {
      return {
        ...bin,
        value: inBin.length === 0 ? null : inBin.length,
        matched: inBin.length,
        eligible: inBin.length,
        thin: false,
      };
    }
    const eligible = inBin.filter(metric.eligible!);
    const matched = eligible.filter(metric.matched);
    const plottable = eligible.length >= trend.minimumPerBin;
    return {
      ...bin,
      // Below the bar the bin is a gap, not a point. A rate from three
      // conversations is 0 or 100 and joining it to its neighbours draws a
      // slope out of nothing.
      value: plottable ? matched.length / eligible.length : null,
      matched: matched.length,
      eligible: eligible.length,
      thin: eligible.length > 0 && !plottable,
    };
  });

  const plotted = points.filter((point) => point.value !== null);
  let movement: TrendSeries["movement"] = null;
  if (metric.format === "percent") {
    for (let index = 1; index < plotted.length; index += 1) {
      const delta = (plotted[index]!.value! - plotted[index - 1]!.value!) * 100;
      if (Math.abs(delta) < trend.materialPoints) continue;
      if (movement && Math.abs(delta) <= Math.abs(movement.points)) continue;
      movement = {
        fromLabel: plotted[index - 1]!.label,
        toLabel: plotted[index]!.label,
        points: delta,
      };
    }
  }

  return { metric, points, plotted: plotted.length, movement };
}

/** Whether a series has enough plotted bins to be drawn at all. */
export function qualifies(series: TrendSeries, trend: TrendGuardrails = DEFAULT_TREND): boolean {
  return series.plotted >= trend.minimumBins;
}

/**
 * The signal the Overview leads with, chosen the same way every time.
 *
 * Rates first, because a movement in behaviour is what a manager can act on;
 * volume only if no rate survives its own guardrails, since a count is really a
 * statement about our coverage rather than about the floor. Within rates, the
 * one that actually moved wins, and registry order breaks ties so the same data
 * never produces a different default on refresh.
 */
export function selectPrincipalSeries(
  rows: readonly PopulationRow[],
  days: number,
  now: Date = new Date(),
  trend: TrendGuardrails = DEFAULT_TREND,
  guardrails: Guardrails = DEFAULT_GUARDRAILS,
): { series: TrendSeries; available: TrendMetric[] } | null {
  void guardrails;
  const built = TREND_METRICS.map((metric) => buildSeries(rows, metric, days, now, trend)).filter(
    (series) => qualifies(series, trend),
  );
  if (built.length === 0) return null;

  const rates = built.filter((series) => series.metric.format === "percent");
  const pool = rates.length > 0 ? rates : built;
  const principal = [...pool].sort(
    (a, b) => Math.abs(b.movement?.points ?? 0) - Math.abs(a.movement?.points ?? 0),
  )[0]!;

  return { series: principal, available: built.map((series) => series.metric) };
}
