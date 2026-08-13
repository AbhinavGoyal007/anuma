/**
 * Comparing the interaction records two transcripts produced.
 *
 * This is the question the whole transcription exercise was a proxy for. Entity
 * recall asked whether "RTX 4060" survived the transcriber; this asks whether
 * the record a category head actually reads came out the same — the budget, the
 * products, the objections, the decision state, and whether the extractor
 * abstained in the same places.
 *
 * Two records are compared field by field, and both against the values the test
 * pack expects. An abstention that matches an abstention is agreement, not a
 * gap: the product's rule is that a correct "not stated" beats an invented fact,
 * so a transcript that leads the extractor to abstain where it should is right.
 *
 * Usage:
 *   node --env-file=.env.local --experimental-strip-types \
 *     scripts/asr-eval/compare-records.mts --org "AG LLC"
 */

import { parseArgs } from "node:util";

import postgres from "postgres";

const { values } = parseArgs({
  options: { org: { type: "string", default: "AG LLC" } },
});

const sql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false, max: 1 });

type Row = {
  title: string;
  provider: string;
  record_id: string;
  field_key: string;
  value_text: string | null;
  value_amount_minor: string | null;
  abstention: string | null;
};

try {
  const [organization] = await sql<{ id: string }[]>`
    select id from organizations where name = ${values.org!} order by created_at limit 1
  `;
  if (!organization) throw new Error(`No organization named ${values.org}.`);

  // The most recent completed record per (conversation, provider). A conversation
  // that has been extracted twice from the same provider is one experiment run
  // twice, not two results.
  const rows = await sql<Row[]>`
    with newest as (
      select distinct on (c.title, tr.provider)
             c.title, tr.provider, r.id as record_id
      from interaction_records r
      join conversations c on c.id = r.conversation_id
      join transcription_runs tr on tr.conversation_id = c.id and tr.status = 'completed'
      where r.organization_id = ${organization.id}
        and r.status = 'completed'
        and c.title like 'Script%'
      order by c.title, tr.provider, r.created_at desc
    )
    select newest.title, newest.provider, newest.record_id,
           v.field_key, v.value_text, v.value_amount_minor, v.abstention
    from newest
    join interaction_field_values v on v.interaction_record_id = newest.record_id
    order by newest.title, v.field_key, newest.provider
  `;

  const byScript = new Map<string, Map<string, Map<string, string>>>();
  for (const row of rows) {
    const value = row.abstention
      ? `[${row.abstention}]`
      : row.value_amount_minor
        ? `₹${Number(row.value_amount_minor) / 100}`
        : (row.value_text ?? "");
    const script = byScript.get(row.title) ?? new Map();
    const field = script.get(row.field_key) ?? new Map();
    // A field can hold several values; they are joined so the comparison sees
    // the whole answer rather than whichever row happened to sort first.
    field.set(row.provider, [field.get(row.provider), value].filter(Boolean).join(" | "));
    script.set(row.field_key, field);
    byScript.set(row.title, script);
  }

  const providers = [...new Set(rows.map((r) => r.provider))].sort();
  console.log(`providers found: ${providers.join(", ")}\n`);

  let agree = 0;
  let differ = 0;
  const differences: string[] = [];

  for (const [title, fields] of [...byScript].sort()) {
    const lines: string[] = [];
    for (const [key, byProvider] of [...fields].sort()) {
      if (byProvider.size < 2) continue;
      const [a, b] = providers.map((p) => byProvider.get(p) ?? "—");
      const same = (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
      if (same) {
        agree += 1;
      } else {
        differ += 1;
        lines.push(`    ${key}\n      ${providers[0]}: ${a}\n      ${providers[1]}: ${b}`);
      }
    }
    console.log(`${title}: ${fields.size} fields, ${lines.length} differ`);
    differences.push(...lines);
  }

  console.log(
    `\nfields compared: ${agree + differ} | identical: ${agree} (${((agree / Math.max(agree + differ, 1)) * 100).toFixed(0)}%) | differ: ${differ}`,
  );
  if (differences.length) {
    console.log("\nWhere they differ:\n");
    console.log(differences.slice(0, 40).join("\n"));
  }
} finally {
  await sql.end();
}
