/**
 * What the customer could have been shown, over the whole catalogue.
 *
 * Reads the record the product produced, binds each stated requirement to a
 * value the retailer's catalogue actually holds, adds the budget as a price
 * ceiling, and asks what was in stock that met all of it.
 *
 * Two things it deliberately does not do. It does not narrow to a taxonomy node
 * unless asked, because a shopper's question ignores the retailer's filing —
 * "anything hybrid under forty" is not a question about a subgroup. And it does
 * not quietly drop the requirements it could not express: those are printed,
 * because the worth of the answer depends entirely on how much of what the
 * customer said was checkable.
 *
 * Usage:
 *   node --env-file=.env.local --experimental-strip-types --conditions=react-server \
 *     --import ./scripts/register-alias.mjs \
 *     scripts/asr-eval/assess-missed-opportunity.mts --org "Delaware Auto v2" [--node "..."]
 */

import { parseArgs } from "node:util";

import postgres from "postgres";

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

const { values } = parseArgs({
  options: {
    org: { type: "string" },
    node: { type: "string" },
    title: { type: "string" },
  },
});
if (!values.org) {
  console.error('Usage: --org "<organization>" [--node "<taxonomy node>"] [--title "..."]');
  process.exit(1);
}

const sql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false, max: 1 });

try {
  const [organization] = await sql<{ id: string }[]>`
    select id from organizations where name = ${values.org!} order by created_at limit 1
  `;
  if (!organization) throw new Error(`No organization named ${values.org}.`);

  const [record] = await sql<{ id: string }[]>`
    select r.id from interaction_records r
    join conversations c on c.id = r.conversation_id
    where r.organization_id = ${organization.id} and r.status = 'completed'
      ${values.title ? sql`and c.title = ${values.title}` : sql``}
    order by r.created_at desc limit 1
  `;
  if (!record) throw new Error("No completed interaction record.");

  const fields = await sql<
    { field_key: string; value_text: string | null; value_amount_minor: string | null }[]
  >`
    select field_key, value_text, value_amount_minor from interaction_field_values
    where interaction_record_id = ${record.id} and abstention is null
  `;
  const textFor = (key: string) =>
    fields
      .filter((field) => field.field_key === key)
      .map((field) => field.value_text ?? "")
      .filter((value) => value.length > 0);
  const moneyFor = (key: string) => {
    const row = fields.find((field) => field.field_key === key && field.value_amount_minor);
    return row ? Number(row.value_amount_minor) : null;
  };

  // The vocabulary this retailer actually uses, one row per distinct value.
  // Bounded by the catalogue's variety, not its size.
  const vocabulary = await sql<{ attribute_key: string; value_text: string }[]>`
    select distinct a.attribute_key, a.value_text
    from public.catalogue_item_attributes a
    join public.catalogue_items i
      on i.organization_id = a.organization_id and i.item_id = a.item_id and i.valid_to is null
    where a.organization_id = ${organization.id} and a.value_text is not null
      ${values.node ? sql`and concat_ws(' > ', i.dept_name, i.group_name, i.subgroup_name) = ${values.node}` : sql``}
  `;
  const catalogueValues: CatalogueValue[] = vocabulary.map((row) => ({
    attributeKey: row.attribute_key,
    value: row.value_text,
    comparison: "equals",
  }));

  const phrases = [
    ...textFor("specification_requirements"),
    ...textFor("additional_requirements"),
    ...textFor("other_constraints"),
    ...textFor("decision_drivers"),
  ];

  const bindings = await bindPhrasesToValues(phrases, catalogueValues);
  const bound = bindings.filter((binding) => binding.bound);
  const unbound = bindings.filter((binding) => !binding.bound);

  const budget = budgetConstraint({
    targetMinor: moneyFor("target_budget"),
    maximumMinor: moneyFor("maximum_budget"),
  });

  const requirements: Requirement[] = [
    ...bound.map((binding) => (binding.bound ? binding.requirement : null)!),
    ...(budget ? [budget] : []),
  ];

  const stockRows = await sql<
    {
      item_id: string;
      description: string;
      node_key: string;
      price_minor: string | null;
      stock: number;
      attributes: { key: string; valueText: string | null; valueNumeric: number | null }[];
    }[]
  >`
    select
      item.item_id, item.description, item.price_minor,
      concat_ws(' > ', item.dept_name, item.group_name, item.subgroup_name) as node_key,
      coalesce(stock.stock, 0) as stock,
      coalesce((
        select json_agg(json_build_object(
          'key', attribute.attribute_key, 'valueText', attribute.value_text,
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
      ${values.node ? sql`and concat_ws(' > ', item.dept_name, item.group_name, item.subgroup_name) = ${values.node}` : sql``}
  `;

  const stocked: StockedItem[] = stockRows.map((row) => ({
    itemId: row.item_id,
    description: row.description,
    nodeKey: row.node_key,
    // Absent inventory is treated as one unit: a retailer who sends a catalogue
    // and no stock file still has a range, and reporting the whole range as out
    // of stock would be a louder lie than assuming it is on the shelf.
    stock: row.stock > 0 ? row.stock : 1,
    attributes: [
      ...(row.attributes ?? []),
      // Price is an attribute for matching purposes, so one comparison path
      // handles both what a product is and what it costs.
      ...(row.price_minor
        ? [{ key: "price_minor", valueText: null, valueNumeric: Number(row.price_minor) }]
        : []),
    ],
  }));

  const result = findMissedOpportunity({
    stocked,
    requirements,
    spokenNames: [...textFor("products_recommended"), ...textFor("products_considered")],
    claimedUnavailable: textFor("stock_status").some((value) => /unavailable/i.test(value)),
  });

  console.log(`scope            ${values.node ?? "whole catalogue"}`);
  console.log(`vocabulary       ${catalogueValues.length} distinct values`);
  console.log(`in stock         ${stocked.filter((item) => item.stock > 0).length} of ${stocked.length}\n`);

  console.log(`Bound (${bound.length}):`);
  for (const binding of bound) {
    if (!binding.bound) continue;
    console.log(
      `   "${binding.phrase.slice(0, 44)}"\n      -> ${binding.requirement.key} = ${binding.requirement.valueText}  (score ${binding.score.toFixed(2)}, margin ${binding.margin.toFixed(2)} over ${binding.runnerUp})`,
    );
  }
  if (budget) console.log(`   budget -> price_minor at_most ${(budget.valueNumeric! / 100).toLocaleString()}`);

  console.log(`\nCould not express (${unbound.length}):`);
  for (const binding of unbound) {
    if (binding.bound) continue;
    console.log(`   "${binding.phrase.slice(0, 52)}" — ${binding.reason} (best ${binding.best ?? "none"}, ${binding.score.toFixed(2)})`);
  }

  console.log(`\nqualifying and in stock   ${result.qualifying.length}`);
  console.log(`  of which shown          ${result.shown.length}`);
  console.log(`  NEVER SHOWN             ${result.neverShown.length}`);
  console.log(`falsely unavailable       ${result.falselyUnavailable}`);
  console.log(`constraints checked       ${requirements.length}`);

  for (const assessment of result.neverShown.slice(0, 10)) {
    const price = assessment.item.attributes.find((a) => a.key === "price_minor")?.valueNumeric;
    console.log(
      `   ${assessment.item.description.padEnd(28)} ${price ? `$${(price / 100).toLocaleString()}` : ""}  met: ${assessment.met.join(", ")}`,
    );
  }
} finally {
  await sql.end();
}
