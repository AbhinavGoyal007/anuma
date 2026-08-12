import postgres from "postgres";
const sql = postgres(process.env.SUPABASE_DB_URL, { prepare: false, max: 1, connect_timeout: 30 });
for (let i = 0; i < 10; i++) {
  const act = await sql`select now()-query_start as ran from pg_stat_activity where pid<>pg_backend_pid() and state='active' and query ilike '%apply_catalogue%'`;
  if (act.length === 0) { console.log("APPLY FINISHED"); break; }
  if (i === 9) console.log(`still running ${String(act[0].ran).slice(0,12)}`);
  await new Promise(r => setTimeout(r, 30000));
}
const [c] = await sql`select count(*)::int n from catalogue_items where valid_to is null`;
const [imp] = await sql`select status, added_count, error_message from catalogue_imports order by created_at desc limit 1`;
console.log("current items:", c.n.toLocaleString(), "| import:", imp.status, imp.added_count, imp.error_message ?? "");
await sql.end();
