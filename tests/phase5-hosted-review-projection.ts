import { readFileSync } from "node:fs";

import postgres from "postgres";

function environment(name: string) {
  const line = readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith(`${name}=`));
  const value = line
    ?.slice(name.length + 1)
    .trim()
    .replace(/^['"]|['"]$/g, "");
  if (!value) throw new Error(`${name} is required in .env.local.`);
  return value;
}

const sql = postgres(environment("SUPABASE_DB_URL"), { max: 1, prepare: false, ssl: "require" });
try {
  const [organization] = await sql`
    select id from public.organizations
    where name = 'Synthetic Phase 5 Hosted Acceptance'
    order by created_at desc limit 1
  `;
  if (!organization) throw new Error("Hosted acceptance fixture was not found.");
  const [reviewRun] = await sql`
    select id from public.review_runs where organization_id = ${organization.id}
    order by created_at desc limit 1
  `;
  const observations = await sql`
    select observation_type as type, value_text as text, value_amount_minor as "amountMinor", currency_code as "currencyCode"
    from public.structured_observations where organization_id = ${organization.id} order by created_at
  `;
  const checks = await sql`
    select evaluation.id, definition.name, definition.description, definition.purpose, evaluation.result_state as state,
      evaluation.explanation, evaluation.applicability_reason as "applicabilityReason",
      (select transcript_segment_id from public.evidence_references where evidence_group_id = evaluation.evidence_group_id order by sequence_number limit 1) as "evidenceSegmentId"
    from public.check_evaluations evaluation join public.check_definitions definition on definition.id = evaluation.check_definition_id
    where evaluation.review_run_id = ${reviewRun.id} order by definition.created_at
  `;
  const { notesFor, coachingFor } = await import("../src/modules/review/projections");
  console.log(
    JSON.stringify(
      {
        notes: notesFor(observations),
        coaching: coachingFor({ status: "completed", checks, scorecards: [] }, observations),
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end();
}
