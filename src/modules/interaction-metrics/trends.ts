import "server-only";

import { createClient } from "@/lib/supabase/server";
import { clusterObjection } from "@/modules/interaction-metrics/clustering";
import { currentRecordIdsSince } from "@/modules/interaction-metrics/current-records";
import {
  SUMMARY_COLUMNS,
  summarizeMetricRows,
  type MetricRowSlice,
} from "@/modules/interaction-metrics/summarize";
import {
  computeFrictionMovers,
  computeTrendMetrics,
  MIN_COMPARABLE_INTERACTIONS,
  type TrendMetric,
  type TrendMover,
} from "@/modules/interaction-metrics/trend-math";

/**
 * Reads a period and the period before it, so the dashboard can say whether a
 * number is improving. The arithmetic lives in `trend-math.ts`; this only
 * fetches the two windows and decides whether the comparison may be published.
 */

export type DemandTrend = {
  periodDays: number;
  /** False when the earlier period is too thin to compare against. */
  comparable: boolean;
  minComparable: number;
  currentInteractions: number;
  previousInteractions: number;
  metrics: TrendMetric[];
  risingFriction: TrendMover[];
  easingFriction: TrendMover[];
  currency: string | null;
};

/** Conversations per objection cluster, for a set of records. */
async function frictionByConversation(
  organizationId: string,
  recordIds: readonly string[],
): Promise<Map<string, number>> {
  if (recordIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase
    .from("interaction_field_values")
    .select("conversation_id, value_text")
    .eq("organization_id", organizationId)
    .eq("field_key", "objections")
    .in("interaction_record_id", [...recordIds])
    .is("abstention", null);

  const byConversation = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    const cluster = clusterObjection(row.value_text);
    const set = byConversation.get(row.conversation_id) ?? new Set<string>();
    set.add(cluster);
    byConversation.set(row.conversation_id, set);
  }
  const counts = new Map<string, number>();
  for (const set of byConversation.values()) {
    for (const cluster of set) counts.set(cluster, (counts.get(cluster) ?? 0) + 1);
  }
  return counts;
}

export type TrendFilters = { locationId?: string; periodDays?: number };

export async function getDemandTrend(
  organizationId: string,
  filters: TrendFilters = {},
): Promise<DemandTrend> {
  const periodDays = filters.periodDays ?? 30;
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const currentStart = new Date(now - periodDays * day).toISOString();
  const previousStart = new Date(now - 2 * periodDays * day).toISOString();

  // One record scan across both periods, then split in code: the current record
  // for a conversation is chosen once, so a conversation cannot land in both.
  const recordIds = await currentRecordIdsSince(organizationId, previousStart);
  if (recordIds.length === 0) return emptyTrend(periodDays);

  const supabase = await createClient();
  let query = supabase
    .from("interaction_metrics")
    .select(`interaction_record_id, started_at, ${SUMMARY_COLUMNS}`)
    .eq("organization_id", organizationId)
    .in("interaction_record_id", recordIds)
    .gte("started_at", previousStart);
  if (filters.locationId) query = query.eq("location_id", filters.locationId);
  const { data: rows } = await query;

  const currentRows: (MetricRowSlice & { interaction_record_id: string })[] = [];
  const previousRows: (MetricRowSlice & { interaction_record_id: string })[] = [];
  for (const row of rows ?? []) {
    if (row.started_at >= currentStart) currentRows.push(row);
    else previousRows.push(row);
  }

  const current = summarizeMetricRows(currentRows);
  const previous = summarizeMetricRows(previousRows);
  const comparable = previous.interactions >= MIN_COMPARABLE_INTERACTIONS;

  // Friction movers cost two more queries, so they are only fetched when the
  // comparison will actually be shown.
  let rising: TrendMover[] = [];
  let easing: TrendMover[] = [];
  if (comparable) {
    const [currentFriction, previousFriction] = await Promise.all([
      frictionByConversation(
        organizationId,
        currentRows.map((r) => r.interaction_record_id),
      ),
      frictionByConversation(
        organizationId,
        previousRows.map((r) => r.interaction_record_id),
      ),
    ]);
    const movers = computeFrictionMovers(currentFriction, previousFriction);
    rising = movers.rising;
    easing = movers.easing;
  }

  return {
    periodDays,
    comparable,
    minComparable: MIN_COMPARABLE_INTERACTIONS,
    currentInteractions: current.interactions,
    previousInteractions: previous.interactions,
    metrics: computeTrendMetrics(current, previous),
    risingFriction: rising,
    easingFriction: easing,
    currency: current.budgetCurrency ?? previous.budgetCurrency,
  };
}

function emptyTrend(periodDays: number): DemandTrend {
  const empty = summarizeMetricRows([]);
  return {
    periodDays,
    comparable: false,
    minComparable: MIN_COMPARABLE_INTERACTIONS,
    currentInteractions: 0,
    previousInteractions: 0,
    metrics: computeTrendMetrics(empty, empty),
    risingFriction: [],
    easingFriction: [],
    currency: null,
  };
}
