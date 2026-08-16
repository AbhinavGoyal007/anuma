/**
 * Bringing every organization's field library up to the current registry.
 *
 * The seeder is deliberately gentle: a key that already exists is left exactly
 * as the business left it. That protects their edits and, on the day the
 * registry gains a field, silently leaves every existing organization
 * extracting against the old prompt. This runs the seed path for all of them.
 */
import postgres from "postgres";
import { ensureFieldLibrarySeeded } from "@/modules/field-library/repository";

const sql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false, max: 1 });
try {
  const orgs = await sql<{ id: string; name: string }[]>`select id, name from organizations order by name`;
  for (const org of orgs) {
    await ensureFieldLibrarySeeded(org.id);
    const [row] = await sql<{ fields: number; with_task: number }[]>`
      select count(*)::int fields, count(*) filter (where task is not null)::int with_task
      from interaction_field_definitions where organization_id = ${org.id}`;
    console.log(`  ${org.name.padEnd(24)} ${row!.fields} fields, ${row!.with_task} with task/scope`);
  }
} finally {
  await sql.end();
}
