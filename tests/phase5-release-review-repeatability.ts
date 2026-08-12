import { readFileSync } from "node:fs";

import postgres from "postgres";

type AcceptanceArtifact = {
  fixture: { analysisRunId: string; conversationId: string; organizationId: string };
};

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

for (const name of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SARVAM_API_KEY",
  "OPENAI_API_KEY",
  "ANUMA_ANALYSIS_MODEL",
]) {
  process.env[name] = environment(name);
}

const artifact = JSON.parse(
  readFileSync("tests/phase5-hosted-review-acceptance-result.json", "utf8"),
) as AcceptanceArtifact;
const sql = postgres(environment("SUPABASE_DB_URL"), { max: 1, prepare: false, ssl: "require" });

try {
  const [membership] = await sql`
    select user_id
    from public.organization_memberships
    where organization_id = ${artifact.fixture.organizationId}
      and role = 'admin'
    order by created_at
    limit 1
  `;
  if (!membership) throw new Error("Hosted acceptance administrator was not found.");

  const [requested] = await sql.begin(async (transaction) => {
    await transaction`select set_config('request.jwt.claim.sub', ${membership.user_id}, true)`;
    await transaction.unsafe("set local role authenticated");
    return transaction`
      select public.request_interaction_review(
        ${artifact.fixture.conversationId}, 'manual'
      ) as id
    `;
  });
  if (!requested?.id) throw new Error("Manual release review could not be requested.");

  const { processInteractionReview } = await import("../src/modules/review/processing");
  await processInteractionReview(requested.id);

  const [run] = await sql`
    select id, status, semantic_request_count
    from public.review_runs
    where id = ${requested.id}
  `;
  const checks = await sql`
    select definition.name, evaluation.result_state
    from public.check_evaluations as evaluation
    join public.check_definitions as definition on definition.id = evaluation.check_definition_id
    where evaluation.review_run_id = ${requested.id}
    order by definition.name
  `;
  const [scorecard] = await sql`
    select score_percent, applicable_check_count, evaluated_check_count, insufficient_evidence_count
    from public.scorecard_evaluations
    where review_run_id = ${requested.id}
  `;
  if (run.status !== "completed" || checks.length !== 8 || run.semantic_request_count > 1) {
    throw new Error("Release review did not persist a complete bounded result.");
  }
  console.log(
    JSON.stringify(
      {
        checks,
        reviewRunId: run.id,
        scorecard,
        semanticRequestCount: run.semantic_request_count,
        status: run.status,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end();
}
