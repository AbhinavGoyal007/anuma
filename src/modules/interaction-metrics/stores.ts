import "server-only";

import { createClient } from "@/lib/supabase/server";
import { DEFAULT_WINDOW_DAYS } from "@/modules/interaction-metrics/aggregate";
import { currentRecordIdsSince } from "@/modules/interaction-metrics/current-records";
import {
  SUMMARY_COLUMNS,
  summarizeMetricRows,
  type MetricRowSlice,
  type MetricSummary,
} from "@/modules/interaction-metrics/summarize";

/**
 * Store against store.
 *
 * A chain does not act on an average — it acts on the outlier. This puts every
 * store the viewer may see on one row against the organisation's own figure, so
 * a regional manager can see which floor is losing demand before the sales
 * numbers say so.
 *
 * The organisation row is computed from the same rows, not from an average of
 * the store rates: averaging rates would weight a store with four interactions
 * the same as one with four hundred.
 */

export type StoreRow = {
  locationId: string | null;
  summary: MetricSummary;
};

export type StoreComparison = {
  stores: StoreRow[];
  organization: MetricSummary;
  /** Stores with fewer interactions than this are shown but not ranked. */
  minRankable: number;
};

/** Below this an interaction count cannot support a rate worth comparing. */
export const MIN_RANKABLE_INTERACTIONS = 5;

export async function getStoreComparison(
  organizationId: string,
  filters: { windowDays?: number } = {},
): Promise<StoreComparison> {
  // The window is decided here rather than by the caller: a page should not have
  // to know how far back a comparison reaches to ask for one.
  const windowDays = filters.windowDays ?? DEFAULT_WINDOW_DAYS;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  const recordIds = await currentRecordIdsSince(organizationId, since);
  if (recordIds.length === 0) {
    return {
      stores: [],
      organization: summarizeMetricRows([]),
      minRankable: MIN_RANKABLE_INTERACTIONS,
    };
  }

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("interaction_metrics")
    .select(`location_id, ${SUMMARY_COLUMNS}`)
    .eq("organization_id", organizationId)
    .in("interaction_record_id", recordIds)
    .gte("started_at", since);

  const byStore = new Map<string, MetricRowSlice[]>();
  const all: MetricRowSlice[] = [];
  for (const row of rows ?? []) {
    all.push(row);
    // Interactions recorded before the rep had a store still belong somewhere,
    // so they collect under one unassigned group rather than disappearing.
    const key = row.location_id ?? "__unassigned__";
    const bucket = byStore.get(key);
    if (bucket) bucket.push(row);
    else byStore.set(key, [row]);
  }

  const stores: StoreRow[] = [...byStore.entries()]
    .map(([key, storeRows]) => ({
      locationId: key === "__unassigned__" ? null : key,
      summary: summarizeMetricRows(storeRows),
    }))
    .sort((a, b) => b.summary.interactions - a.summary.interactions);

  return {
    stores,
    organization: summarizeMetricRows(all),
    minRankable: MIN_RANKABLE_INTERACTIONS,
  };
}
