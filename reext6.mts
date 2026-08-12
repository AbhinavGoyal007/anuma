import postgres from "postgres";
import { buildInteractionRecord } from "@/modules/interaction-record/persistence";
import { resolveExtractionFields } from "@/modules/field-library/repository";
const sql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false });
const [org] = await sql`select id from organizations where name='AG LLC' limit 1`;
const fields = await resolveExtractionFields(org.id);
console.log(`library: ${fields.length} enabled; has red_flags=${fields.some(f=>f.key==="red_flags")}`);
const convos = await sql`select id, title from conversations where organization_id=${org.id} and active_speaker_mapping_version_id is not null order by created_at`;
for (const c of convos) {
  try {
    const res = await buildInteractionRecord(c.id);
    const rf = await sql`select value_text, label from interaction_field_values where interaction_record_id=${res.recordId} and field_key='red_flags' and abstention is null`;
    console.log(`[${c.title}] red_flags(${rf.length}): ${rf.map(r=>`[${r.label}] ${r.value_text}`).join(" | ")||"— none"}`);
  } catch(e){ console.log(`[${c.title}] skip: ${e.message.slice(0,50)}`); }
}
// metric version + rate
const m = await sql`select distinct on (conversation_id) algorithm_version, red_flag_count from interaction_metrics where organization_id=${org.id} order by conversation_id, computed_at desc`;
console.log(`\nversions: ${[...new Set(m.map(r=>r.algorithm_version))].join(",")} | red-flag rate: ${m.filter(r=>r.red_flag_count>0).length}/${m.length}`);
await sql.end();
