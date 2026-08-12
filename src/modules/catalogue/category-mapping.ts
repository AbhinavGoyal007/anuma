import "server-only";

import OpenAI from "openai";

import { getOpenAIEnvironment } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { rankBySimilarity } from "@/modules/catalogue/similarity";

/**
 * Proposing what a retailer's category labels mean.
 *
 * A retailer files laptops under "Clamshell", "Gaming PC" and "Copilot+ PC".
 * None of those words is "laptop", so nothing lexical will ever connect them —
 * but their meanings are close, which is what an embedding measures. A few
 * hundred short labels is exactly the size and shape of problem embeddings are
 * good at, and getting one wrong costs a click to correct.
 *
 * This only ever *proposes*. The stored mapping is whatever a person confirmed,
 * and every rollup in the product groups by that confirmed mapping — so no
 * figure a category head reads is ever downstream of a similarity score.
 */

const EMBEDDING_MODEL = "text-embedding-3-small";
/** Requests are cheap but not free; a few hundred labels fit comfortably. */
const EMBED_BATCH = 256;

async function embed(texts: readonly string[]): Promise<number[][]> {
  const client = new OpenAI({ apiKey: getOpenAIEnvironment().OPENAI_API_KEY });
  const vectors: number[][] = [];
  for (let start = 0; start < texts.length; start += EMBED_BATCH) {
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: [...texts.slice(start, start + EMBED_BATCH)],
    });
    for (const item of response.data) vectors.push(item.embedding);
  }
  return vectors;
}

/** The label as the model sees it: the path, because the parent disambiguates. */
export function labelPath(groupName: string, subgroupName: string): string {
  return [groupName, subgroupName].filter((part) => part.trim().length > 0).join(" > ");
}

export type ProposalResult = {
  labelsSeen: number;
  proposed: number;
  alreadyMapped: number;
};

export async function proposeCategoryMappings(
  organizationId: string,
): Promise<ProposalResult> {
  const db = createAdminClient();

  const { data: labels, error: labelError } = await db.rpc("catalogue_label_summary", {
    p_organization_id: organizationId,
  });
  if (labelError) throw new Error(`Catalogue labels could not be read: ${labelError.message}`);
  const allLabels = labels ?? [];

  const { data: existing } = await db
    .from("category_mappings")
    .select("group_name, subgroup_name")
    .eq("organization_id", organizationId);
  const mapped = new Set(
    (existing ?? []).map((row) => labelPath(row.group_name, row.subgroup_name)),
  );

  const pending = allLabels.filter(
    (row) => !mapped.has(labelPath(row.group_name, row.subgroup_name)),
  );
  if (pending.length === 0) {
    return { labelsSeen: allLabels.length, proposed: 0, alreadyMapped: mapped.size };
  }

  const { data: categories } = await db
    .from("anuma_categories")
    .select("key, label, description")
    .eq("active", true);
  const ontology = categories ?? [];
  if (ontology.length === 0) throw new Error("The category ontology is empty.");

  // The ontology is embedded on every run rather than cached: it is a few dozen
  // short strings, and a stale cache would silently propose against a category
  // set that no longer exists.
  const [ontologyVectors, labelVectors] = await Promise.all([
    embed(ontology.map((category) => `${category.label}: ${category.description}`)),
    embed(pending.map((row) => labelPath(row.group_name, row.subgroup_name))),
  ]);

  const options = ontology.map((category, index) => ({
    item: category.key,
    vector: ontologyVectors[index]!,
  }));

  const rows = pending.map((row, index) => {
    const best = rankBySimilarity(labelVectors[index]!, options, 1)[0];
    return {
      organization_id: organizationId,
      group_name: row.group_name,
      subgroup_name: row.subgroup_name,
      status: "proposed" as const,
      proposed_key: best?.item ?? null,
      proposed_score: best ? Number(best.score.toFixed(3)) : null,
      anuma_category_key: best?.item ?? null,
      item_count: Number(row.item_count),
    };
  });

  const { error: insertError } = await db
    .from("category_mappings")
    .upsert(rows, { onConflict: "organization_id,group_name,subgroup_name", ignoreDuplicates: true });
  if (insertError) throw new Error(`Proposals could not be saved: ${insertError.message}`);

  return { labelsSeen: allLabels.length, proposed: rows.length, alreadyMapped: mapped.size };
}
