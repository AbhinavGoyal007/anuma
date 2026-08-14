import "server-only";

import { createClient } from "@/lib/supabase/server";
import { budgetConstraint } from "@/modules/catalogue/budget-constraint";
import {
  findMissedOpportunity,
  type Requirement,
  type StockedItem,
} from "@/modules/catalogue/missed-opportunity";
import {
  bindPhrasesToValues,
  type CatalogueValue,
} from "@/modules/catalogue/semantic-binding";

/**
 * What this customer could have been shown, and what could not be checked.
 *
 * Replaces the requirement half of `assortment.ts`, which asked the catalogue
 * for products meeting a minimum memory, storage and graphics — three questions
 * that mean nothing to a car dealer, a mattress shop or an optician, and which
 * returned nothing at all for the Delaware feed while two cars the customer
 * wanted sat on the forecourt.
 *
 * Nothing here names an industry. A requirement is an attribute, a direction and
 * a value; the attributes come from the retailer's own file, the values from
 * their own vocabulary, and the binding between what was said and what they
 * stock is measured rather than assumed.
 *
 * The unbound requirements are carried out to the screen alongside the answer.
 * A count of what qualified is worth exactly as much as the share of the
 * customer's words it was able to check, and hiding that turns "we could not
 * tell" into "there was nothing".
 */

export type OpportunityRequirement = {
  /** What the customer said, in their words. */
  phrase: string;
  /** The attribute and value it was matched to, or null when it could not be. */
  matchedTo: string | null;
};

export type ConversationOpportunity = {
  /** Requirements the catalogue could express, and what they became. */
  checked: OpportunityRequirement[];
  /** Requirements nothing in the catalogue records. */
  uncheckable: string[];
  /** The ceiling applied, in minor units, when the customer stated one. */
  budgetMinor: number | null;
  qualifyingCount: number;
  shownCount: number;
  neverShown: { description: string; priceMinor: number | null; met: string[] }[];
  /** The record claimed unavailable while something checkable was in stock. */
  falselyUnavailable: boolean;
  /** True when nothing could be checked, so the counts mean nothing. */
  nothingChecked: boolean;
};

/** How many never-shown products are worth naming on a screen. */
const SHOW_AT_MOST = 8;

export async function getConversationOpportunity(
  organizationId: string,
  conversationId: string,
): Promise<ConversationOpportunity | null> {
  const supabase = await createClient();

  const { data: record } = await supabase
    .from("interaction_records")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("conversation_id", conversationId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!record) return null;

  const { data: fields } = await supabase
    .from("interaction_field_values")
    .select("field_key, value_text, value_amount_minor, abstention")
    .eq("interaction_record_id", record.id);
  if (!fields) return null;

  const stated = fields.filter((field) => field.abstention === null);
  const textFor = (key: string) =>
    stated
      .filter((field) => field.field_key === key)
      .map((field) => field.value_text ?? "")
      .filter((value) => value.length > 0);
  const moneyFor = (key: string) => {
    const row = stated.find((field) => field.field_key === key && field.value_amount_minor);
    return row?.value_amount_minor ? Number(row.value_amount_minor) : null;
  };

  const { data: vocabularyRows } = await supabase
    .from("catalogue_item_attributes")
    .select("attribute_key, value_text")
    .eq("organization_id", organizationId)
    .not("value_text", "is", null);
  if (!vocabularyRows || vocabularyRows.length === 0) return null;

  // Distinct values only. A catalogue of two hundred thousand rows still has a
  // vocabulary of a few hundred, and the binding cost follows the vocabulary.
  const seen = new Set<string>();
  const catalogueValues: CatalogueValue[] = [];
  const byAttribute = new Map<string, string[]>();
  for (const row of vocabularyRows) {
    if (!row.value_text) continue;
    const key = `${row.attribute_key}|${row.value_text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    catalogueValues.push({
      attributeKey: row.attribute_key,
      value: row.value_text,
      comparison: "equals",
    });
    const list = byAttribute.get(row.attribute_key) ?? [];
    list.push(row.value_text);
    byAttribute.set(row.attribute_key, list);
  }

  const phrases = [
    ...textFor("purchase_category"),
    ...textFor("specification_requirements"),
    ...textFor("additional_requirements"),
    ...textFor("other_constraints"),
  ];

  const bindings = await bindPhrasesToValues(phrases, catalogueValues);
  const budget = budgetConstraint({
    targetMinor: moneyFor("target_budget"),
    maximumMinor: moneyFor("maximum_budget"),
  });

  const requirements: Requirement[] = [
    ...bindings.flatMap((binding) => (binding.bound ? [binding.requirement] : [])),
    ...(budget ? [budget] : []),
  ];

  const { data: items } = await supabase
    .from("catalogue_items")
    .select("item_id, description, price_minor")
    .eq("organization_id", organizationId)
    .is("valid_to", null)
    .limit(2000);
  if (!items) return null;

  const attributesByItem = new Map<
    string,
    { key: string; valueText: string | null; valueNumeric: number | null }[]
  >();
  const { data: attributeRows } = await supabase
    .from("catalogue_item_attributes")
    .select("item_id, attribute_key, value_text, value_numeric")
    .eq("organization_id", organizationId)
    .limit(20000);
  for (const row of attributeRows ?? []) {
    const list = attributesByItem.get(row.item_id) ?? [];
    list.push({
      key: row.attribute_key,
      valueText: row.value_text,
      valueNumeric: row.value_numeric === null ? null : Number(row.value_numeric),
    });
    attributesByItem.set(row.item_id, list);
  }

  const { data: stockRows } = await supabase
    .from("inventory")
    .select("item_id, stock")
    .eq("organization_id", organizationId)
    .limit(20000);
  const stockByItem = new Map((stockRows ?? []).map((row) => [row.item_id, row.stock]));

  const stocked: StockedItem[] = items.map((item) => ({
    itemId: item.item_id,
    description: item.description ?? item.item_id,
    nodeKey: "",
    // No stock file is not the same as no stock. A retailer who sends a
    // catalogue and nothing else still has a range, and calling all of it out
    // of stock would be the louder mistake.
    stock: stockByItem.get(item.item_id) ?? 1,
    attributes: [
      ...(attributesByItem.get(item.item_id) ?? []),
      ...(item.price_minor
        ? [{ key: "price_minor", valueText: null, valueNumeric: Number(item.price_minor) }]
        : []),
    ],
  }));

  const result = findMissedOpportunity({
    stocked,
    requirements,
    spokenNames: [...textFor("products_recommended"), ...textFor("products_considered")],
    claimedUnavailable: textFor("stock_status").some((value) => /unavailable/i.test(value)),
    vocabulary: byAttribute,
  });

  return {
    checked: bindings.map((binding) => ({
      phrase: binding.phrase,
      matchedTo: binding.bound
        ? `${binding.requirement.key.replace(/_/g, " ")}: ${binding.requirement.valueText}`
        : null,
    })),
    uncheckable: bindings.filter((binding) => !binding.bound).map((binding) => binding.phrase),
    budgetMinor: budget?.valueNumeric ?? null,
    qualifyingCount: result.qualifying.length,
    shownCount: result.shown.length,
    neverShown: result.neverShown.slice(0, SHOW_AT_MOST).map((assessment) => ({
      description: assessment.item.description,
      priceMinor:
        assessment.item.attributes.find((attribute) => attribute.key === "price_minor")
          ?.valueNumeric ?? null,
      met: assessment.met,
    })),
    falselyUnavailable: result.falselyUnavailable,
    nothingChecked: requirements.length === 0,
  };
}
