import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import postgres from "postgres";

type RetainedObservation = {
  amountMajor: number | null;
  currency: string | null;
  evidenceSegmentIds: string[];
  key: string;
  text: string | null;
  type: string;
};

type Fixture = {
  cases: {
    heavy_hinglish: {
      raw: RetainedObservation[];
      segments: Array<{ id: string; speaker: "customer" | "representative"; text: string }>;
    };
  };
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

const fixture = JSON.parse(
  readFileSync("tests/phase5-multilingual-acceptance.json", "utf8"),
) as Fixture;
const source = fixture.cases.heavy_hinglish;
const segmentIdByRetainedId = new Map(source.segments.map((segment) => [segment.id, randomUUID()]));
const sql = postgres(environment("SUPABASE_DB_URL"), { max: 1, prepare: false, ssl: "require" });
const ids = {
  analysis: randomUUID(),
  conversation: randomUUID(),
  customer: randomUUID(),
  location: randomUUID(),
  membership: randomUUID(),
  organization: randomUUID(),
  recording: randomUUID(),
  representative: randomUUID(),
  speakerMapping: randomUUID(),
  team: randomUUID(),
  transcription: randomUUID(),
  user: randomUUID(),
};

async function asAdmin<T>(action: (tx: postgres.TransactionSql) => Promise<T>) {
  return sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claim.sub', ${ids.user}, true)`;
    await tx.unsafe("set local role authenticated");
    return action(tx);
  });
}

async function setupFixture() {
  await sql`
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
    values (${ids.user}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      ${`phase5-hosted-${ids.user}@anuma.invalid`}, '', now(), now(), now())
  `;
  await sql`
    insert into public.organizations (id, name, slug, country_code, default_currency, timezone)
    values (${ids.organization}, 'Synthetic Phase 5 Hosted Acceptance', ${`phase5-hosted-${ids.organization.slice(0, 8)}`}, 'IN', 'INR', 'Asia/Kolkata')
  `;
  await sql`
    insert into public.organization_memberships (id, organization_id, user_id, role)
    values (${ids.membership}, ${ids.organization}, ${ids.user}, 'admin')
  `;
  await sql`
    insert into public.locations (id, organization_id, name, location_type)
    values (${ids.location}, ${ids.organization}, 'Synthetic acceptance location', 'store')
  `;
  await sql`
    insert into public.teams (id, organization_id, name)
    values (${ids.team}, ${ids.organization}, 'Synthetic acceptance team')
  `;
  await sql`
    insert into public.member_assignments (organization_id, membership_id, location_id, team_id, effective_from)
    values (${ids.organization}, ${ids.membership}, ${ids.location}, ${ids.team}, now() - interval '1 day')
  `;
  await sql`
    insert into public.conversations (id, organization_id, created_by_membership_id, representative_membership_id, location_id, team_id, vertical, started_at, lifecycle_status, title)
    values (${ids.conversation}, ${ids.organization}, ${ids.membership}, ${ids.membership}, ${ids.location}, ${ids.team}, 'electronics', now(), 'draft', 'Synthetic Heavy Hinglish acceptance')
  `;
  await sql`
    insert into public.conversation_participants (id, organization_id, conversation_id, role, membership_id, display_label)
    values
      (${ids.representative}, ${ids.organization}, ${ids.conversation}, 'representative', ${ids.membership}, 'Representative'),
      (${ids.customer}, ${ids.organization}, ${ids.conversation}, 'customer', null, 'Customer')
  `;
  await sql`
    insert into public.recordings (id, organization_id, conversation_id, storage_bucket, storage_object_path, mime_type, file_size_bytes, status, created_by_membership_id)
    values (${ids.recording}, ${ids.organization}, ${ids.conversation}, 'conversation-audio', ${`${ids.organization}/${ids.conversation}/${ids.recording}/synthetic.webm`}, 'audio/webm', 1, 'uploaded', ${ids.membership})
  `;
  await sql`
    insert into public.transcription_runs (id, organization_id, conversation_id, recording_id, provider, model, status)
    values (${ids.transcription}, ${ids.organization}, ${ids.conversation}, ${ids.recording}, 'acceptance-fixture', 'retained-live-phase4-output', 'completed')
  `;
  for (const [sequence, segment] of source.segments.entries()) {
    await sql`
      insert into public.transcript_segments (id, organization_id, conversation_id, transcription_run_id, sequence_number, provider_speaker_identifier, start_milliseconds, end_milliseconds, original_text)
      values (${segmentIdByRetainedId.get(segment.id)!}, ${ids.organization}, ${ids.conversation}, ${ids.transcription}, ${sequence}, ${segment.speaker === "customer" ? "customer_1" : "representative_1"}, ${sequence * 1000}, ${(sequence + 1) * 1000}, ${segment.text})
    `;
  }
  const segmentIds = source.segments.map((segment) => segmentIdByRetainedId.get(segment.id)!);
  await sql`
    insert into public.speaker_mapping_versions (id, organization_id, conversation_id, transcription_run_id, version_number, source, status, created_by_membership_id)
    values (${ids.speakerMapping}, ${ids.organization}, ${ids.conversation}, ${ids.transcription}, 1, 'human', 'active', ${ids.membership})
  `;
  await sql`
    insert into public.speaker_mapping_entries (organization_id, conversation_id, transcription_run_id, speaker_mapping_version_id, provider_speaker_identifier, participant_role, participant_id)
    values
      (${ids.organization}, ${ids.conversation}, ${ids.transcription}, ${ids.speakerMapping}, 'customer_1', 'customer', ${ids.customer}),
      (${ids.organization}, ${ids.conversation}, ${ids.transcription}, ${ids.speakerMapping}, 'representative_1', 'representative', ${ids.representative})
  `;
  await sql`
    insert into public.analysis_runs (id, organization_id, conversation_id, source_transcription_run_id, speaker_mapping_version_id, provider, model, prompt_version, taxonomy_version, domain_pack_version, status)
    values (${ids.analysis}, ${ids.organization}, ${ids.conversation}, ${ids.transcription}, ${ids.speakerMapping}, 'openai', 'gpt-5.6-luna', 'phase4-retained', 'phase4', 'electronics', 'completed')
  `;
  const observations = source.raw.map((observation) => ({
    ...observation,
    amountMinor:
      observation.amountMajor === null || observation.currency !== "INR"
        ? null
        : Math.round(observation.amountMajor * 100),
    attributes: {},
    evidenceSegmentIds: observation.evidenceSegmentIds.map((id) => segmentIdByRetainedId.get(id)!),
  }));
  await sql`select * from public.persist_analysis_result(${ids.analysis}, ${sql.json([{ metric_key: "interaction_duration_ms", numeric_value: 4000, unit: "milliseconds" }])}, ${sql.json(observations)})`;
  await sql`
    update public.conversations
    set active_transcription_run_id = ${ids.transcription}, active_speaker_mapping_version_id = ${ids.speakerMapping}, active_analysis_run_id = ${ids.analysis}
    where id = ${ids.conversation}
  `;
  await asAdmin((tx) => tx`select public.seed_starter_electronics_checks(${ids.organization})`);
  return segmentIds;
}

async function requestReview(trigger: "initial" | "manual") {
  const [row] = await asAdmin(
    (tx) => tx`select public.request_interaction_review(${ids.conversation}, ${trigger}) as id`,
  );
  return row.id as string;
}

async function readResult(reviewRunId: string) {
  const checks = await sql`
    select definition.name, definition.evaluation_strategy, evaluation.result_state, evaluation.explanation, evaluation.applicability_reason,
      coalesce(array_agg(reference.transcript_segment_id) filter (where reference.transcript_segment_id is not null), '{}') as evidence_segment_ids
    from public.check_evaluations evaluation
    join public.check_definitions definition on definition.id = evaluation.check_definition_id
    left join public.evidence_references reference on reference.evidence_group_id = evaluation.evidence_group_id
    where evaluation.review_run_id = ${reviewRunId}
    group by definition.name, definition.evaluation_strategy, evaluation.result_state, evaluation.explanation, evaluation.applicability_reason
    order by definition.name
  `;
  const [run] =
    await sql`select id, semantic_request_count, status from public.review_runs where id = ${reviewRunId}`;
  const scorecards = await sql`
    select score_percent, applicable_check_count, evaluated_check_count, insufficient_evidence_count
    from public.scorecard_evaluations where review_run_id = ${reviewRunId}
  `;
  return { checks, run, scorecards };
}

try {
  await setupFixture();
  const { processInteractionReview } = await import("../src/modules/review/processing");
  const reviewRunA = await requestReview("initial");
  await processInteractionReview(reviewRunA);
  const resultA = await readResult(reviewRunA);
  const reviewRunB = await requestReview("manual");
  await processInteractionReview(reviewRunB);
  const resultB = await readResult(reviewRunB);
  if (resultA.checks.length !== 8 || resultB.checks.length !== 8) {
    throw new Error("Each immutable review run must persist all eight starter checks.");
  }
  if (resultA.run.semantic_request_count > 1 || resultB.run.semantic_request_count > 1) {
    throw new Error("A review run made more than one semantic request.");
  }
  const [invalidEvidence] = await sql`
    select count(*)::integer as count
    from public.check_evaluations evaluation
    join public.evidence_references reference on reference.evidence_group_id = evaluation.evidence_group_id
    where evaluation.review_run_id in (${reviewRunA}, ${reviewRunB})
      and (reference.organization_id <> ${ids.organization}
        or reference.conversation_id <> ${ids.conversation}
        or reference.transcription_run_id <> ${ids.transcription})
  `;
  if (invalidEvidence.count !== 0)
    throw new Error("Review evidence escaped its source transcript lineage.");
  const history = await sql`
    select review_run_id, count(*)::integer as check_count
    from public.check_evaluations where review_run_id in (${reviewRunA}, ${reviewRunB})
    group by review_run_id order by review_run_id
  `;
  if (history.length !== 2 || history.some((row) => row.check_count !== 8)) {
    throw new Error("Manual re-evaluation did not preserve two immutable review histories.");
  }
  console.log(JSON.stringify({ fixture: ids, reviewRunA, resultA, reviewRunB, resultB }, null, 2));
} finally {
  await sql.end();
}
