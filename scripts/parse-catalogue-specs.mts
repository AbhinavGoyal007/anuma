/**
 * Reading every catalogue description into columns a query can filter on.
 *
 * Runs over a direct Postgres connection for the same reason the import does:
 * this touches every current row, and PostgREST caps a request at a thousand of
 * them. The parse itself is a pure function of the description, so re-running is
 * safe and idempotent — a row already read by this version of the rules is
 * skipped unless `--all` says otherwise.
 *
 * Usage:
 *   node --env-file=.env.local --experimental-strip-types \
 *     scripts/parse-catalogue-specs.mts --org "AG LLC" [--all]
 */

import { parseArgs } from "node:util";

import postgres from "postgres";

import {
  DESCRIPTION_TRUNCATED_AT,
  SPEC_PARSER_VERSION,
  parseSpec,
  specCompleteness,
} from "../src/modules/catalogue/spec-parser.ts";

/** Rows read and written per round trip. */
const BATCH = 5_000;

/**
 * A value the integer columns can actually hold.
 *
 * The parser reports what the text said; a description like "Bose 700/1200/32"
 * can therefore yield a "storage" of 1200 or something far larger, and one row
 * whose number overflows an int32 would fail the whole batch. Rejecting the
 * value here rather than widening the column keeps a misread out of the data
 * instead of storing it as though it were a real capacity.
 */
function asInteger(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded >= 0 && rounded <= 2_147_483_647 ? rounded : null;
}

const { values } = parseArgs({
  options: { org: { type: "string" }, all: { type: "boolean", default: false } },
});
if (!values.org) {
  console.error('Usage: --org "<organization name>" [--all]');
  process.exit(1);
}

const databaseUrl = process.env.SUPABASE_DB_URL;
if (!databaseUrl) {
  console.error("SUPABASE_DB_URL is not set. Run with --env-file=.env.local");
  process.exit(1);
}

const sql = postgres(databaseUrl, { prepare: false, max: 1, idle_timeout: 0, connect_timeout: 30 });

try {
  await sql`set statement_timeout = '1800s'`;

  const [organization] = await sql<{ id: string }[]>`
    select id from organizations where name = ${values.org} order by created_at limit 1
  `;
  if (!organization) throw new Error(`No organization named ${values.org}.`);

  const startedAt = Date.now();
  let parsed = 0;
  let lastId = "00000000-0000-0000-0000-000000000000";

  // Keyset pagination on the primary key. An OFFSET walk over 180,000 rows
  // re-reads everything it has already passed, and the cost grows with each page.
  for (;;) {
    const rows = values.all
      ? await sql<{ id: string; description: string }[]>`
          select id, description from catalogue_items
          where organization_id = ${organization.id} and valid_to is null and id > ${lastId}
          order by id limit ${BATCH}
        `
      : await sql<{ id: string; description: string }[]>`
          select id, description from catalogue_items
          where organization_id = ${organization.id} and valid_to is null and id > ${lastId}
            and (spec_parser_version is distinct from ${SPEC_PARSER_VERSION})
          order by id limit ${BATCH}
        `;
    if (rows.length === 0) break;
    lastId = rows[rows.length - 1]!.id;

    const ids: string[] = [];
    const cpus: (string | null)[] = [];
    const families: (string | null)[] = [];
    const ram: (number | null)[] = [];
    const storage: (number | null)[] = [];
    const gpu: (number | null)[] = [];
    const screen: (number | null)[] = [];
    const colour: (string | null)[] = [];
    const issues: string[] = [];
    const completeness: number[] = [];

    for (const row of rows) {
      const spec = parseSpec(row.description, {
        truncatedAtLength: DESCRIPTION_TRUNCATED_AT,
      });
      ids.push(row.id);
      cpus.push(spec.cpu);
      families.push(spec.cpuFamily);
      ram.push(asInteger(spec.ramGb));
      storage.push(asInteger(spec.storageGb));
      gpu.push(asInteger(spec.gpuGb));
      screen.push(spec.screenIn);
      colour.push(spec.colour);
      issues.push(spec.issues.join(","));
      completeness.push(specCompleteness(spec));
    }

    // One statement per batch. Row-by-row updates would be 180,000 round trips.
    await sql`
      update catalogue_items as item set
        spec_cpu = source.cpu,
        spec_cpu_family = source.cpu_family,
        spec_ram_gb = source.ram_gb,
        spec_storage_gb = source.storage_gb,
        spec_gpu_gb = source.gpu_gb,
        spec_screen_in = source.screen_in,
        spec_colour = source.colour,
        spec_issues = coalesce(string_to_array(nullif(source.issues, ''), ','), '{}')::text[],
        spec_completeness = source.completeness,
        spec_parser_version = ${SPEC_PARSER_VERSION},
        spec_parsed_at = now()
      from (
        select * from unnest(
          ${ids}::uuid[], ${cpus}::text[], ${families}::text[], ${ram}::int[],
          ${storage}::int[], ${gpu}::int[], ${screen}::numeric[], ${colour}::text[],
          ${issues}::text[], ${completeness}::smallint[]
        ) as t(id, cpu, cpu_family, ram_gb, storage_gb, gpu_gb, screen_in, colour, issues, completeness)
      ) as source
      where item.id = source.id
    `;

    parsed += rows.length;
    process.stdout.write(`\r  parsed ${parsed.toLocaleString()}`);
  }

  console.log(
    parsed === 0
      ? "Every current row is already read by this parser version."
      : `\nParsed ${parsed.toLocaleString()} rows in ${((Date.now() - startedAt) / 1000).toFixed(1)}s.`,
  );

  const health = await sql<{ issue: string; item_count: string }[]>`
    select issue, count(*) as item_count
    from catalogue_items as item
    cross join lateral unnest(
      case when cardinality(item.spec_issues) = 0 then array['readable'] else item.spec_issues end
    ) as issue
    where item.organization_id = ${organization.id} and item.valid_to is null
      and item.spec_parsed_at is not null
    group by issue order by count(*) desc
  `;
  for (const row of health) {
    console.log(`  ${row.issue.padEnd(18)} ${Number(row.item_count).toLocaleString()}`);
  }
} finally {
  await sql.end();
}
