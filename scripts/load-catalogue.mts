/**
 * Loading a retailer's catalogue export from an operator's machine.
 *
 * A first import is 180,000 rows, and applying it is a single set-based
 * statement that runs for well over a minute. That is longer than Supabase's
 * API gateway will hold a request open, so the same code called over PostgREST
 * returns `upstream request timeout` while the statement carries on running in
 * the background — the import then looks failed while it is in fact half
 * applied. This connects to Postgres directly instead, where a long statement
 * is simply a long statement.
 *
 * The parsing and the content hash come from `src/modules/catalogue/csv.ts`, so
 * a file loaded from here and a file loaded from the product are read by the
 * same rules and produce the same hashes — otherwise every row would look
 * "changed" the first time the two paths met.
 *
 * The statement timeout is raised on the session rather than relied upon from
 * `apply_catalogue_import`'s own `SET statement_timeout = '600s'`. That setting
 * is real — it is in the function's `proconfig` — but it does not take effect,
 * because Postgres arms the timeout timer when the outer statement begins and
 * changing the value inside the function never re-arms it. The apply is
 * therefore bounded by whatever the *caller's* session allows, which on this
 * connection defaults to two minutes and cuts the insert off part-way.
 *
 * Usage:
 *   node --env-file=.env.local --experimental-strip-types \
 *     scripts/load-catalogue.mts --file <path.csv> --org "AG LLC" [--reset-stale]
 */

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import postgres from "postgres";

import { contentHash, parseDelimited, toCatalogueRows } from "../src/modules/catalogue/csv.ts";

/**
 * Rows per insert. Postgres accepts at most 65,535 bind parameters in one
 * statement and each row binds thirteen, so this leaves headroom rather than
 * sitting on the boundary.
 */
const CHUNK = 4_000;

const STAGING_COLUMNS = [
  "organization_id",
  "import_id",
  "item_id",
  "description",
  "brand_id",
  "brand_name",
  "dept_id",
  "dept_name",
  "group_id",
  "group_name",
  "subgroup_id",
  "subgroup_name",
  "content_hash",
] as const;

function seconds(from: number): string {
  return `${((Date.now() - from) / 1000).toFixed(1)}s`;
}

const { values } = parseArgs({
  options: {
    file: { type: "string" },
    org: { type: "string" },
    "reset-stale": { type: "boolean", default: false },
  },
});

if (!values.file || !values.org) {
  console.error('Usage: --file <path.csv> --org "<organization name>" [--reset-stale]');
  process.exit(1);
}

const databaseUrl = process.env.SUPABASE_DB_URL;
if (!databaseUrl) {
  console.error("SUPABASE_DB_URL is not set. Run with --env-file=.env.local");
  process.exit(1);
}

const readAt = Date.now();
const parsed = toCatalogueRows(parseDelimited(readFileSync(values.file, "utf8")));
if (parsed.missingColumns.length > 0) {
  console.error(`The file is missing required columns: ${parsed.missingColumns.join(", ")}`);
  process.exit(1);
}
if (parsed.rows.length === 0) {
  console.error("The file contained no usable rows.");
  process.exit(1);
}
console.log(`Read ${parsed.rows.length.toLocaleString()} rows in ${seconds(readAt)}.`);
if (parsed.skipped.length > 0) {
  const reasons = new Map<string, number>();
  for (const entry of parsed.skipped) {
    const kind = entry.reason.startsWith("duplicate") ? "duplicate ITEM_ID" : entry.reason;
    reasons.set(kind, (reasons.get(kind) ?? 0) + 1);
  }
  console.log(
    `Skipped ${parsed.skipped.length.toLocaleString()}: ` +
      [...reasons].map(([reason, count]) => `${reason} x${count}`).join(", "),
  );
}

// `prepare: false` because the connection goes through Supavisor; `idle_timeout`
// off so the apply statement is never cut short from this side.
const sql = postgres(databaseUrl, {
  prepare: false,
  max: 1,
  idle_timeout: 0,
  connect_timeout: 30,
});

try {
  // A first load of a 180,000-row catalogue writes four indexes as it goes, and
  // on a small instance the apply slows sharply once those indexes stop fitting
  // in cache — measured at well over fifteen minutes. Later imports only touch
  // what changed and finish in seconds, so this ceiling is for the first day.
  await sql`set statement_timeout = '3600s'`;

  const [organization] = await sql<{ id: string }[]>`
    select id from organizations where name = ${values.org} order by created_at limit 1
  `;
  if (!organization) throw new Error(`No organization named ${values.org}.`);

  const [membership] = await sql<{ id: string }[]>`
    select id from organization_memberships
    where organization_id = ${organization.id} and role = 'admin'
    order by created_at limit 1
  `;

  // An import left in `processing` by a killed run is indistinguishable from one
  // still going, and its staged rows would be diffed into the next apply.
  const stale = await sql<{ id: string; staged: number }[]>`
    select imports.id,
      (select count(*)::int from catalogue_staging where import_id = imports.id) as staged
    from catalogue_imports as imports
    where imports.organization_id = ${organization.id} and imports.status = 'processing'
  `;
  if (stale.length > 0) {
    if (!values["reset-stale"]) {
      throw new Error(
        `${stale.length} import(s) are still marked processing. If no load is running, re-run with --reset-stale.`,
      );
    }
    for (const entry of stale) {
      await sql`delete from catalogue_staging where import_id = ${entry.id}`;
      await sql`
        update catalogue_imports
        set status = 'failed', completed_at = now(),
            error_message = 'Abandoned by an interrupted load; reset before a later import.'
        where id = ${entry.id}
      `;
      console.log(`Reset stale import ${entry.id} (${entry.staged.toLocaleString()} staged rows).`);
    }
  }

  // Staging is machinery, emptied by every successful apply, so anything left
  // for this organization is debris from a run that died. The diff filters by
  // import id and would not read it, but it costs storage and it makes the
  // table impossible to reason about.
  const orphaned = await sql`
    delete from catalogue_staging where organization_id = ${organization.id}
  `;
  if (orphaned.count > 0) {
    console.log(`Cleared ${orphaned.count.toLocaleString()} orphaned staging rows.`);
  }

  const [created] = await sql<{ id: string }[]>`
    insert into catalogue_imports
      (organization_id, filename, row_count, imported_by_membership_id, status)
    values (${organization.id}, ${values.file.split("/").pop() ?? values.file},
            ${parsed.rows.length}, ${membership?.id ?? null}, 'processing')
    returning id
  `;
  if (!created) throw new Error("The catalogue import could not be opened.");
  console.log(`Import ${created.id} opened for ${values.org}.`);

  try {
    const stageAt = Date.now();
    for (let start = 0; start < parsed.rows.length; start += CHUNK) {
      const chunk = parsed.rows.slice(start, start + CHUNK).map((row) => ({
        organization_id: organization.id,
        import_id: created.id,
        item_id: row.itemId,
        description: row.description,
        brand_id: row.brandId,
        brand_name: row.brandName,
        dept_id: row.deptId,
        dept_name: row.deptName,
        group_id: row.groupId,
        group_name: row.groupName,
        subgroup_id: row.subgroupId,
        subgroup_name: row.subgroupName,
        content_hash: contentHash(row),
      }));
      await sql`insert into catalogue_staging ${sql(chunk, ...STAGING_COLUMNS)}`;
      process.stdout.write(
        `\r  staged ${Math.min(start + CHUNK, parsed.rows.length).toLocaleString()} / ${parsed.rows.length.toLocaleString()}`,
      );
    }
    console.log(`\nStaged in ${seconds(stageAt)}.`);

    const applyAt = Date.now();
    const [applied] = await sql<
      { added: number; changed: number; delisted: number; unchanged: number }[]
    >`select * from apply_catalogue_import(${created.id})`;
    console.log(
      `Applied in ${seconds(applyAt)}: added ${Number(applied?.added ?? 0).toLocaleString()}, ` +
        `changed ${Number(applied?.changed ?? 0).toLocaleString()}, ` +
        `delisted ${Number(applied?.delisted ?? 0).toLocaleString()}, ` +
        `unchanged ${Number(applied?.unchanged ?? 0).toLocaleString()}.`,
    );

    const [current] = await sql<{ n: number }[]>`
      select count(*)::int as n from catalogue_items
      where organization_id = ${organization.id} and valid_to is null
    `;
    console.log(`Current items: ${Number(current?.n ?? 0).toLocaleString()}.`);
  } catch (error) {
    await sql`delete from catalogue_staging where import_id = ${created.id}`;
    await sql`
      update catalogue_imports
      set status = 'failed', completed_at = now(),
          error_message = ${(error instanceof Error ? error.message : "Import failed.").slice(0, 500)}
      where id = ${created.id}
    `;
    throw error;
  }
} finally {
  await sql.end();
}
