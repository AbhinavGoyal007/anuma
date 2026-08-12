import "server-only";

import { createClient } from "@/lib/supabase/server";
import { CLEAR_MARGIN } from "@/modules/catalogue/confidence";

/**
 * Everything the category mapping screen reads.
 *
 * Counted with head requests and read a page at a time rather than fetched
 * whole: a retailer's taxonomy runs to hundreds of labels, and PostgREST caps
 * every query at a thousand rows, so "select them all and count the array" is a
 * figure that silently stops being true as a catalogue grows.
 *
 * Read through the cookie client so row level security scopes the result to the
 * viewer's organization; the screen's own admin check governs what they may
 * change, not what they may see.
 */

/** Rows shown per queue. Enough to work through; not enough to stall the page. */
export const MAPPING_PAGE_SIZE = 60;

export type MappingStatus = "proposed" | "confirmed" | "not_relevant";

export type CategoryOption = { key: string; label: string; description: string };

export type LabelMapping = {
  id: string;
  groupName: string;
  subgroupName: string;
  itemCount: number;
  status: MappingStatus;
  anumaCategoryKey: string | null;
  proposedKey: string | null;
  proposedScore: number | null;
  proposedMargin: number | null;
};

export type PhraseMapping = {
  id: string;
  phrase: string;
  occurrenceCount: number;
  status: MappingStatus;
  anumaCategoryKey: string | null;
  proposedKey: string | null;
  proposedScore: number | null;
  proposedMargin: number | null;
};

export type MappingQueue<T> = {
  /** Waiting on a person, biggest first — that is where the value is. */
  pending: T[];
  /** Already decided, most significant first. */
  settled: T[];
  pendingTotal: number;
  settledTotal: number;
  /** Waiting rows the model separated clearly enough to confirm in one action. */
  clearTotal: number;
};

export type CategoryMappingWorkspace = {
  categories: CategoryOption[];
  labels: MappingQueue<LabelMapping>;
  phrases: MappingQueue<PhraseMapping>;
  /** Current catalogue items, which is what the empty state turns on. */
  catalogueItems: number;
};

export async function getCategoryMappingWorkspace(
  organizationId: string,
): Promise<CategoryMappingWorkspace> {
  const supabase = await createClient();

  const labelQuery = () =>
    supabase
      .from("category_mappings")
      .select(
        "id, group_name, subgroup_name, item_count, status, anuma_category_key, proposed_key, proposed_score, proposed_margin",
        { count: "exact" },
      )
      .eq("organization_id", organizationId)
      .order("item_count", { ascending: false })
      .limit(MAPPING_PAGE_SIZE);

  const phraseQuery = () =>
    supabase
      .from("spoken_category_mappings")
      .select(
        "id, phrase, occurrence_count, status, anuma_category_key, proposed_key, proposed_score, proposed_margin",
        { count: "exact" },
      )
      .eq("organization_id", organizationId)
      .order("occurrence_count", { ascending: false })
      .limit(MAPPING_PAGE_SIZE);

  /** How many waiting rows a single bulk confirmation would settle. */
  const clearCount = (table: "category_mappings" | "spoken_category_mappings") =>
    supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "proposed")
      .not("proposed_key", "is", null)
      .gte("proposed_margin", CLEAR_MARGIN);

  const [
    categories,
    pendingLabels,
    settledLabels,
    pendingPhrases,
    settledPhrases,
    items,
    clearLabels,
    clearPhrases,
  ] = await Promise.all([
    supabase
      .from("anuma_categories")
      .select("key, label, description")
      .eq("active", true)
      .order("sort_order"),
    labelQuery().eq("status", "proposed"),
    labelQuery().neq("status", "proposed"),
    phraseQuery().eq("status", "proposed"),
    phraseQuery().neq("status", "proposed"),
    supabase
      .from("catalogue_items")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("valid_to", null),
    clearCount("category_mappings"),
    clearCount("spoken_category_mappings"),
  ]);

  const toLabel = (row: {
    id: string;
    group_name: string;
    subgroup_name: string;
    item_count: number;
    status: string;
    anuma_category_key: string | null;
    proposed_key: string | null;
    proposed_score: number | string | null;
    proposed_margin: number | string | null;
  }): LabelMapping => ({
    id: row.id,
    groupName: row.group_name,
    subgroupName: row.subgroup_name,
    itemCount: row.item_count,
    status: row.status as MappingStatus,
    anumaCategoryKey: row.anuma_category_key,
    proposedKey: row.proposed_key,
    proposedScore: row.proposed_score === null ? null : Number(row.proposed_score),
    proposedMargin: row.proposed_margin === null ? null : Number(row.proposed_margin),
  });

  const toPhrase = (row: {
    id: string;
    phrase: string;
    occurrence_count: number;
    status: string;
    anuma_category_key: string | null;
    proposed_key: string | null;
    proposed_score: number | string | null;
    proposed_margin: number | string | null;
  }): PhraseMapping => ({
    id: row.id,
    phrase: row.phrase,
    occurrenceCount: row.occurrence_count,
    status: row.status as MappingStatus,
    anumaCategoryKey: row.anuma_category_key,
    proposedKey: row.proposed_key,
    proposedScore: row.proposed_score === null ? null : Number(row.proposed_score),
    proposedMargin: row.proposed_margin === null ? null : Number(row.proposed_margin),
  });

  return {
    categories: (categories.data ?? []).map((row) => ({
      key: row.key,
      label: row.label,
      description: row.description,
    })),
    labels: {
      pending: (pendingLabels.data ?? []).map(toLabel),
      settled: (settledLabels.data ?? []).map(toLabel),
      pendingTotal: pendingLabels.count ?? 0,
      settledTotal: settledLabels.count ?? 0,
      clearTotal: clearLabels.count ?? 0,
    },
    phrases: {
      pending: (pendingPhrases.data ?? []).map(toPhrase),
      settled: (settledPhrases.data ?? []).map(toPhrase),
      pendingTotal: pendingPhrases.count ?? 0,
      settledTotal: settledPhrases.count ?? 0,
      clearTotal: clearPhrases.count ?? 0,
    },
    catalogueItems: items.count ?? 0,
  };
}
