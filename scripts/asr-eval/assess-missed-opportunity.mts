/**
 * Running the missed-opportunity assessment over one real conversation.
 *
 * Nothing here is scenario-specific. It reads the interaction record the product
 * produced, the attributes discovered for this retailer, and what was in stock,
 * then asks `requirement-binding` which of the customer's stated requirements
 * the catalogue can even express. Only bound requirements are used to narrow the
 * stock; unbound ones are printed, because the honest answer to "did we have
 * what he wanted" depends entirely on how much of what he wanted was checkable.
 *
 * An earlier version of this script hardcoded the binding — it matched the word
 * "touring" and asserted `type = tourer`. That made the scenario resolve and
 * proved nothing, since the mapping from what a customer says to what a
 * catalogue records is the hard part and it had been supplied by hand.
 *
 * Usage:
 *   node --env-file=.env.local --experimental-strip-types --conditions=react-server \
 *     --import ./scripts/register-alias.mjs \
 *     scripts/asr-eval/assess-missed-opportunity.mts --org "Highway Motors" \
 *     --node "Motorcycles > Twin > 650cc Twin"
 */

import { parseArgs } from "node:util";

import postgres from "postgres";

import {
  findMissedOpportunity,
  type StockedItem,
} from "@/modules/catalogue/missed-opportunity";
import {
  bindRequirements,
  type BindableAttribute,
} from "@/modules/catalogue/requirement-binding";

const { values } = parseArgs({
  options: {
    org: { type: "string", default: "Highway Motors" },
    node: { type: "string", default: "Motorcycles > Twin > 650cc Twin" },
  },
});

const sql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false, max: 1 });

try {
  const [organization] = await sql<{ id: string }[]>`
    select id from organizations where name = ${values.org!} order by created_at limit 1
  `;
  if (!organization) throw new Error(`No organization named ${values.org}.`);

  const [record] = await sql<{ id: string }[]>`
    select id from interaction_records
    where organization_id = ${organization.id} and status = 'completed'
    order by created_at desc limit 1
  `;
  if (!record) throw new Error("No completed interaction record.");

  const fields = await sql<{ field_key: string; value_text: string | null }[]>`
    select field_key, value_text from interaction_field_values
    where interaction_record_id = ${record.id} and abstention is null
  `;
  const valuesFor = (key: string) =>
    fields
      .filter((field) => field.field_key === key)
      .map((field) => field.value_text ?? "")
      .filter((value) => value.length > 0);

  const attributeRows = await sql<
    {
      attribute_key: string;
      kind: "numeric" | "categorical";
      comparison: "at_least" | "at_most" | "equals";
      unit: string | null;
      vocabulary: Record<string, string[]>;
    }[]
  >`
    select attribute_key, kind, comparison, unit, vocabulary
    from public.category_attributes
    where organization_id = ${organization.id}
      and node_key = ${values.node!} and status = 'active'
  `;
  const attributes: BindableAttribute[] = attributeRows.map((row) => ({
    key: row.attribute_key,
    kind: row.kind,
    comparison: row.comparison,
    unit: row.unit,
    vocabulary: row.vocabulary ?? {},
  }));

  const stockRows = await sql<
    {
      item_id: string;
      description: string;
      node_key: string;
      stock: number;
      attributes: { key: string; valueText: string | null; valueNumeric: number | null }[];
    }[]
  >`
    select
      item.item_id, item.description,
      concat_ws(' > ', item.dept_name, item.group_name, item.subgroup_name) as node_key,
      coalesce(stock.stock, 0) as stock,
      coalesce((
        select json_agg(json_build_object(
          'key', attribute.attribute_key,
          'valueText', attribute.value_text,
          'valueNumeric', attribute.value_numeric))
        from public.catalogue_item_attributes as attribute
        where attribute.organization_id = item.organization_id
          and attribute.item_id = item.item_id
      ), '[]'::json) as attributes
    from public.catalogue_items as item
    left join lateral (
      select inventory.stock from public.inventory
      where inventory.organization_id = item.organization_id
        and inventory.item_id = item.item_id
      order by inventory.as_of desc limit 1
    ) as stock on true
    where item.organization_id = ${organization.id} and item.valid_to is null
      and concat_ws(' > ', item.dept_name, item.group_name, item.subgroup_name) = ${values.node!}
  `;

  const stocked: StockedItem[] = stockRows.map((row) => ({
    itemId: row.item_id,
    description: row.description,
    nodeKey: row.node_key,
    stock: Number(row.stock),
    attributes: row.attributes ?? [],
  }));

  // Everything the customer said they needed, in their own words, from the
  // fields that hold requirements.
  const phrases = [
    ...valuesFor("specification_requirements"),
    ...valuesFor("additional_requirements"),
    ...valuesFor("other_constraints"),
    ...valuesFor("decision_drivers"),
  ];

  const bindings = bindRequirements(phrases, attributes);
  const bound = bindings.filter((binding) => binding.bound);
  const unbound = bindings.filter((binding) => !binding.bound);

  const result = findMissedOpportunity({
    stocked,
    requirements: bound.map((binding) => binding.requirement),
    spokenNames: [
      ...valuesFor("products_recommended"),
      ...valuesFor("products_considered"),
    ],
    claimedUnavailable: valuesFor("stock_status").some((value) => /unavailable/i.test(value)),
  });

  console.log(`node             ${values.node}`);
  console.log(`attributes here  ${attributes.map((a) => a.key).join(", ") || "none"}`);
  console.log(`on the floor     ${stocked.filter((item) => item.stock > 0).length} of ${stocked.length} rows in stock\n`);

  console.log(`Requirements the catalogue CAN express (${bound.length}):`);
  for (const binding of bound) {
    if (binding.bound) console.log(`   "${binding.phrase.slice(0, 58)}" -> ${binding.matchedOn}`);
  }
  if (bound.length === 0) console.log("   none");

  console.log(`\nRequirements it CANNOT express (${unbound.length}):`);
  for (const binding of unbound) console.log(`   "${binding.phrase.slice(0, 68)}"`);

  console.log(`\nqualifying and in stock   ${result.qualifying.length}`);
  console.log(`  of which shown          ${result.shown.length}`);
  console.log(`  never shown             ${result.neverShown.length}`);
  console.log(`falsely unavailable       ${result.falselyUnavailable}`);

  if (bound.length === 0) {
    console.log(
      "\nNothing was checked. Every row in stock trivially 'qualifies', so the\n" +
        "count above is the size of the shelf, not an answer to what he wanted.",
    );
  }
} finally {
  await sql.end();
}
