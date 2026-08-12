import { readFileSync } from "node:fs";
import postgres from "postgres";

function readDatabaseUrl() {
  const line = readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith("SUPABASE_DB_URL="));

  if (!line) throw new Error("SUPABASE_DB_URL is missing from .env.local.");

  return line.slice(line.indexOf("=") + 1).trim().replace(/^['\"]|['\"]$/g, "");
}

const ids = {
  orgA: "10000000-0000-4000-8000-000000000001",
  orgB: "10000000-0000-4000-8000-000000000002",
  adminAUser: "20000000-0000-4000-8000-000000000001",
  repAUser: "20000000-0000-4000-8000-000000000002",
  otherRepAUser: "20000000-0000-4000-8000-000000000003",
  managerAUser: "20000000-0000-4000-8000-000000000004",
  adminBUser: "20000000-0000-4000-8000-000000000005",
  repBUser: "20000000-0000-4000-8000-000000000006",
  bootstrapUser: "20000000-0000-4000-8000-000000000007",
  adminAMembership: "30000000-0000-4000-8000-000000000001",
  repAMembership: "30000000-0000-4000-8000-000000000002",
  otherRepAMembership: "30000000-0000-4000-8000-000000000003",
  managerAMembership: "30000000-0000-4000-8000-000000000004",
  adminBMembership: "30000000-0000-4000-8000-000000000005",
  repBMembership: "30000000-0000-4000-8000-000000000006",
  locationA1: "40000000-0000-4000-8000-000000000001",
  locationA2: "40000000-0000-4000-8000-000000000002",
  locationB: "40000000-0000-4000-8000-000000000003",
  teamA1: "50000000-0000-4000-8000-000000000001",
  teamA2: "50000000-0000-4000-8000-000000000002",
  teamB: "50000000-0000-4000-8000-000000000003",
  conversationA: "60000000-0000-4000-8000-000000000001",
  otherConversationA: "60000000-0000-4000-8000-000000000002",
  conversationB: "60000000-0000-4000-8000-000000000003",
  recordingA: "70000000-0000-4000-8000-000000000001",
  recordingB: "70000000-0000-4000-8000-000000000002",
  otherRecordingA: "70000000-0000-4000-8000-000000000003",
  managerAttemptRecordingA: "70000000-0000-4000-8000-000000000004",
  adminRecordingA: "70000000-0000-4000-8000-000000000005",
  representativeUploadRecordingA: "70000000-0000-4000-8000-000000000006",
  transcriptionA: "80000000-0000-4000-8000-000000000001",
  transcriptionB: "80000000-0000-4000-8000-000000000002",
  segmentA: "90000000-0000-4000-8000-000000000001",
  segmentB: "90000000-0000-4000-8000-000000000002",
  transcriptionOtherA: "80000000-0000-4000-8000-000000000003",
  analysisA: "a0000000-0000-4000-8000-000000000001",
  analysisOtherA: "a0000000-0000-4000-8000-000000000002",
  analysisB: "a0000000-0000-4000-8000-000000000003",
  evidenceA: "a1000000-0000-4000-8000-000000000001",
  evidenceB: "a1000000-0000-4000-8000-000000000002",
  observationA: "a2000000-0000-4000-8000-000000000001",
  observationB: "a2000000-0000-4000-8000-000000000002",
  checkA: "b0000000-0000-4000-8000-000000000001",
  checkB: "b0000000-0000-4000-8000-000000000002",
  scorecardA: "c0000000-0000-4000-8000-000000000001",
  scorecardB: "c0000000-0000-4000-8000-000000000002",
  reviewA: "d0000000-0000-4000-8000-000000000001",
  reviewOtherA: "d0000000-0000-4000-8000-000000000002",
  reviewB: "d0000000-0000-4000-8000-000000000003",
};

const sql = postgres(readDatabaseUrl(), {
  max: 1,
  prepare: false,
  ssl: "require",
  onnotice: () => {},
});
const rollbackSignal = new Error("ROLLBACK_SECURITY_TEST_FIXTURES");
const passed = [];

function pass(name) {
  passed.push(name);
  console.log(`PASS ${name}`);
}

function assertEqual(actual, expected, name) {
  if (actual !== expected) throw new Error(`${name}: expected ${expected}, received ${actual}`);
  pass(name);
}

async function assumeRole(tx, role, userId = null) {
  await tx.unsafe("reset role");
  await tx`select set_config('request.jwt.claim.sub', ${userId ?? ""}, true)`;
  await tx.unsafe(`set local role ${role}`);
}

async function count(tx, query) {
  const rows = await query;
  return Number(rows[0].count);
}

async function expectDenied(tx, name, action) {
  const savepoint = `denied_${passed.length}`;
  await tx.unsafe(`savepoint ${savepoint}`);
  let denied = false;

  try {
    await action();
  } catch {
    denied = true;
  }

  await tx.unsafe(`rollback to savepoint ${savepoint}`);
  await tx.unsafe(`release savepoint ${savepoint}`);

  if (!denied) throw new Error(`${name}: operation unexpectedly succeeded`);
  pass(name);
}

try {
  await sql.begin(async (tx) => {
    const tenantTables = [
      "organizations",
      "organization_memberships",
      "locations",
      "teams",
      "member_assignments",
      "conversations",
      "conversation_participants",
      "consent_records",
      "recordings",
      "transcription_runs",
      "transcript_segments",
      "speaker_mapping_versions",
      "speaker_mapping_entries",
      "analysis_runs",
      "structured_observations",
      "observation_corrections",
      "evidence_groups",
      "evidence_references",
      "outcome_events",
      "conversation_quality_assessments",
      "check_definitions",
      "check_evaluations",
      "scorecard_definitions",
      "scorecard_definition_checks",
      "scorecard_evaluations",
      "review_runs",
    ];

    const rlsRows = await tx`
      select relname, relrowsecurity
      from pg_class
      join pg_namespace on pg_namespace.oid = pg_class.relnamespace
      where pg_namespace.nspname = 'public' and relname = any(${tenantTables})
    `;
    assertEqual(rlsRows.length, tenantTables.length, "all tenant tables exist");
    assertEqual(rlsRows.every((row) => row.relrowsecurity), true, "RLS enabled on every tenant table");

    const bucketRows = await tx`
      select public from storage.buckets where id = 'conversation-audio'
    `;
    assertEqual(bucketRows.length, 1, "conversation audio bucket exists");
    assertEqual(bucketRows[0].public, false, "conversation audio bucket is private");

    const userIds = [
      ids.adminAUser,
      ids.repAUser,
      ids.otherRepAUser,
      ids.managerAUser,
      ids.adminBUser,
      ids.repBUser,
      ids.bootstrapUser,
    ];
    for (const [index, userId] of userIds.entries()) {
      await tx`
        insert into auth.users (
          id, instance_id, aud, role, email, encrypted_password,
          email_confirmed_at, created_at, updated_at
        ) values (
          ${userId}, '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', ${`phase2-${index}@anuma.invalid`}, '', now(), now(), now()
        )
      `;
    }

    await tx`
      insert into public.organizations (id, name, slug) values
        (${ids.orgA}, 'Security Test Organization A', 'security-test-a'),
        (${ids.orgB}, 'Security Test Organization B', 'security-test-b')
    `;
    await tx`
      insert into public.organization_memberships (id, organization_id, user_id, role) values
        (${ids.adminAMembership}, ${ids.orgA}, ${ids.adminAUser}, 'admin'),
        (${ids.repAMembership}, ${ids.orgA}, ${ids.repAUser}, 'representative'),
        (${ids.otherRepAMembership}, ${ids.orgA}, ${ids.otherRepAUser}, 'representative'),
        (${ids.managerAMembership}, ${ids.orgA}, ${ids.managerAUser}, 'manager'),
        (${ids.adminBMembership}, ${ids.orgB}, ${ids.adminBUser}, 'admin'),
        (${ids.repBMembership}, ${ids.orgB}, ${ids.repBUser}, 'representative')
    `;
    await tx`
      insert into public.locations (id, organization_id, name, location_type) values
        (${ids.locationA1}, ${ids.orgA}, 'A Showroom', 'showroom'),
        (${ids.locationA2}, ${ids.orgA}, 'A Store', 'store'),
        (${ids.locationB}, ${ids.orgB}, 'B Store', 'store')
    `;
    await tx`
      insert into public.teams (id, organization_id, name) values
        (${ids.teamA1}, ${ids.orgA}, 'A Showroom Team'),
        (${ids.teamA2}, ${ids.orgA}, 'A Store Team'),
        (${ids.teamB}, ${ids.orgB}, 'B Team')
    `;
    await tx`
      insert into public.member_assignments (
        organization_id, membership_id, location_id, team_id, effective_from
      ) values
        (${ids.orgA}, ${ids.repAMembership}, ${ids.locationA1}, ${ids.teamA1}, now() - interval '1 day'),
        (${ids.orgA}, ${ids.otherRepAMembership}, ${ids.locationA2}, ${ids.teamA2}, now() - interval '1 day'),
        (${ids.orgA}, ${ids.managerAMembership}, ${ids.locationA1}, ${ids.teamA1}, now() - interval '1 day'),
        (${ids.orgB}, ${ids.repBMembership}, ${ids.locationB}, ${ids.teamB}, now() - interval '1 day')
    `;
    await tx`
      insert into public.conversations (
        id, organization_id, created_by_membership_id, representative_membership_id,
        location_id, team_id, vertical, started_at, lifecycle_status
      ) values
        (${ids.conversationA}, ${ids.orgA}, ${ids.repAMembership}, ${ids.repAMembership}, ${ids.locationA1}, ${ids.teamA1}, 'automotive', now(), 'draft'),
        (${ids.otherConversationA}, ${ids.orgA}, ${ids.otherRepAMembership}, ${ids.otherRepAMembership}, ${ids.locationA2}, ${ids.teamA2}, 'electronics', now(), 'draft'),
        (${ids.conversationB}, ${ids.orgB}, ${ids.repBMembership}, ${ids.repBMembership}, ${ids.locationB}, ${ids.teamB}, 'electronics', now(), 'draft')
    `;
    await tx`
      insert into public.recordings (
        id, organization_id, conversation_id, storage_object_path, mime_type,
        file_size_bytes, status, created_by_membership_id
      ) values
        (${ids.recordingA}, ${ids.orgA}, ${ids.conversationA}, ${`${ids.orgA}/${ids.conversationA}/${ids.recordingA}/audio.webm`}, 'audio/webm', 128, 'uploaded', ${ids.repAMembership}),
        (${ids.recordingB}, ${ids.orgB}, ${ids.conversationB}, ${`${ids.orgB}/${ids.conversationB}/${ids.recordingB}/audio.webm`}, 'audio/webm', 128, 'uploaded', ${ids.repBMembership}),
        (${ids.otherRecordingA}, ${ids.orgA}, ${ids.otherConversationA}, ${`${ids.orgA}/${ids.otherConversationA}/${ids.otherRecordingA}/audio.webm`}, 'audio/webm', 128, 'pending', ${ids.otherRepAMembership}),
        (${ids.managerAttemptRecordingA}, ${ids.orgA}, ${ids.conversationA}, ${`${ids.orgA}/${ids.conversationA}/${ids.managerAttemptRecordingA}/audio.webm`}, 'audio/webm', 128, 'pending', ${ids.repAMembership}),
        (${ids.adminRecordingA}, ${ids.orgA}, ${ids.conversationA}, ${`${ids.orgA}/${ids.conversationA}/${ids.adminRecordingA}/audio.webm`}, 'audio/webm', 128, 'pending', ${ids.adminAMembership}),
        (${ids.representativeUploadRecordingA}, ${ids.orgA}, ${ids.conversationA}, ${`${ids.orgA}/${ids.conversationA}/${ids.representativeUploadRecordingA}/audio.webm`}, 'audio/webm', 128, 'pending', ${ids.repAMembership})
    `;
    await tx`
      insert into public.transcription_runs (
        id, organization_id, conversation_id, recording_id, provider, model, status
      ) values
        (${ids.transcriptionA}, ${ids.orgA}, ${ids.conversationA}, ${ids.recordingA}, 'fixture', 'fixture-v1', 'completed'),
        (${ids.transcriptionB}, ${ids.orgB}, ${ids.conversationB}, ${ids.recordingB}, 'fixture', 'fixture-v1', 'completed')
    `;
    await tx`
      insert into public.transcription_runs (
        id, organization_id, conversation_id, recording_id, provider, model, status
      ) values
        (${ids.transcriptionOtherA}, ${ids.orgA}, ${ids.otherConversationA}, ${ids.otherRecordingA}, 'fixture', 'fixture-v1', 'completed')
    `;
    await tx`
      insert into public.transcript_segments (
        id, organization_id, conversation_id, transcription_run_id,
        sequence_number, provider_speaker_identifier, start_milliseconds,
        end_milliseconds, original_text
      ) values
        (${ids.segmentA}, ${ids.orgA}, ${ids.conversationA}, ${ids.transcriptionA}, 0, 'speaker_0', 0, 1000, 'Fixture A'),
        (${ids.segmentB}, ${ids.orgB}, ${ids.conversationB}, ${ids.transcriptionB}, 0, 'speaker_0', 0, 1000, 'Fixture B')
    `;
    await tx`
      insert into public.outcome_events (
        organization_id, conversation_id, event_type, occurred_at,
        source, created_by_membership_id
      ) values
        (${ids.orgA}, ${ids.conversationA}, 'test_drive', now(), 'manual', ${ids.repAMembership}),
        (${ids.orgB}, ${ids.conversationB}, 'purchased', now(), 'manual', ${ids.repBMembership})
    `;
    await tx`
      insert into public.analysis_runs (
        id, organization_id, conversation_id, source_transcription_run_id,
        provider, model, prompt_version, taxonomy_version, domain_pack_version, status
      ) values
        (${ids.analysisA}, ${ids.orgA}, ${ids.conversationA}, ${ids.transcriptionA}, 'fixture', 'fixture-v1', 'fixture', 'fixture', 'fixture', 'completed'),
        (${ids.analysisOtherA}, ${ids.orgA}, ${ids.otherConversationA}, ${ids.transcriptionOtherA}, 'fixture', 'fixture-v1', 'fixture', 'fixture', 'fixture', 'completed'),
        (${ids.analysisB}, ${ids.orgB}, ${ids.conversationB}, ${ids.transcriptionB}, 'fixture', 'fixture-v1', 'fixture', 'fixture', 'fixture', 'completed')
    `;
    await tx`
      insert into public.evidence_groups (id, organization_id, conversation_id, purpose, source_analysis_run_id) values
        (${ids.evidenceA}, ${ids.orgA}, ${ids.conversationA}, 'security-observation', ${ids.analysisA}),
        (${ids.evidenceB}, ${ids.orgB}, ${ids.conversationB}, 'security-observation', ${ids.analysisB})
    `;
    await tx`
      insert into public.structured_observations (
        id, organization_id, conversation_id, analysis_run_id, observation_type, normalized_key,
        value_text, attributes, original_model_value, evidence_group_id
      ) values
        (${ids.observationA}, ${ids.orgA}, ${ids.conversationA}, ${ids.analysisA}, 'need', 'fixture-a-need',
          'Fixture need A', '{}'::jsonb, '{}'::jsonb, ${ids.evidenceA}),
        (${ids.observationB}, ${ids.orgB}, ${ids.conversationB}, ${ids.analysisB}, 'need', 'fixture-b-need',
          'Fixture need B', '{}'::jsonb, '{}'::jsonb, ${ids.evidenceB})
    `;
    await tx`
      insert into public.check_definitions (
        id, organization_id, key, name, description, purpose, applicability,
        evaluation_strategy, observation_types, weight, created_by_membership_id
      ) values
        (${ids.checkA}, ${ids.orgA}, 'fixture_check_a', 'Fixture check A', 'Fixture organization A check.', 'scorecard', 'every_interaction', 'observation', '{need}', 1, ${ids.adminAMembership}),
        (${ids.checkB}, ${ids.orgB}, 'fixture_check_b', 'Fixture check B', 'Fixture organization B check.', 'scorecard', 'every_interaction', 'observation', '{need}', 1, ${ids.adminBMembership})
    `;
    await tx`
      insert into public.scorecard_definitions (
        id, organization_id, key, name, check_definition_ids, created_by_membership_id
      ) values
        (${ids.scorecardA}, ${ids.orgA}, 'fixture_scorecard_a', 'Fixture scorecard A', array[${ids.checkA}]::uuid[], ${ids.adminAMembership}),
        (${ids.scorecardB}, ${ids.orgB}, 'fixture_scorecard_b', 'Fixture scorecard B', array[${ids.checkB}]::uuid[], ${ids.adminBMembership})
    `;
    await tx`
      insert into public.scorecard_definition_checks (organization_id, scorecard_definition_id, check_definition_id) values
        (${ids.orgA}, ${ids.scorecardA}, ${ids.checkA}),
        (${ids.orgB}, ${ids.scorecardB}, ${ids.checkB})
    `;
    await tx`
      insert into public.review_runs (
        id, organization_id, conversation_id, analysis_run_id, evaluation_version, trigger_reason,
        configuration_snapshot, status, created_by_membership_id
      ) values
        (${ids.reviewA}, ${ids.orgA}, ${ids.conversationA}, ${ids.analysisA}, 'fixture-a', 'initial', '{"checks":[],"scorecards":[]}'::jsonb, 'completed', ${ids.adminAMembership}),
        (${ids.reviewOtherA}, ${ids.orgA}, ${ids.otherConversationA}, ${ids.analysisOtherA}, 'fixture-other-a', 'initial', '{"checks":[],"scorecards":[]}'::jsonb, 'completed', ${ids.adminAMembership}),
        (${ids.reviewB}, ${ids.orgB}, ${ids.conversationB}, ${ids.analysisB}, 'fixture-b', 'initial', '{"checks":[],"scorecards":[]}'::jsonb, 'completed', ${ids.adminBMembership})
    `;
    await tx`
      insert into public.check_evaluations (
        organization_id, conversation_id, analysis_run_id, check_definition_id, review_run_id,
        evaluation_version, result_state, explanation
      ) values
        (${ids.orgA}, ${ids.conversationA}, ${ids.analysisA}, ${ids.checkA}, ${ids.reviewA}, 'fixture-a', 'met', 'Fixture A result.'),
        (${ids.orgA}, ${ids.otherConversationA}, ${ids.analysisOtherA}, ${ids.checkA}, ${ids.reviewOtherA}, 'fixture-other-a', 'met', 'Fixture other A result.'),
        (${ids.orgB}, ${ids.conversationB}, ${ids.analysisB}, ${ids.checkB}, ${ids.reviewB}, 'fixture-b', 'met', 'Fixture B result.')
    `;
    await tx`
      insert into public.scorecard_evaluations (
        organization_id, conversation_id, analysis_run_id, scorecard_definition_id, review_run_id,
        evaluation_version, score_percent, applicable_check_count, evaluated_check_count, insufficient_evidence_count
      ) values
        (${ids.orgA}, ${ids.conversationA}, ${ids.analysisA}, ${ids.scorecardA}, ${ids.reviewA}, 'fixture-a', 100, 1, 1, 0),
        (${ids.orgB}, ${ids.conversationB}, ${ids.analysisB}, ${ids.scorecardB}, ${ids.reviewB}, 'fixture-b', 100, 1, 1, 0)
    `;
    await tx`
      insert into storage.objects (bucket_id, name) values
        ('conversation-audio', ${`${ids.orgA}/${ids.conversationA}/${ids.recordingA}/audio.webm`}),
        ('conversation-audio', ${`${ids.orgB}/${ids.conversationB}/${ids.recordingB}/audio.webm`})
    `;

    let correctionA;

    await assumeRole(tx, "authenticated", ids.bootstrapUser);
    assertEqual(
      await count(
        tx,
        tx`select count(*) from public.organization_memberships where user_id = ${ids.bootstrapUser}`,
      ),
      0,
      "new authenticated user reads an empty membership list",
    );
    const [bootstrapResult] = await tx`
      select * from public.bootstrap_organization(
        'Atomic Bootstrap Organization', 'IN', 'INR', 'Asia/Kolkata'
      )
    `;
    assertEqual(Boolean(bootstrapResult.organization_id), true, "first organization bootstrap succeeds");
    assertEqual(
      await count(
        tx,
        tx`select count(*) from public.organization_memberships where organization_id = ${bootstrapResult.organization_id} and role = 'admin'`,
      ),
      1,
      "bootstrap creator becomes administrator",
    );
    assertEqual(
      await count(tx, tx`select count(*) from public.organizations where id = ${bootstrapResult.organization_id}`),
      1,
      "bootstrap creator reads the new organization",
    );
    await expectDenied(tx, "bootstrap cannot grant a second arbitrary administrator tenant", () =>
      tx`select * from public.bootstrap_organization('Second Bootstrap', 'IN', 'INR', 'Asia/Kolkata')`,
    );

    await assumeRole(tx, "anon");
    await expectDenied(tx, "anonymous cannot bootstrap an organization", () =>
      tx`select * from public.bootstrap_organization('Anonymous Bootstrap', 'IN', 'INR', 'Asia/Kolkata')`,
    );
    await expectDenied(tx, "anonymous cannot read organizations", () =>
      tx`select count(*) from public.organizations`,
    );
    await expectDenied(tx, "anonymous cannot read conversations", () =>
      tx`select count(*) from public.conversations`,
    );
    assertEqual(
      await count(
        tx,
        tx`select count(*) from storage.objects where bucket_id = 'conversation-audio'`,
      ),
      0,
      "anonymous cannot read private audio objects",
    );
    await expectDenied(tx, "anonymous cannot upload private audio", () => tx`
      insert into storage.objects (bucket_id, name)
      values ('conversation-audio', ${`${ids.orgA}/${ids.conversationA}/${ids.recordingA}/audio.webm`})
    `);

    await assumeRole(tx, "authenticated", ids.repAUser);
    assertEqual(await count(tx, tx`select count(*) from public.organizations where id = ${ids.orgA}`), 1, "representative reads own organization");
    assertEqual(await count(tx, tx`select count(*) from public.organizations where id = ${ids.orgB}`), 0, "representative cannot read another organization");
    assertEqual(await count(tx, tx`select count(*) from public.locations where organization_id = ${ids.orgB}`), 0, "representative cannot read another tenant locations");
    assertEqual(await count(tx, tx`select count(*) from public.teams where organization_id = ${ids.orgB}`), 0, "representative cannot read another tenant teams");
    assertEqual(await count(tx, tx`select count(*) from public.conversations where id = ${ids.conversationA}`), 1, "representative reads own conversation");
    assertEqual(await count(tx, tx`select count(*) from public.conversations where id = ${ids.otherConversationA}`), 0, "representative cannot read peer conversation");
    assertEqual(await count(tx, tx`select count(*) from public.conversations where id = ${ids.conversationB}`), 0, "representative cannot read cross-tenant conversation");
    assertEqual(await count(tx, tx`select count(*) from public.recordings where organization_id = ${ids.orgB}`), 0, "representative cannot read cross-tenant recording metadata");
    assertEqual(await count(tx, tx`select count(*) from public.transcription_runs where organization_id = ${ids.orgB}`), 0, "representative cannot read cross-tenant transcription run");
    assertEqual(await count(tx, tx`select count(*) from public.transcript_segments where organization_id = ${ids.orgB}`), 0, "representative cannot read cross-tenant transcript segment");
    assertEqual(await count(tx, tx`select count(*) from public.outcome_events where organization_id = ${ids.orgB}`), 0, "representative cannot read cross-tenant outcome");
    assertEqual(await count(tx, tx`select count(*) from public.structured_observations where organization_id = ${ids.orgB}`), 0, "representative cannot read cross-tenant observations");
    assertEqual(await count(tx, tx`select count(*) from public.observation_corrections where organization_id = ${ids.orgB}`), 0, "representative cannot read cross-tenant corrections");
    assertEqual(await count(tx, tx`select count(*) from public.check_definitions where organization_id = ${ids.orgB}`), 0, "organization A cannot read organization B check definitions");
    await expectDenied(tx, "non-admin cannot create organization check configuration", () => tx`
      insert into public.check_definitions (
        organization_id, key, name, description, purpose, applicability, evaluation_strategy, observation_types, weight
      ) values (${ids.orgA}, 'rep_config_attack', 'Rep config attack', 'Must be denied.', 'scorecard', 'every_interaction', 'observation', '{need}', 1)
    `);
    await expectDenied(tx, "organization A cannot create config for organization B", () => tx`
      insert into public.check_definitions (
        organization_id, key, name, description, purpose, applicability, evaluation_strategy, observation_types, weight
      ) values (${ids.orgB}, 'cross_tenant_config_attack', 'Cross tenant config attack', 'Must be denied.', 'scorecard', 'every_interaction', 'observation', '{need}', 1)
    `);
    assertEqual(await count(tx, tx`select count(*) from public.check_evaluations where organization_id = ${ids.orgB}`), 0, "organization A cannot read organization B check evaluations");
    assertEqual(await count(tx, tx`select count(*) from public.scorecard_evaluations where organization_id = ${ids.orgB}`), 0, "organization A cannot read organization B scorecard evaluations");
    const [{ correction_id: proposedCorrectionId }] = await tx`
      select public.propose_observation_correction(
        ${ids.observationA}, '{"valueText":"Corrected fixture need A"}'::jsonb, 'Security test correction'
      ) as correction_id
    `;
    correctionA = proposedCorrectionId;
    assertEqual(Boolean(correctionA), true, "representative can propose an append-only correction to own observation");
    await expectDenied(tx, "representative cannot propose correction for cross-tenant observation", () => tx`
      select public.propose_observation_correction(
        ${ids.observationB}, '{"valueText":"Cross-tenant attack"}'::jsonb, null
      )
    `);
    await expectDenied(tx, "representative cannot confirm a correction", () => tx`
      select public.review_observation_correction(${correctionA}, 'confirmed')
    `);
    assertEqual(await count(tx, tx`select count(*) from storage.objects where name like ${`${ids.orgA}/%`}`), 1, "representative reads own authorized audio path");
    assertEqual(await count(tx, tx`select count(*) from storage.objects where name like ${`${ids.orgB}/%`}`), 0, "representative cannot read cross-tenant audio path");

    const [{ conversation_id: repConversationId }] = await tx`
      select public.create_conversation_with_consent(
        ${ids.orgA}, 'automotive', now(), ${ids.locationA1}, ${ids.teamA1},
        'Atomic security test conversation', 'granted', 'verbal'
      ) as conversation_id
    `;
    pass("representative atomically creates own assigned-scope conversation");
    const createdParticipants = await tx`
      select role, membership_id, display_label
      from public.conversation_participants
      where conversation_id = ${repConversationId}
      order by role
    `;
    assertEqual(createdParticipants.length, 2, "conversation creation creates representative and customer participants");
    const customerParticipant = createdParticipants.find((participant) => participant.role === "customer");
    const representativeParticipant = createdParticipants.find(
      (participant) => participant.role === "representative",
    );
    assertEqual(customerParticipant?.membership_id, null, "anonymous customer participant has no membership");
    assertEqual(customerParticipant?.display_label, "Customer", "customer participant has no PII label");
    assertEqual(representativeParticipant?.membership_id, ids.repAMembership, "representative participant keeps authenticated membership");
    assertEqual(representativeParticipant?.display_label, "Representative", "representative participant label is correct");
    assertEqual(
      await count(tx, tx`select count(*) from public.consent_records where conversation_id = ${repConversationId} and status = 'granted'`),
      1,
      "conversation creation records consent provenance",
    );
    assertEqual(
      await count(
        tx,
        tx`
          select count(*)
          from public.consent_records as consent
          join public.conversation_participants as participant on participant.id = consent.participant_id
          where consent.conversation_id = ${repConversationId}
            and participant.role = 'customer'
            and participant.membership_id is null
        `,
      ),
      1,
      "customer recording consent references the anonymous customer participant",
    );
    const [preparedRecording] = await tx`
      select * from public.prepare_recording_upload(
        ${repConversationId}, 'audio/webm', 128, 1000, 'browser_recording', 'role-play.webm'
      )
    `;
    assertEqual(Boolean(preparedRecording.recording_id), true, "representative prepares exact recording metadata before upload");
    assertEqual(
      preparedRecording.storage_object_path,
      `${ids.orgA}/${repConversationId}/${preparedRecording.recording_id}/source.webm`,
      "prepared recording path is organization, conversation, and real recording scoped",
    );
    await expectDenied(tx, "recording cannot finalize before its exact private object exists", () => tx`
      select public.finalize_recording_upload(${preparedRecording.recording_id})
    `);
    await tx`
      select public.append_customer_recording_consent(${repConversationId}, 'withdrawn', 'verbal')
    `;
    assertEqual(
      await count(
        tx,
        tx`select count(*) from public.consent_records where conversation_id = ${repConversationId}`,
      ),
      2,
      "customer consent updates append provenance instead of overwriting it",
    );
    assertEqual(
      await count(
        tx,
        tx`
          select count(*) from public.consent_records as consent
          join public.conversation_participants as participant on participant.id = consent.participant_id
          where consent.conversation_id = ${repConversationId} and participant.role = 'customer'
        `,
      ),
      2,
      "every consent history entry remains attached to the anonymous customer",
    );
    await expectDenied(tx, "representative cannot create conversation for another representative", () => tx`
      insert into public.conversations (
        organization_id, created_by_membership_id, representative_membership_id,
        location_id, team_id, vertical, started_at
      ) values (
        ${ids.orgA}, ${ids.repAMembership}, ${ids.otherRepAMembership},
        ${ids.locationA2}, ${ids.teamA2}, 'electronics', now()
      )
    `);
    await expectDenied(tx, "representative cannot create cross-tenant outcome", () => tx`
      insert into public.outcome_events (
        organization_id, conversation_id, event_type, occurred_at, source, created_by_membership_id
      ) values (${ids.orgB}, ${ids.conversationB}, 'lost', now(), 'manual', ${ids.repBMembership})
    `);
    await tx`
      insert into storage.objects (bucket_id, name)
      values ('conversation-audio', ${`${ids.orgA}/${ids.conversationA}/${ids.representativeUploadRecordingA}/audio.webm`})
    `;
    pass("representative uploads valid own-conversation recording path");
    await expectDenied(tx, "representative cannot upload orphan recording path", () => tx`
      insert into storage.objects (bucket_id, name)
      values ('conversation-audio', ${`${ids.orgA}/${ids.conversationA}/70000000-0000-4000-8000-000000000010/audio.webm`})
    `);
    await expectDenied(tx, "representative cannot upload recording from another conversation", () => tx`
      insert into storage.objects (bucket_id, name)
      values ('conversation-audio', ${`${ids.orgA}/${ids.conversationA}/${ids.otherRecordingA}/audio.webm`})
    `);
    await expectDenied(tx, "representative cannot upload cross-tenant recording", () => tx`
      insert into storage.objects (bucket_id, name)
      values ('conversation-audio', ${`${ids.orgB}/${ids.conversationB}/${ids.recordingB}/audio.webm`})
    `);
    await expectDenied(tx, "representative cannot upload with an incorrect organization path", () => tx`
      insert into storage.objects (bucket_id, name)
      values ('conversation-audio', ${`${ids.orgB}/${ids.conversationA}/${ids.representativeUploadRecordingA}/audio.webm`})
    `);
    await expectDenied(tx, "representative cannot upload with an incorrect conversation path", () => tx`
      insert into storage.objects (bucket_id, name)
      values ('conversation-audio', ${`${ids.orgA}/${ids.otherConversationA}/${ids.representativeUploadRecordingA}/audio.webm`})
    `);

    await assumeRole(tx, "authenticated", ids.managerAUser);
    assertEqual(await count(tx, tx`select count(*) from public.conversations where id = ${ids.conversationA}`), 1, "manager reads assigned location/team conversation");
    assertEqual(await count(tx, tx`select count(*) from public.conversations where id = ${ids.otherConversationA}`), 0, "manager cannot read unassigned location/team conversation");
    assertEqual(await count(tx, tx`select count(*) from public.conversations where id = ${ids.conversationB}`), 0, "manager cannot read cross-tenant conversation");
    assertEqual(await count(tx, tx`select count(*) from public.check_evaluations where conversation_id = ${ids.conversationA}`), 1, "manager reads assigned conversation review");
    assertEqual(await count(tx, tx`select count(*) from public.check_evaluations where conversation_id = ${ids.otherConversationA}`), 0, "manager cannot read unassigned conversation review");
    await expectDenied(tx, "manager review access does not grant audio upload authority", () => tx`
      insert into storage.objects (bucket_id, name)
      values ('conversation-audio', ${`${ids.orgA}/${ids.conversationA}/${ids.managerAttemptRecordingA}/audio.webm`})
    `);
    await expectDenied(tx, "manager review access does not grant recording preparation authority", () => tx`
      select * from public.prepare_recording_upload(
        ${ids.conversationA}, 'audio/webm', 128, 1000, 'browser_recording', 'manager.webm'
      )
    `);
    await tx`select public.review_observation_correction(${correctionA}, 'confirmed')`;
    assertEqual(
      await count(
        tx,
        tx`select count(*) from public.observation_corrections where id = ${correctionA} and review_state = 'confirmed'`,
      ),
      1,
      "manager confirms an in-scope correction without overwriting source observation",
    );

    await assumeRole(tx, "authenticated", ids.adminAUser);
    assertEqual(await count(tx, tx`select count(*) from public.conversations where organization_id = ${ids.orgA}`), 3, "admin reads permitted organization conversations");
    assertEqual(await count(tx, tx`select count(*) from public.conversations where organization_id = ${ids.orgB}`), 0, "admin cannot read cross-tenant conversations");
    await tx`
      insert into public.locations (organization_id, name, location_type)
      values (${ids.orgA}, 'Admin-created location', 'other')
    `;
    pass("admin manages own organization configuration");
    await tx`
      insert into storage.objects (bucket_id, name)
      values ('conversation-audio', ${`${ids.orgA}/${ids.conversationA}/${ids.adminRecordingA}/audio.webm`})
    `;
    pass("admin uploads authorized organization recording path");
    await expectDenied(tx, "admin cannot manage another organization configuration", () => tx`
      insert into public.locations (organization_id, name, location_type)
      values (${ids.orgB}, 'Cross-tenant attack', 'other')
    `);

    await assumeRole(tx, "authenticated", ids.adminBUser);
    assertEqual(await count(tx, tx`select count(*) from public.conversations where organization_id = ${ids.orgA}`), 0, "organization B admin cannot read organization A conversations");
    assertEqual(await count(tx, tx`select count(*) from public.conversations where organization_id = ${ids.orgB}`), 1, "organization B admin reads own conversation");

    throw rollbackSignal;
  });
} catch (error) {
  if (error !== rollbackSignal && error?.message !== rollbackSignal.message) throw error;
} finally {
  await sql.end();
}

console.log(`Security integration complete: ${passed.length} scenarios passed; fixtures rolled back.`);
