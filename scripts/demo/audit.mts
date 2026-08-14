/**
 * Checking that every screen has something to show.
 *
 * A demo fails in one of two ways: a screen throws, or a screen renders an empty
 * state perfectly. The second is worse, because it looks deliberate. This asks,
 * for each screen, whether the rows it reads actually exist.
 *
 * Usage:
 *   node --env-file=.env.local --experimental-strip-types \
 *     scripts/demo/audit.mts --org "Nova Electronics"
 */

import { parseArgs } from "node:util";

import postgres from "postgres";

const { values } = parseArgs({ options: { org: { type: "string", default: "Nova Electronics" } } });

const sql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false, max: 1 });

try {
  const [organization] = await sql<{ id: string }[]>`
    select id from organizations where name = ${values.org!} order by created_at limit 1
  `;
  if (!organization) throw new Error(`No organization named ${values.org}.`);
  const org = organization.id;

  const checks: { screen: string; needs: string; count: number }[] = [];
  const add = async (screen: string, needs: string, query: Promise<{ c: number }[]>) => {
    const [row] = await query;
    checks.push({ screen, needs, count: Number(row?.c ?? 0) });
  };

  await add(
    "/conversations",
    "conversations",
    sql`
    select count(*)::int c from conversations where organization_id = ${org}`,
  );
  await add(
    "/conversations",
    "recordings",
    sql`
    select count(*)::int c from recordings where organization_id = ${org}`,
  );
  await add(
    "/conversations/[id]",
    "transcripts",
    sql`
    select count(distinct conversation_id)::int c from transcription_runs
    where organization_id = ${org} and status = 'completed'`,
  );
  await add(
    "/conversations/[id]",
    "speaker mappings",
    sql`
    select count(*)::int c from speaker_mapping_versions where organization_id = ${org}`,
  );
  await add(
    "/conversations/[id]",
    "interaction records",
    sql`
    select count(*)::int c from interaction_records where organization_id = ${org} and status = 'completed'`,
  );
  await add(
    "/conversations/[id]",
    "field values",
    sql`
    select count(*)::int c from interaction_field_values where organization_id = ${org}`,
  );
  await add(
    "/conversations/[id]",
    "evidence citations",
    sql`
    select count(*)::int c from evidence_references where organization_id = ${org}`,
  );
  await add(
    "/conversations/[id]",
    "metrics",
    sql`
    select count(distinct conversation_id)::int c from interaction_metrics where organization_id = ${org}`,
  );
  await add(
    "/conversations/[id]",
    "opportunity: priced stock",
    sql`
    select count(*)::int c from catalogue_items i
    join inventory s on s.organization_id = i.organization_id and s.item_id = i.item_id and s.stock > 0
    where i.organization_id = ${org} and i.valid_to is null and i.price_minor is not null`,
  );
  await add(
    "/customer-intelligence",
    "category resolutions",
    sql`
    select count(*)::int c from category_resolutions where organization_id = ${org}`,
  );
  await add(
    "/customer-intelligence",
    "purchase_category values",
    sql`
    select count(*)::int c from interaction_field_values
    where organization_id = ${org} and field_key = 'purchase_category' and abstention is null`,
  );
  await add(
    "/frontline-performance",
    "representatives with conversations",
    sql`
    select count(distinct representative_membership_id)::int c from conversations where organization_id = ${org}`,
  );
  await add(
    "/frontline-performance",
    "stores",
    sql`
    select count(*)::int c from locations where organization_id = ${org}`,
  );
  await add(
    "/outcome-intelligence",
    "decided outcomes",
    sql`
    select count(*)::int c from interaction_field_values
    where organization_id = ${org} and field_key = 'final_decision_state' and abstention is null`,
  );
  await add(
    "/field-library",
    "field definitions",
    sql`
    select count(*)::int c from interaction_field_definitions where organization_id = ${org}`,
  );
  await add(
    "/administration",
    "check definitions",
    sql`
    select count(*)::int c from check_definitions where organization_id = ${org}`,
  );
  await add(
    "/administration",
    "category roles",
    sql`
    select count(*)::int c from category_roles where organization_id = ${org}`,
  );
  await add(
    "/administration/catalogue",
    "catalogue items",
    sql`
    select count(*)::int c from catalogue_items where organization_id = ${org} and valid_to is null`,
  );
  await add(
    "/administration/catalogue",
    "discovered attributes (active)",
    sql`
    select count(*)::int c from category_attributes where organization_id = ${org} and status = 'active'`,
  );
  await add(
    "/administration/catalogue",
    "attribute values",
    sql`
    select count(*)::int c from catalogue_item_attributes where organization_id = ${org}`,
  );
  await add(
    "/administration/catalogue",
    "source column mapping",
    sql`
    select count(*)::int c from catalogue_source_columns where organization_id = ${org}`,
  );
  await add(
    "/administration/categories",
    "spoken category phrases",
    sql`
    select count(distinct lower(btrim(value_text)))::int c from interaction_field_values
    where organization_id = ${org} and field_key = 'purchase_category' and abstention is null`,
  );

  const width = Math.max(...checks.map((check) => check.screen.length));
  let empty = 0;
  console.log("");
  for (const check of checks) {
    const ok = check.count > 0;
    if (!ok) empty += 1;
    console.log(
      `  ${ok ? "OK " : "!! "}${check.screen.padEnd(width)}  ${check.needs.padEnd(34)} ${check.count.toLocaleString()}`,
    );
  }

  console.log(
    empty === 0
      ? "\nEvery screen has data behind it."
      : `\n${empty} check(s) came back empty — those screens will render their empty state.`,
  );
} finally {
  await sql.end();
}
