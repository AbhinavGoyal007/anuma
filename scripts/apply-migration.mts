/**
 * Applying named migration files to the database.
 *
 * `supabase db push` is not used here: it works out for itself which migrations
 * it thinks are outstanding, and this project's history was applied by hand, so
 * it tries to replay migrations that already ran and fails. Naming the files
 * explicitly makes the operation say exactly what it will do.
 *
 * Each file runs inside its own transaction, so a migration either lands whole
 * or not at all. They run in the order given.
 *
 * Usage:
 *   node --env-file=.env.local --experimental-strip-types \
 *     scripts/apply-migration.mts 20260812090000_some_change.sql [...]
 */

import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import postgres from "postgres";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Name at least one migration file from supabase/migrations.");
  process.exit(1);
}

const databaseUrl = process.env.SUPABASE_DB_URL;
if (!databaseUrl) {
  console.error("SUPABASE_DB_URL is not set. Run with --env-file=.env.local");
  process.exit(1);
}

const sql = postgres(databaseUrl, { prepare: false, max: 1, connect_timeout: 30 });

try {
  await sql`set statement_timeout = '600s'`;
  for (const file of files) {
    const path = file.includes("/") ? resolve(file) : resolve("supabase/migrations", file);
    const statements = readFileSync(path, "utf8");
    const startedAt = Date.now();
    await sql.begin((tx) => [tx.unsafe(statements)]);
    console.log(`Applied ${basename(path)} in ${((Date.now() - startedAt) / 1000).toFixed(1)}s.`);
  }
} finally {
  await sql.end();
}
