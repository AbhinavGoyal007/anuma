/**
 * Naming a customer's category in the retailer's own words.
 *
 * Every distinct phrase customers have used, matched against the categories this
 * retailer actually files their products under. Measured, not confirmed by
 * anyone: the same margin rule that settles every other binding here.
 *
 * A phrase that resolves to nothing is left alone. It still groups under itself
 * on the dashboard and is still reported as unmatched, which is the honest pair
 * — the retailer sees the demand and is told their catalogue does not name it.
 *
 * Usage:
 *   node --env-file=.env.local --experimental-strip-types --conditions=react-server \
 *     --import ./scripts/register-alias.mjs \
 *     scripts/resolve-categories.mts --org "Delaware Auto v2"
 */

import { parseArgs } from "node:util";

import postgres from "postgres";

import { bindPhrasesToValues } from "@/modules/catalogue/semantic-binding";

const { values } = parseArgs({ options: { org: { type: "string" } } });
if (!values.org) {
  console.error('Usage: --org "<organization>"');
  process.exit(1);
}

const sql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false, max: 1 });

try {
  const [organization] = await sql<{ id: string }[]>`
    select id from organizations where name = ${values.org!} order by created_at limit 1
  `;
  if (!organization) throw new Error(`No organization named ${values.org}.`);

  const phrases = await sql<{ phrase: string; uses: number }[]>`
    with current_record as (
      select distinct on (record.conversation_id) record.id
      from public.interaction_records as record
      where record.organization_id = ${organization.id} and record.status = 'completed'
      order by record.conversation_id, record.created_at desc
    )
    select lower(btrim(value.value_text)) as phrase, count(*)::int as uses
    from public.interaction_field_values as value
    join current_record on current_record.id = value.interaction_record_id
    where value.field_key = 'purchase_category' and value.abstention is null
      and btrim(coalesce(value.value_text, '')) <> ''
    group by 1
  `;

  // Everything this retailer files products under, at every level they use.
  const labels = await sql<{ label: string }[]>`
    select distinct dept_name as label from public.catalogue_items
      where organization_id = ${organization.id} and valid_to is null and dept_name is not null
    union
    select distinct group_name from public.catalogue_items
      where organization_id = ${organization.id} and valid_to is null and group_name is not null
    union
    select distinct subgroup_name from public.catalogue_items
      where organization_id = ${organization.id} and valid_to is null and subgroup_name is not null
    union
    select distinct value_text from public.catalogue_item_attributes
      where organization_id = ${organization.id} and value_text is not null
  `;

  console.log(`${phrases.length} spoken phrase(s), ${labels.length} label(s) in their catalogue.`);
  if (phrases.length === 0 || labels.length === 0) {
    console.log("Nothing to resolve.");
    process.exit(0);
  }

  const bindings = await bindPhrasesToValues(
    phrases.map((row) => row.phrase),
    labels.map((row) => ({
      attributeKey: "category",
      value: row.label,
      comparison: "equals" as const,
    })),
  );

  let resolved = 0;
  for (const binding of bindings) {
    if (!binding.bound) {
      // A phrase that no longer resolves must lose the resolution it had.
      // Leaving it behind kept "2 bhk flat" mapped to "Flat Monitor" in an
      // electronics catalogue after the rule that produced it was corrected —
      // a fix that repaired the logic and left the wrong answer on the
      // dashboard.
      await sql`
        delete from public.category_resolutions
        where organization_id = ${organization.id} and phrase = ${binding.phrase}
      `;
      console.log(`  "${binding.phrase}" — left as spoken (${binding.reason})`);
      continue;
    }
    await sql`
      insert into public.category_resolutions (
        organization_id, phrase, resolved_label, score, margin
      ) values (
        ${organization.id}, ${binding.phrase}, ${binding.requirement.valueText!},
        ${binding.score}, ${binding.margin}
      )
      on conflict (organization_id, phrase) do update set
        resolved_label = excluded.resolved_label, score = excluded.score,
        margin = excluded.margin, resolved_at = now()
    `;
    resolved += 1;
    console.log(
      `  "${binding.phrase}" -> ${binding.requirement.valueText} (${binding.score.toFixed(2)}, margin ${binding.margin.toFixed(2)})`,
    );
  }

  console.log(`\n${resolved} of ${phrases.length} resolved to this retailer's own words.`);
} finally {
  await sql.end();
}
