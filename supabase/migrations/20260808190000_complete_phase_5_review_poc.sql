-- Phase 5B: durable interaction review, immutable configuration snapshots and
-- atomic analysis-result persistence. This intentionally extends (and does not
-- rewrite) the Phase 5A schema.

-- The legacy UUID array remains for compatibility with the Phase 5A seed. New
-- evaluation code uses this relational association so a scorecard cannot point
-- across organization boundaries.
create table public.scorecard_definition_checks (
  organization_id uuid not null,
  scorecard_definition_id uuid not null,
  check_definition_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (scorecard_definition_id, check_definition_id),
  foreign key (organization_id, scorecard_definition_id)
    references public.scorecard_definitions(organization_id, id) on delete cascade,
  foreign key (organization_id, check_definition_id)
    references public.check_definitions(organization_id, id) on delete restrict
);

insert into public.scorecard_definition_checks (organization_id, scorecard_definition_id, check_definition_id)
select scorecard.organization_id, scorecard.id, definition.id
from public.scorecard_definitions as scorecard
cross join lateral unnest(scorecard.check_definition_ids) as check_id
join public.check_definitions as definition
  on definition.id = check_id and definition.organization_id = scorecard.organization_id
on conflict do nothing;

alter table public.check_definitions
  add constraint check_definitions_creator_org_fk
    foreign key (organization_id, created_by_membership_id)
    references public.organization_memberships(organization_id, id) not valid,
  add constraint check_definitions_supersedes_org_fk
    foreign key (organization_id, supersedes_definition_id)
    references public.check_definitions(organization_id, id) not valid;

alter table public.scorecard_definitions
  add constraint scorecard_definitions_creator_org_fk
    foreign key (organization_id, created_by_membership_id)
    references public.organization_memberships(organization_id, id) not valid;

create table public.review_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid not null,
  analysis_run_id uuid not null,
  evaluation_version text not null,
  trigger_reason text not null check (trigger_reason in ('initial', 'correction', 'configuration_change', 'manual')),
  status public.run_status not null default 'pending',
  configuration_snapshot jsonb not null check (jsonb_typeof(configuration_snapshot) = 'object'),
  semantic_request_count integer not null default 0 check (semantic_request_count >= 0),
  error_code text,
  error_message text,
  created_by_membership_id uuid,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, conversation_id, id),
  unique (conversation_id, evaluation_version),
  foreign key (organization_id, conversation_id, analysis_run_id)
    references public.analysis_runs(organization_id, conversation_id, id) on delete restrict,
  foreign key (organization_id, created_by_membership_id)
    references public.organization_memberships(organization_id, id)
);
create unique index review_runs_one_active_per_conversation
  on public.review_runs(conversation_id) where status in ('pending', 'running');

alter table public.check_evaluations add column review_run_id uuid;
alter table public.check_evaluations
  add constraint check_evaluations_review_run_fk
    foreign key (organization_id, conversation_id, review_run_id)
    references public.review_runs(organization_id, conversation_id, id) on delete cascade not valid;
create unique index check_evaluations_review_run_definition_unique
  on public.check_evaluations(review_run_id, check_definition_id) where review_run_id is not null;

alter table public.scorecard_evaluations add column review_run_id uuid;
alter table public.scorecard_evaluations
  add constraint scorecard_evaluations_review_run_fk
    foreign key (organization_id, conversation_id, review_run_id)
    references public.review_runs(organization_id, conversation_id, id) on delete cascade not valid;
create unique index scorecard_evaluations_review_run_definition_unique
  on public.scorecard_evaluations(review_run_id, scorecard_definition_id) where review_run_id is not null;

alter table public.scorecard_definition_checks enable row level security;
alter table public.review_runs enable row level security;
create policy scorecard_definition_checks_select_member on public.scorecard_definition_checks for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy review_runs_select_parent on public.review_runs for select to authenticated
  using ((select private.can_access_conversation(conversation_id)));
grant select on public.scorecard_definition_checks, public.review_runs to authenticated;
grant all on public.scorecard_definition_checks, public.review_runs to service_role;

-- One RPC owns all mutations needed to store an extraction. PostgreSQL executes
-- the function transactionally: a provider failure leaves no metric/evidence/
-- observation residue, and a workflow retry can safely finalize an already
-- persisted result without creating another immutable result set.
create or replace function public.persist_analysis_result(
  p_analysis_run_id uuid,
  p_metric_values jsonb,
  p_observations jsonb
)
returns table(metric_run_id uuid, already_persisted boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.analysis_runs%rowtype;
  v_metric_run_id uuid;
  v_observation jsonb;
  v_group_id uuid;
  v_segment_id uuid;
  v_sequence integer;
  v_metric jsonb;
begin
  select * into v_run from public.analysis_runs where id = p_analysis_run_id for update;
  if not found then raise exception 'Analysis run was not found.' using errcode = 'P0002'; end if;
  if jsonb_typeof(p_metric_values) <> 'array' or jsonb_typeof(p_observations) <> 'array' then
    raise exception 'Analysis persistence payload must contain arrays.' using errcode = '22023';
  end if;

  if exists (select 1 from public.structured_observations where analysis_run_id = p_analysis_run_id) then
    if v_run.metric_run_id is null then
      raise exception 'Persisted observations have no metric lineage.' using errcode = '23514';
    end if;
    return query select v_run.metric_run_id, true;
    return;
  end if;

  insert into public.metric_runs(
    organization_id, conversation_id, source_transcription_run_id, speaker_mapping_version_id, algorithm_version
  ) values (
    v_run.organization_id, v_run.conversation_id, v_run.source_transcription_run_id,
    v_run.speaker_mapping_version_id, 'phase4.v2'
  ) returning id into v_metric_run_id;

  for v_metric in select value from jsonb_array_elements(p_metric_values) loop
    insert into public.metric_values(
      organization_id, conversation_id, metric_run_id, metric_key, numeric_value, unit
    ) values (
      v_run.organization_id, v_run.conversation_id, v_metric_run_id,
      v_metric ->> 'metric_key', (v_metric ->> 'numeric_value')::numeric, v_metric ->> 'unit'
    );
  end loop;

  for v_observation in select value from jsonb_array_elements(p_observations) loop
    if not exists (
      select 1 from jsonb_array_elements_text(v_observation -> 'evidenceSegmentIds') as evidence_id
      join public.transcript_segments as segment on segment.id = evidence_id::uuid
      where segment.organization_id = v_run.organization_id
        and segment.conversation_id = v_run.conversation_id
        and segment.transcription_run_id = v_run.source_transcription_run_id
    ) or coalesce(jsonb_array_length(v_observation -> 'evidenceSegmentIds'), 0) = 0 then
      raise exception 'Observation evidence must reference source transcript segments.' using errcode = '22023';
    end if;

    insert into public.evidence_groups(organization_id, conversation_id, purpose, source_analysis_run_id)
    values (v_run.organization_id, v_run.conversation_id, 'observation:' || (v_observation ->> 'type'), p_analysis_run_id)
    returning id into v_group_id;

    v_sequence := 0;
    for v_segment_id in select value::uuid from jsonb_array_elements_text(v_observation -> 'evidenceSegmentIds') loop
      insert into public.evidence_references(
        organization_id, conversation_id, evidence_group_id, transcription_run_id, transcript_segment_id,
        sequence_number, start_milliseconds, end_milliseconds
      )
      select v_run.organization_id, v_run.conversation_id, v_group_id, v_run.source_transcription_run_id,
        segment.id, v_sequence, segment.start_milliseconds, segment.end_milliseconds
      from public.transcript_segments as segment
      where segment.id = v_segment_id
        and segment.organization_id = v_run.organization_id
        and segment.conversation_id = v_run.conversation_id
        and segment.transcription_run_id = v_run.source_transcription_run_id;
      if not found then raise exception 'Observation evidence segment is not part of this source transcript.' using errcode = '22023'; end if;
      v_sequence := v_sequence + 1;
    end loop;

    insert into public.structured_observations(
      organization_id, conversation_id, analysis_run_id, observation_type, normalized_key, value_text,
      value_amount_minor, currency_code, attributes, original_model_value, evidence_group_id
    ) values (
      v_run.organization_id, v_run.conversation_id, p_analysis_run_id,
      v_observation ->> 'type', v_observation ->> 'key', nullif(v_observation ->> 'text', ''),
      nullif(v_observation ->> 'amountMinor', '')::bigint, nullif(v_observation ->> 'currency', ''),
      coalesce(v_observation -> 'attributes', '{}'::jsonb), v_observation, v_group_id
    );
  end loop;

  update public.analysis_runs set metric_run_id = v_metric_run_id where id = p_analysis_run_id;
  return query select v_metric_run_id, false;
end;
$$;

create or replace function public.seed_starter_electronics_checks(p_organization_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_member_id uuid; v_scorecard_id uuid;
begin
  if not private.is_org_admin(p_organization_id) then raise exception 'Administrator access is required.' using errcode = '42501'; end if;
  v_member_id := private.current_membership_id(p_organization_id);
  insert into public.check_definitions (organization_id, key, version, name, description, purpose, applicability, evaluation_strategy, observation_types, weight, is_starter, created_by_membership_id) values
    (p_organization_id, 'customer_greeted', 1, 'Customer greeted', 'A clear greeting was observed.', 'scorecard', 'every_interaction', 'semantic', '{}', 1, true, v_member_id),
    (p_organization_id, 'requirement_understood', 1, 'Requirement understood', 'The customer need or use case was identified.', 'scorecard', 'every_interaction', 'observation', '{need}', 2, true, v_member_id),
    (p_organization_id, 'budget_identified', 1, 'Budget identified', 'A customer budget was identified.', 'scorecard', 'every_interaction', 'observation', '{budget}', 1, true, v_member_id),
    (p_organization_id, 'relevant_product_discussed', 1, 'Relevant product discussed', 'A relevant product was discussed.', 'scorecard', 'every_interaction', 'observation', '{product,spec}', 2, true, v_member_id),
    (p_organization_id, 'customer_questions_addressed', 1, 'Customer questions addressed', 'A representative response followed the customer question.', 'scorecard', 'every_interaction', 'semantic', '{question}', 2, true, v_member_id),
    (p_organization_id, 'price_objection_handled', 1, 'Price objection handled when applicable', 'A price comparison or objection received a value response.', 'scorecard', 'when_relevant', 'semantic', '{objection,competitor_price}', 2, true, v_member_id),
    (p_organization_id, 'finance_emi_addressed', 1, 'Finance / EMI addressed when applicable', 'A finance or EMI question received a response.', 'scorecard', 'when_relevant', 'semantic', '{finance,question}', 1, true, v_member_id),
    (p_organization_id, 'next_action_captured', 1, 'Next action captured', 'A specific next action or commitment was captured.', 'scorecard', 'every_interaction', 'observation', '{next_action,commitment}', 1, true, v_member_id)
  on conflict (organization_id, key, version) do nothing;
  insert into public.scorecard_definitions(organization_id, key, version, name, check_definition_ids, created_by_membership_id)
  select p_organization_id, 'starter_electronics', 1, 'Starter Electronics Scorecard', array_agg(id order by key), v_member_id
  from public.check_definitions where organization_id = p_organization_id and is_starter and purpose = 'scorecard'
  on conflict (organization_id, key, version) do nothing;
  select id into v_scorecard_id from public.scorecard_definitions where organization_id = p_organization_id and key = 'starter_electronics' and version = 1;
  insert into public.scorecard_definition_checks(organization_id, scorecard_definition_id, check_definition_id)
  select p_organization_id, v_scorecard_id, id from public.check_definitions
  where organization_id = p_organization_id and is_starter and purpose = 'scorecard'
  on conflict do nothing;
end; $$;

create or replace function public.create_organization_check(
  p_organization_id uuid, p_name text, p_description text, p_purpose text, p_applicability text,
  p_evaluation_strategy text, p_phrase text default null, p_weight numeric default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_member_id uuid; v_check_id uuid := gen_random_uuid(); v_key text; v_scorecard_id uuid;
begin
  if not private.is_org_admin(p_organization_id) then raise exception 'Administrator access is required.' using errcode='42501'; end if;
  if p_purpose not in ('monitor','scorecard') or p_applicability not in ('every_interaction','when_relevant') or p_evaluation_strategy not in ('phrase','semantic') then raise exception 'Invalid check configuration.' using errcode='22023'; end if;
  if p_purpose = 'scorecard' and (p_weight is null or p_weight <= 0) then raise exception 'A scorecard check needs a positive weight.' using errcode='22023'; end if;
  if p_purpose = 'monitor' and p_weight is not null then raise exception 'Monitoring checks cannot have a score weight.' using errcode='22023'; end if;
  if p_evaluation_strategy = 'phrase' and nullif(trim(coalesce(p_phrase,'')), '') is null then raise exception 'Phrase matching needs an exact phrase.' using errcode='22023'; end if;
  v_member_id := private.current_membership_id(p_organization_id);
  v_key := 'custom_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 24);
  insert into public.check_definitions(id, organization_id, key, version, name, description, purpose, applicability, evaluation_strategy, phrase, weight, created_by_membership_id)
  values(v_check_id, p_organization_id, v_key, 1, trim(p_name), trim(p_description), p_purpose, p_applicability, p_evaluation_strategy, nullif(trim(coalesce(p_phrase,'')), ''), p_weight, v_member_id);
  if p_purpose = 'scorecard' then
    select id into v_scorecard_id from public.scorecard_definitions where organization_id=p_organization_id and key='starter_electronics' and active order by version desc limit 1;
    if v_scorecard_id is not null then
      insert into public.scorecard_definition_checks(organization_id, scorecard_definition_id, check_definition_id) values(p_organization_id, v_scorecard_id, v_check_id);
    end if;
  end if;
  return v_check_id;
end; $$;

create or replace function public.request_interaction_review(p_conversation_id uuid, p_trigger_reason text default 'initial')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_conversation public.conversations%rowtype; v_member_id uuid; v_run_id uuid := gen_random_uuid(); v_version text; v_snapshot jsonb;
begin
  select * into v_conversation from public.conversations where id=p_conversation_id;
  if not found or not private.can_access_conversation(p_conversation_id) then raise exception 'You are not allowed to review this interaction.' using errcode='42501'; end if;
  if v_conversation.active_analysis_run_id is null then raise exception 'Interaction understanding is required before review.' using errcode='23514'; end if;
  if p_trigger_reason not in ('initial','correction','configuration_change','manual') then raise exception 'Invalid review trigger.' using errcode='22023'; end if;
  select id into v_run_id from public.review_runs where conversation_id=p_conversation_id and status in ('pending','running') order by created_at desc limit 1;
  if v_run_id is not null then return v_run_id; end if;
  v_member_id := private.current_membership_id(v_conversation.organization_id);
  select jsonb_build_object(
    'checks', coalesce(jsonb_agg(jsonb_build_object('id', definition.id, 'name', definition.name, 'description', definition.description, 'purpose', definition.purpose, 'applicability', definition.applicability, 'evaluationStrategy', definition.evaluation_strategy, 'observationTypes', definition.observation_types, 'phrase', definition.phrase, 'weight', definition.weight) order by definition.created_at), '[]'::jsonb),
    'scorecards', coalesce((select jsonb_agg(jsonb_build_object('id', scorecard.id, 'name', scorecard.name, 'checkIds', (select coalesce(jsonb_agg(association.check_definition_id), '[]'::jsonb) from public.scorecard_definition_checks association where association.scorecard_definition_id=scorecard.id))) from public.scorecard_definitions scorecard where scorecard.organization_id=v_conversation.organization_id and scorecard.active), '[]'::jsonb)
  ) into v_snapshot from public.check_definitions definition where definition.organization_id=v_conversation.organization_id and definition.active;
  v_version := 'phase5.v1.' || replace(v_run_id::text, '-', '');
  insert into public.review_runs(id, organization_id, conversation_id, analysis_run_id, evaluation_version, trigger_reason, configuration_snapshot, created_by_membership_id)
  values(v_run_id, v_conversation.organization_id, p_conversation_id, v_conversation.active_analysis_run_id, v_version, p_trigger_reason, v_snapshot, v_member_id);
  return v_run_id;
end; $$;

create or replace function public.persist_interaction_review(
  p_review_run_id uuid, p_check_evaluations jsonb, p_scorecard_evaluations jsonb, p_semantic_request_count integer default 0
) returns void language plpgsql security definer set search_path = '' as $$
declare v_run public.review_runs%rowtype; v_item jsonb; v_check_id uuid; v_scorecard_id uuid;
begin
  select * into v_run from public.review_runs where id=p_review_run_id for update;
  if not found then raise exception 'Review run was not found.' using errcode='P0002'; end if;
  if v_run.status='completed' then return; end if;
  if jsonb_typeof(p_check_evaluations) <> 'array' or jsonb_typeof(p_scorecard_evaluations) <> 'array' then raise exception 'Review persistence payload must contain arrays.' using errcode='22023'; end if;
  for v_item in select value from jsonb_array_elements(p_check_evaluations) loop
    v_check_id := (v_item ->> 'checkDefinitionId')::uuid;
    if not exists (select 1 from jsonb_array_elements(v_run.configuration_snapshot -> 'checks') item where (item ->> 'id')::uuid=v_check_id) then raise exception 'Review check was not part of the configuration snapshot.' using errcode='22023'; end if;
    if (v_item ->> 'resultState') in ('met','partial') and nullif(v_item ->> 'evidenceGroupId','') is null then raise exception 'Positive review results require evidence.' using errcode='22023'; end if;
    if nullif(v_item ->> 'evidenceGroupId','') is not null and not exists (select 1 from public.evidence_groups where id=(v_item ->> 'evidenceGroupId')::uuid and organization_id=v_run.organization_id and conversation_id=v_run.conversation_id) then raise exception 'Review evidence does not belong to this interaction.' using errcode='22023'; end if;
    insert into public.check_evaluations(organization_id, conversation_id, analysis_run_id, check_definition_id, review_run_id, evaluation_version, result_state, applicability_reason, explanation, evidence_group_id)
    values(v_run.organization_id, v_run.conversation_id, v_run.analysis_run_id, v_check_id, v_run.id, v_run.evaluation_version, v_item ->> 'resultState', nullif(v_item ->> 'applicabilityReason',''), v_item ->> 'explanation', nullif(v_item ->> 'evidenceGroupId','')::uuid);
  end loop;
  for v_item in select value from jsonb_array_elements(p_scorecard_evaluations) loop
    v_scorecard_id := (v_item ->> 'scorecardDefinitionId')::uuid;
    if not exists (select 1 from jsonb_array_elements(v_run.configuration_snapshot -> 'scorecards') item where (item ->> 'id')::uuid=v_scorecard_id) then raise exception 'Scorecard was not part of the configuration snapshot.' using errcode='22023'; end if;
    insert into public.scorecard_evaluations(organization_id, conversation_id, analysis_run_id, scorecard_definition_id, review_run_id, evaluation_version, score_percent, applicable_check_count, evaluated_check_count, insufficient_evidence_count)
    values(v_run.organization_id, v_run.conversation_id, v_run.analysis_run_id, v_scorecard_id, v_run.id, v_run.evaluation_version, nullif(v_item ->> 'scorePercent','')::numeric, (v_item ->> 'applicableCheckCount')::integer, (v_item ->> 'evaluatedCheckCount')::integer, (v_item ->> 'insufficientEvidenceCount')::integer);
  end loop;
  update public.review_runs set status='completed', semantic_request_count=greatest(0,p_semantic_request_count), started_at=coalesce(started_at,now()), completed_at=now() where id=p_review_run_id;
end; $$;

revoke all on function public.persist_analysis_result(uuid, jsonb, jsonb) from public;
revoke all on function public.create_organization_check(uuid, text, text, text, text, text, text, numeric) from public;
revoke all on function public.request_interaction_review(uuid, text) from public;
revoke all on function public.persist_interaction_review(uuid, jsonb, jsonb, integer) from public;
grant execute on function public.seed_starter_electronics_checks(uuid) to authenticated;
grant execute on function public.create_organization_check(uuid, text, text, text, text, text, text, numeric) to authenticated;
grant execute on function public.request_interaction_review(uuid, text) to authenticated;

comment on function public.persist_analysis_result(uuid, jsonb, jsonb) is
  'Atomically writes one analysis run metric lineage, evidence groups/references and immutable observations. Retries return the already-persisted result.';
comment on table public.review_runs is
  'Immutable, configuration-snapshotted interaction review attempts. Re-evaluation creates a new row and never rewrites historical check or scorecard results.';
