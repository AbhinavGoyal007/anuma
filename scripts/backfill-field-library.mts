/**
 * Bringing every organization's field library up to the current registry.
 *
 * The application seeder is deliberately gentle: a key that already exists is
 * left exactly as the business left it. That protects their edits and, on the
 * day the registry gains a field, silently leaves every existing organization
 * extracting against the old prompt.
 *
 * Two things happen here. Missing keys are inserted, which the seeder also does.
 * And with --resync, system-owned rows whose shape has changed in the registry
 * are rewritten — a rule reworded, a field that went from a list of things said
 * to a judgement about them. A new key arriving is only half of what a spec
 * revision does; the other half is an existing field coming to mean something
 * different, and without this those organizations keep extracting against the
 * old definition for ever. Only is_system rows are touched, because those are
 * ANUMA's own definitions and the registry is their source of truth. A business
 * that wants different wording disables the system field and adds its own, which
 * this never overwrites.
 *
 * Written as two statements per organization rather than through the repository,
 * because the repository issues one request per field and the fan-out across
 * every tenant is what made this take minutes instead of seconds.
 */
import postgres from "postgres";

import { defaultFieldDefinitions } from "@/modules/field-library/defaults";

const resync = process.argv.includes("--resync");
const sql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false, max: 1 });
const seeds = defaultFieldDefinitions();

try {
  const orgs = await sql<{ id: string; name: string }[]>`
    select id, name from organizations order by name`;
  console.log(`${seeds.length} registry fields across ${orgs.length} organizations\n`);

  for (const org of orgs) {
    const payload = sql.json(seeds as never);

    const inserted = await sql`
      insert into interaction_field_definitions (
        organization_id, key, label, definition, source_class, alternate_source_class,
        value_kind, cardinality, enum_values, labelled, requires_evidence,
        task, scope, speaker_source, is_system, is_enabled, sort_order)
      select ${org.id}, seed.key, seed.label, seed.definition,
             seed.source_class::fact_source_class,
             seed.alternate_source_class::fact_source_class,
             seed.value_kind, seed.cardinality,
             seed.enum_values, seed.labelled, seed.requires_evidence,
             seed.task, seed.scope,
             seed.speaker_source,
             seed.is_system, seed.is_enabled, seed.sort_order
      from jsonb_to_recordset(${payload}) as seed (
        key text, label text, definition text, source_class text,
        alternate_source_class text, value_kind text, cardinality text,
        enum_values text[], labelled boolean, requires_evidence boolean,
        task text, scope text, speaker_source text,
        is_system boolean, is_enabled boolean, sort_order integer)
      on conflict (organization_id, key) do nothing
      returning key`;

    let changed: readonly { key: string }[] = [];
    if (resync) {
      changed = await sql<{ key: string }[]>`
        update interaction_field_definitions as target set
          definition        = seed.definition,
          source_class      = seed.source_class::fact_source_class,
          value_kind        = seed.value_kind,
          cardinality       = seed.cardinality,
          enum_values       = seed.enum_values,
          labelled          = seed.labelled,
          requires_evidence = seed.requires_evidence,
          task              = seed.task,
          scope             = seed.scope,
          speaker_source    = seed.speaker_source
        from jsonb_to_recordset(${payload}) as seed (
          key text, definition text, source_class text, value_kind text,
          cardinality text, enum_values text[], labelled boolean,
          requires_evidence boolean, task text, scope text, speaker_source text)
        where target.organization_id = ${org.id}
          and target.key = seed.key
          and target.is_system
          and (target.definition, target.value_kind, target.cardinality)
              is distinct from (seed.definition, seed.value_kind, seed.cardinality)
        returning target.key`;
    }

    // A field can also leave the registry — because it turned out to be
    // derivable from other fields, or because the spec dropped it. The seeder
    // has no concept of that, so without this the model keeps being asked for a
    // field nothing reads any more, on every conversation, for ever. Only
    // system rows are retired; a business's own fields are never touched.
    let retired: readonly { key: string }[] = [];
    if (resync) {
      retired = await sql<{ key: string }[]>`
        delete from interaction_field_definitions
        where organization_id = ${org.id} and is_system
          and key not in ${sql(seeds.map((seed) => seed.key))}
        returning key`;
    }

    const [row] = await sql<{ fields: number; with_task: number }[]>`
      select count(*)::int fields, count(*) filter (where task is not null)::int with_task
      from interaction_field_definitions where organization_id = ${org.id}`;
    const detail = [
      `${row!.fields} fields`,
      `${row!.with_task} with task/scope`,
      inserted.length ? `+${inserted.length} new` : null,
      resync && changed.length ? `${changed.length} resynced` : null,
      retired.length ? `${retired.length} retired (${retired.map((r) => r.key).join(", ")})` : null,
    ]
      .filter(Boolean)
      .join(", ");
    console.log(`  ${org.name.slice(0, 34).padEnd(36)} ${detail}`);
  }
} finally {
  await sql.end();
}
