import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isResolvable, parseProductMention } from "@/modules/catalogue/product-mention";
import {
  matchConfidence,
  matchMention,
  rankMatches,
  type CandidateItem,
  type MatchConfidence,
  type SkuMatch,
} from "@/modules/catalogue/sku-match";

/**
 * Did we have what this customer wanted?
 *
 * Two questions, asked of one conversation. Which products were actually
 * discussed — the mentions resolved to real rows in the range — and, separately,
 * whether the range held anything meeting what the customer said they needed.
 *
 * Both are asked against the catalogue as it stood on the day of the
 * conversation. Judging an August conversation against today's range would be
 * flattering and wrong: stocking something later does not undo the gap.
 *
 * Nothing here decides anything. The narrowing happens in the database, the
 * deciding happens in `sku-match`, and this only carries values between them —
 * which is why a wrong variant can be caught by a test rather than found by a
 * customer.
 */

export type ResolvedMention = {
  /** What the interaction record said, verbatim. */
  spoken: string;
  /** Which field it came from, so a reader knows if it was offered or rejected. */
  fieldKey: string;
  confidence: MatchConfidence;
  matches: SkuMatch[];
  /** True when the mention carried nothing that could be looked up. */
  tooVague: boolean;
};

export type RequirementAnswer = {
  categoryKey: string;
  categoryLabel: string;
  /** The stated minimums that were applied. Nulls were never stated. */
  wanted: { ramGb: number | null; storageGb: number | null; gpuGb: number | null };
  /** How many current products met every stated minimum. */
  matchingCount: number;
  /** A few of them, best specified first. */
  examples: CandidateItem[];
};

export type ConversationAssortment = {
  /** The date the range was actually judged against. */
  asOf: string;
  mentions: ResolvedMention[];
  requirement: RequirementAnswer | null;
  /** True when no catalogue has been loaded, which is not the same as no match. */
  catalogueEmpty: boolean;
  /**
   * Set when the conversation happened before any catalogue was loaded.
   *
   * The versioned catalogue can only answer "what did the range hold on this
   * day" for days it has a record of, and its record starts at the first
   * import. For a conversation before that, the honest answer is not "we had
   * nothing" — it is "we do not know what we had", and the earliest snapshot we
   * do hold is the closest available stand-in. Saying which was used is the
   * difference between a caveat and a false negative.
   */
  historyBeganAt: string | null;
};

type CandidateRow = {
  id: string;
  item_id: string;
  description: string;
  brand_name: string | null;
  group_name: string | null;
  subgroup_name: string | null;
  spec_ram_gb: number | null;
  spec_storage_gb: number | null;
  spec_gpu_gb: number | null;
  spec_screen_in: number | string | null;
  spec_issues: string[] | null;
};

function toCandidate(row: CandidateRow): CandidateItem {
  return {
    id: row.id,
    itemId: row.item_id,
    description: row.description,
    brandName: row.brand_name,
    groupName: row.group_name,
    subgroupName: row.subgroup_name,
    ramGb: row.spec_ram_gb,
    storageGb: row.spec_storage_gb,
    gpuGb: row.spec_gpu_gb,
    screenIn: row.spec_screen_in === null ? null : Number(row.spec_screen_in),
    specIssues: row.spec_issues ?? [],
  };
}

/** The fields that name a product rather than describe one. */
const PRODUCT_FIELDS = [
  "products_considered",
  "products_recommended",
  "competitor_product",
] as const;

/** The fields a stated requirement can arrive in. */
const REQUIREMENT_FIELDS = ["specification_requirements", "additional_requirements"] as const;

export async function getConversationAssortment(
  organizationId: string,
  conversationId: string,
): Promise<ConversationAssortment> {
  const supabase = await createClient();

  const [{ data: conversation }, { count: catalogueCount }, { data: firstImport }] =
    await Promise.all([
      supabase
        .from("conversations")
        .select("id, created_at")
        .eq("organization_id", organizationId)
        .eq("id", conversationId)
        .maybeSingle(),
      supabase
        .from("catalogue_items")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .is("valid_to", null),
      // Where the catalogue's memory starts. Cheap: imports are a handful of rows.
      supabase
        .from("catalogue_imports")
        .select("created_at")
        .eq("organization_id", organizationId)
        .eq("status", "completed")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

  const spokenAt = conversation?.created_at ?? new Date().toISOString();
  const horizon = firstImport?.created_at ?? null;
  // Before the horizon the range is unknown rather than empty, so the earliest
  // snapshot we hold stands in — and the caller is told that it did.
  const beforeHistory = horizon !== null && spokenAt < horizon;
  // A second past the import, not the import's own instant. Every row is stamped
  // with that timestamp to the microsecond, and asking for the range "as at"
  // exactly it is a boundary any millisecond-precision round trip loses — which
  // reads as an empty catalogue rather than a full one.
  const asOf = beforeHistory
    ? new Date(new Date(horizon!).getTime() + 1000).toISOString()
    : spokenAt;

  const empty = {
    asOf,
    mentions: [],
    requirement: null,
    catalogueEmpty: (catalogueCount ?? 0) === 0,
    historyBeganAt: beforeHistory ? horizon : null,
  };
  if (!conversation || empty.catalogueEmpty) return empty;

  // The current record only. A re-extracted conversation leaves earlier records
  // behind, and resolving those too would show the same product twice.
  const { data: record } = await supabase
    .from("interaction_records")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("conversation_id", conversationId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!record) return empty;

  const { data: values } = await supabase
    .from("interaction_field_values")
    .select("field_key, value_text")
    .eq("organization_id", organizationId)
    .eq("interaction_record_id", record.id)
    .is("abstention", null);
  const fieldValues = values ?? [];

  const spoken = fieldValues.filter(
    (value) =>
      PRODUCT_FIELDS.includes(value.field_key as (typeof PRODUCT_FIELDS)[number]) &&
      value.value_text !== null &&
      value.value_text.trim().length > 0,
  );

  const mentions = await Promise.all(
    spoken.map(async (value): Promise<ResolvedMention> => {
      const mention = parseProductMention(value.value_text!);
      if (!isResolvable(mention)) {
        return {
          spoken: value.value_text!,
          fieldKey: value.field_key,
          confidence: "none",
          matches: [],
          tooVague: true,
        };
      }

      const { data: rows } = await supabase.rpc("catalogue_candidates", {
        p_organization_id: organizationId,
        p_as_of: asOf,
        // The generated signature types an optional argument as undefined, but
        // the function treats a missing brand as "any brand" either way.
        p_brand: mention.brand ?? undefined,
        p_tokens: mention.modelTokens,
        p_limit: 40,
      });

      const ranked = rankMatches(
        (rows ?? []).map((row) => matchMention(mention, toCandidate(row as CandidateRow))),
      );
      return {
        spoken: value.value_text!,
        fieldKey: value.field_key,
        confidence: matchConfidence(ranked),
        // Only viable rows are worth showing; a contradicted row is not an
        // alternative, it is a different product.
        matches: ranked.filter((match) => match.conflicts === 0).slice(0, 5),
        tooVague: false,
      };
    }),
  );

  const requirement = await resolveRequirement(supabase, organizationId, asOf, fieldValues);

  return {
    asOf,
    mentions,
    requirement,
    catalogueEmpty: false,
    historyBeganAt: beforeHistory ? horizon : null,
  };
}

/**
 * What the customer said they needed, and whether the range held it.
 *
 * Only minimums stated in numbers are applied. "Good for gaming" is a real
 * requirement but not a filter, and inventing a threshold for it would produce a
 * confident count with nothing behind it.
 */
async function resolveRequirement(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  asOf: string,
  fieldValues: { field_key: string; value_text: string | null }[],
): Promise<RequirementAnswer | null> {
  const phrase = fieldValues.find((value) => value.field_key === "purchase_category")?.value_text;
  if (!phrase) return null;

  const { data: mapping } = await supabase
    .from("spoken_category_mappings")
    .select("anuma_category_key")
    .eq("organization_id", organizationId)
    .eq("phrase", phrase.trim().toLowerCase())
    .eq("status", "confirmed")
    .maybeSingle();
  const categoryKey = mapping?.anuma_category_key;
  if (!categoryKey) return null;

  const { data: category } = await supabase
    .from("anuma_categories")
    .select("label")
    .eq("key", categoryKey)
    .maybeSingle();

  const requirementText = fieldValues
    .filter((value) =>
      REQUIREMENT_FIELDS.includes(value.field_key as (typeof REQUIREMENT_FIELDS)[number]),
    )
    .map((value) => value.value_text ?? "")
    .join(" ");
  const wantedMention = parseProductMention(requirementText);

  const { data: rows } = await supabase.rpc("catalogue_requirement_matches", {
    p_organization_id: organizationId,
    p_as_of: asOf,
    p_category_key: categoryKey,
    // A requirement the customer never stated is not a filter, and the function
    // reads a missing argument as exactly that.
    p_min_ram_gb: wantedMention.ramGb ?? undefined,
    p_min_storage_gb: wantedMention.storageGb ?? undefined,
    p_min_gpu_gb: wantedMention.gpuGbCandidates[0],
    p_limit: 6,
  });

  const matches = rows ?? [];
  return {
    categoryKey,
    categoryLabel: category?.label ?? categoryKey,
    wanted: {
      ramGb: wantedMention.ramGb,
      storageGb: wantedMention.storageGb,
      gpuGb: wantedMention.gpuGbCandidates[0] ?? null,
    },
    matchingCount: matches.length > 0 ? Number(matches[0]!.total_matching) : 0,
    examples: matches.map((row) => toCandidate(row as CandidateRow)),
  };
}
