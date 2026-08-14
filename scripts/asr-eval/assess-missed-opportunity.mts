/**
 * Running the missed-opportunity assessment over one real conversation.
 *
 * Reads the interaction record the product produced, the attributes discovered
 * for this retailer, and what was in stock on the day, and reports what the
 * customer could have been shown. Every judgement happens in
 * `missed-opportunity.ts`; this only carries values between the database and it.
 *
 * Usage:
 *   node --env-file=.env.local --experimental-strip-types --conditions=react-server \
 *     --import ./scripts/register-alias.mjs \
 *     scripts/asr-eval/assess-missed-opportunity.mts --org "Torque Motors"
 */

import { parseArgs } from "node:util";

import postgres from "postgres";

import {
  findMissedOpportunity,
  type Requirement,
  type StockedItem,
} from "@/modules/catalogue/missed-opportunity";

const { values } = parseArgs({
  options: {
    org: { type: "string", default: "Torque Motors" },
    node: { type: "string", default: "Motorcycles > Twin > 650cc Twin" },
  },
});

const sql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false, max: 1 });

try {
  const [organization] = await sql<{ id: string }[]>`
    select id from organizations where name = ${values.org!} order by created_at limit 1
  `;
  if (!organization) throw new Error(`No organization named ${values.org}.`);

  const [record] = await sql<{ id: string; conversation_id: string }[]>`
    select id, conversation_id from interaction_records
    where organization_id = ${organization.id} and status = 'completed'
    order by created_at desc limit 1
  `;
  if (!record) throw new Error("No completed interaction record.");

  const fields = await sql<{ field_key: string; label: string | null; value_text: string | null }[]>`
    select field_key, label, value_text from interaction_field_values
    where interaction_record_id = ${record.id} and abstention is null
  `;
  const valuesFor = (key: string) =>
    fields.filter((field) => field.field_key === key).map((field) => field.value_text ?? "");

  // The stock on the floor for this node, with everything read from each row.
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
      item.item_id,
      item.description,
      concat_ws(' > ', item.dept_name, item.group_name, item.subgroup_name) as node_key,
      coalesce(stock.stock, 0) as stock,
      coalesce(
        (
          select json_agg(json_build_object(
            'key', attribute.attribute_key,
            'valueText', attribute.value_text,
            'valueNumeric', attribute.value_numeric
          ))
          from public.catalogue_item_attributes as attribute
          where attribute.organization_id = item.organization_id
            and attribute.item_id = item.item_id
        ),
        '[]'::json
      ) as attributes
    from public.catalogue_items as item
    left join lateral (
      select inventory.stock from public.inventory
      where inventory.organization_id = item.organization_id
        and inventory.item_id = item.item_id
      order by inventory.as_of desc limit 1
    ) as stock on true
    where item.organization_id = ${organization.id}
      and item.valid_to is null
      and concat_ws(' > ', item.dept_name, item.group_name, item.subgroup_name) = ${values.node!}
  `;

  const stocked: StockedItem[] = stockRows.map((row) => ({
    itemId: row.item_id,
    description: row.description,
    nodeKey: row.node_key,
    stock: Number(row.stock),
    attributes: row.attributes ?? [],
  }));

  // What the customer asked for, expressed against this retailer's own
  // attributes. `type` is a dimension nobody defined — it was discovered from
  // the descriptions, and it happens to be the one that decides this sale.
  const wantsTouring = valuesFor("additional_requirements").some((value) =>
    /touring|cruiser|upright|comfort/i.test(value),
  );
  const requirements: Requirement[] = wantsTouring
    ? [{ key: "type", comparison: "equals", valueText: "tourer", valueNumeric: null }]
    : [];

  const spokenNames = [
    ...valuesFor("products_recommended"),
    ...valuesFor("products_considered"),
  ];
  const claimedUnavailable = valuesFor("stock_status").some((value) =>
    /unavailable/i.test(value),
  );

  const result = findMissedOpportunity({
    stocked,
    requirements,
    spokenNames,
    claimedUnavailable,
  });

  console.log(`node            ${values.node}`);
  console.log(`on the floor    ${stocked.filter((item) => item.stock > 0).length} of ${stocked.length} rows in stock`);
  console.log(`asked for       ${requirements.map((r) => `${r.key} ${r.comparison} ${r.valueText ?? r.valueNumeric}`).join(", ") || "nothing matchable"}`);
  console.log(`named in store  ${[...new Set(spokenNames)].join(" | ") || "none"}`);
  console.log();
  console.log(`qualifying and in stock   ${result.qualifying.length}`);
  console.log(`  of which shown          ${result.shown.length}`);
  console.log(`  NEVER SHOWN             ${result.neverShown.length}`);
  console.log(`falsely unavailable       ${result.falselyUnavailable}`);

  if (result.neverShown.length) {
    console.log("\nWhat the customer walked past:");
    for (const assessment of result.neverShown) {
      console.log(
        `   ${assessment.item.description.padEnd(58)} stock ${assessment.item.stock}  met: ${assessment.met.join(", ")}`,
      );
    }
  }
} finally {
  await sql.end();
}
