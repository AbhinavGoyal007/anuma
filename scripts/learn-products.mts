/**
 * Filling in what a retailer's file leaves out.
 *
 * Walks the distinct products in a catalogue, asks once what each one is, and
 * stores the answer where every tenant can use it. Products already known are
 * skipped, including ones learned for a different retailer — the second dealer
 * to carry an Escape costs nothing.
 *
 * The facts land as attributes on the retailer's own items, marked with their
 * own keys so a claim from world knowledge is never mistaken for something the
 * retailer stated. That matters when the two disagree.
 *
 * Usage:
 *   node --env-file=.env.local --experimental-strip-types --conditions=react-server \
 *     --import ./scripts/register-alias.mjs \
 *     scripts/learn-products.mts --org "Delaware Auto v2" [--limit 200]
 */

import { parseArgs } from "node:util";

import postgres from "postgres";

import {
  describeProducts,
  normalizeKey,
  type ProductRef,
} from "@/modules/catalogue/product-knowledge";
import { ATTRIBUTE_EXTRACTOR_VERSION } from "@/modules/catalogue/attribute-schema";

const { values } = parseArgs({
  options: { org: { type: "string" }, limit: { type: "string" } },
});
if (!values.org) {
  console.error('Usage: --org "<organization>" [--limit N]');
  process.exit(1);
}

/** Small enough that one bad batch costs little, large enough to be cheap. */
const BATCH = 25;

const sql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false, max: 1 });

try {
  const [organization] = await sql<{ id: string }[]>`
    select id from organizations where name = ${values.org!} order by created_at limit 1
  `;
  if (!organization) throw new Error(`No organization named ${values.org}.`);

  // One row per product this retailer actually carries. The description is the
  // model where a model column existed, and the whole description otherwise.
  const products = await sql<{ brand: string; model: string; items: number }[]>`
    select coalesce(nullif(btrim(brand_name), ''), 'Unbranded') as brand,
           btrim(description) as model,
           count(*)::int as items
    from public.catalogue_items
    where organization_id = ${organization.id} and valid_to is null
      and btrim(coalesce(description, '')) <> ''
    group by 1, 2
    order by count(*) desc
    ${values.limit ? sql`limit ${Number(values.limit)}` : sql``}
  `;

  const known = new Set(
    (
      await sql<{ brand_key: string; model_key: string }[]>`
        select brand_key, model_key from public.product_knowledge
      `
    ).map((row) => `${row.brand_key}|${row.model_key}`),
  );

  const pending: ProductRef[] = products
    .filter((row) => !known.has(`${normalizeKey(row.brand)}|${normalizeKey(row.model)}`))
    .map((row) => ({ brand: row.brand, model: row.model }));

  console.log(
    `${products.length} distinct products, ${products.length - pending.length} already known, ${pending.length} to learn.`,
  );

  let recognised = 0;
  for (let index = 0; index < pending.length; index += BATCH) {
    const batch = pending.slice(index, index + BATCH);
    let facts;
    try {
      facts = await describeProducts(batch);
    } catch (error) {
      console.log(`  batch ${index / BATCH + 1} failed: ${String(error).slice(0, 70)}`);
      continue;
    }
    for (const fact of facts) {
      await sql`
        insert into public.product_knowledge (
          brand_key, model_key, brand, model, descriptors, suited_to, recognised, source_model
        ) values (
          ${normalizeKey(fact.brand)}, ${normalizeKey(fact.model)}, ${fact.brand}, ${fact.model},
          ${fact.descriptors}, ${fact.suitedTo}, ${fact.recognised}, 'gpt-5.6-luna'
        )
        on conflict (brand_key, model_key) do update set
          descriptors = excluded.descriptors, suited_to = excluded.suited_to,
          recognised = excluded.recognised
      `;
      if (fact.recognised) recognised += 1;
    }
    console.log(`  ${Math.min(index + BATCH, pending.length)} / ${pending.length}`);
  }

  // Attach what is known to this retailer's items, under keys of their own so a
  // fact about the world is never confused with something the retailer stated.
  const attached = await sql<{ n: number }[]>`
    with facts as (
      select item.item_id, unnest(k.descriptors) as descriptor
      from public.catalogue_items as item
      join public.product_knowledge as k
        on k.brand_key = lower(btrim(coalesce(nullif(btrim(item.brand_name), ''), 'Unbranded')))
       and k.model_key = lower(btrim(item.description))
      where item.organization_id = ${organization.id} and item.valid_to is null and k.recognised
    )
    insert into public.catalogue_item_attributes (
      organization_id, item_id, attribute_key, value_text, unit, extractor_version
    )
    select ${organization.id}, facts.item_id, 'known_kind', facts.descriptor, null,
           ${ATTRIBUTE_EXTRACTOR_VERSION}
    from facts
    on conflict do nothing
    returning 1 as n
  `;

  console.log(
    `\n${recognised} of ${pending.length} recognised; ${attached.length} knowledge attributes attached.`,
  );
} finally {
  await sql.end();
}
