/**
 * Prices and stock for a catalogue that shipped without either.
 *
 * The electronics export carries no money and no quantities, which is common —
 * a merchandising extract describes the range, and price and stock live in the
 * till system. For a demo they have to exist, so they are invented here, and
 * invented in a way that will not embarrass anyone reading the screen: bands per
 * department, and the figure inside the band derived from the item's own id so
 * that a product costs the same on every run and a screenshot stays true.
 *
 * Stock is deliberately not uniform. Roughly a sixth of the range is out, which
 * is what makes "we had it" and "we did not" both appear on the same day.
 *
 * Usage:
 *   node --env-file=.env.local --experimental-strip-types \
 *     scripts/demo/seed-commercials.mts --org "Nova Electronics"
 */

import { parseArgs } from "node:util";

import postgres from "postgres";

const { values } = parseArgs({ options: { org: { type: "string" } } });
if (!values.org) {
  console.error('Usage: --org "<organization>"');
  process.exit(1);
}

/**
 * What each department costs, in rupees.
 *
 * Wide enough that a stated budget rules some of it out, which is the whole
 * point of holding a price at all.
 */
const BANDS: { match: string; low: number; high: number }[] = [
  { match: "Information Technology Accessories", low: 300, high: 9000 },
  { match: "Telecom Accessories", low: 200, high: 7000 },
  { match: "Smart Electronics Accessories", low: 400, high: 8000 },
  { match: "Gaming Accessories", low: 800, high: 20000 },
  { match: "Information Technology", low: 24000, high: 210000 },
  { match: "Telecom", low: 7000, high: 165000 },
  { match: "Electronics", low: 12000, high: 400000 },
  { match: "Smart Electronics", low: 2000, high: 60000 },
  { match: "MDA", low: 15000, high: 160000 },
  { match: "SDA", low: 900, high: 32000 },
];

const sql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false, max: 1 });

try {
  const [organization] = await sql<{ id: string }[]>`
    select id from organizations where name = ${values.org!} order by created_at limit 1
  `;
  if (!organization) throw new Error(`No organization named ${values.org}.`);

  await sql`select set_config('statement_timeout', '1800s', false)`;

  // Longest department name first, so "Telecom Accessories" is not caught by the
  // band for "Telecom".
  const ordered = [...BANDS].sort((a, b) => b.match.length - a.match.length);

  for (const band of ordered) {
    const spread = band.high - band.low;
    const result = await sql`
      update public.catalogue_items as item
      set price_minor = (
            (${band.low} + (abs(hashtext(item.item_id)) % ${spread})) * 100
          )::bigint,
          -- A list price a little above what it sells for, so a discount is
          -- visible where a retailer would show one.
          msrp_minor = (
            ((${band.low} + (abs(hashtext(item.item_id)) % ${spread}))
              * (100 + (abs(hashtext(item.item_id || 'm')) % 22)) / 100)::bigint * 100
          )::bigint,
          currency_code = 'INR'
      where item.organization_id = ${organization.id}
        and item.valid_to is null
        and item.price_minor is null
        and item.dept_name = ${band.match}
    `;
    console.log(
      `  ${band.match.padEnd(36)} ₹${band.low.toLocaleString()}–${band.high.toLocaleString()}  ${result.count} items`,
    );
  }

  // Anything in a department with no band still needs a figure rather than a
  // blank, or it silently fails every budget comparison.
  const fallback = await sql`
    update public.catalogue_items as item
    set price_minor = ((900 + (abs(hashtext(item.item_id)) % 40000)) * 100)::bigint,
        msrp_minor = ((900 + (abs(hashtext(item.item_id)) % 40000)) * 110)::bigint,
        currency_code = 'INR'
    where item.organization_id = ${organization.id}
      and item.valid_to is null and item.price_minor is null
  `;
  if (fallback.count > 0) console.log(`  ${"(other)".padEnd(36)} ${fallback.count} items`);

  await sql`delete from public.inventory where organization_id = ${organization.id}`;
  const stocked = await sql`
    insert into public.inventory (organization_id, item_id, location_id, stock, as_of)
    select
      item.organization_id,
      item.item_id,
      null,
      -- Out of stock about one time in six, and otherwise a shelf quantity.
      case when abs(hashtext(item.item_id || 'stock')) % 6 = 0
           then 0
           else 1 + (abs(hashtext(item.item_id || 'stock')) % 14)
      end,
      now()
    from public.catalogue_items as item
    where item.organization_id = ${organization.id} and item.valid_to is null
  `;

  const [summary] = await sql<
    { items: number; priced: number; in_stock: number; low: string; high: string }[]
  >`
    select
      count(*)::int as items,
      count(item.price_minor)::int as priced,
      count(*) filter (where stock.stock > 0)::int as in_stock,
      min(item.price_minor) as low,
      max(item.price_minor) as high
    from public.catalogue_items as item
    left join public.inventory as stock
      on stock.organization_id = item.organization_id and stock.item_id = item.item_id
    where item.organization_id = ${organization.id} and item.valid_to is null
  `;

  console.log(
    `\n${summary!.items.toLocaleString()} items · ${summary!.priced.toLocaleString()} priced ` +
      `(₹${(Number(summary!.low) / 100).toLocaleString()}–₹${(Number(summary!.high) / 100).toLocaleString()}) · ` +
      `${summary!.in_stock.toLocaleString()} in stock of ${stocked.count.toLocaleString()} rows`,
  );
} finally {
  await sql.end();
}
