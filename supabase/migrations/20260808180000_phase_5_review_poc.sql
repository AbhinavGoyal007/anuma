-- Phase 5: bounded review configuration and immutable evaluation results.
alter table public.analysis_runs add column if not exists metric_run_id uuid;
alter table public.analysis_runs add constraint analysis_runs_metric_run_fk
  foreign key (organization_id, conversation_id, metric_run_id)
  references public.metric_runs(organization_id, conversation_id, id) not valid;

alter table public.structured_observations add constraint structured_observations_canonical_type_check
  check (observation_type in (
    'need', 'budget', 'product', 'spec', 'price', 'competitor', 'competitor_price',
    'store_quote', 'question', 'objection', 'barrier', 'decision_driver', 'commitment',
    'next_action', 'finance'
  )) not valid;

create table public.check_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  version integer not null default 1 check (version > 0),
  name text not null check (char_length(trim(name)) between 2 and 120),
  description text not null check (char_length(trim(description)) between 2 and 1000),
  purpose text not null check (purpose in ('monitor', 'scorecard')),
  applicability text not null check (applicability in ('every_interaction', 'when_relevant')),
  evaluation_strategy text not null check (evaluation_strategy in ('observation', 'phrase', 'semantic')),
  observation_types text[] not null default '{}'::text[],
  phrase text,
  weight numeric(8,2) check (weight is null or weight > 0),
  active boolean not null default true,
  is_starter boolean not null default false,
  created_by_membership_id uuid references public.organization_memberships(id),
  supersedes_definition_id uuid references public.check_definitions(id),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, key, version),
  check ((purpose = 'monitor' and weight is null) or (purpose = 'scorecard' and weight is not null)),
  check ((evaluation_strategy = 'phrase' and phrase is not null) or (evaluation_strategy <> 'phrase'))
);

create table public.check_evaluations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid not null,
  analysis_run_id uuid not null,
  check_definition_id uuid not null,
  evaluation_version text not null default 'phase5.v1',
  result_state text not null check (result_state in ('met', 'not_met', 'partial', 'not_applicable', 'insufficient_evidence')),
  applicability_reason text,
  explanation text not null,
  evidence_group_id uuid,
  created_at timestamptz not null default now(),
  unique (organization_id, conversation_id, id),
  unique (conversation_id, analysis_run_id, check_definition_id, evaluation_version),
  foreign key (organization_id, conversation_id, analysis_run_id)
    references public.analysis_runs(organization_id, conversation_id, id) on delete cascade,
  foreign key (organization_id, check_definition_id)
    references public.check_definitions(organization_id, id) on delete restrict,
  foreign key (organization_id, conversation_id, evidence_group_id)
    references public.evidence_groups(organization_id, conversation_id, id) on delete restrict
);

create table public.scorecard_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  version integer not null default 1 check (version > 0),
  name text not null check (char_length(trim(name)) between 2 and 120),
  active boolean not null default true,
  check_definition_ids uuid[] not null,
  created_by_membership_id uuid references public.organization_memberships(id),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, key, version)
);

create table public.scorecard_evaluations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid not null,
  analysis_run_id uuid not null,
  scorecard_definition_id uuid not null,
  evaluation_version text not null default 'phase5.v1',
  score_percent numeric(5,2),
  applicable_check_count integer not null default 0,
  evaluated_check_count integer not null default 0,
  insufficient_evidence_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (organization_id, conversation_id, id),
  unique (conversation_id, analysis_run_id, scorecard_definition_id, evaluation_version),
  foreign key (organization_id, conversation_id, analysis_run_id)
    references public.analysis_runs(organization_id, conversation_id, id) on delete cascade,
  foreign key (organization_id, scorecard_definition_id)
    references public.scorecard_definitions(organization_id, id) on delete restrict,
  check (score_percent is null or (score_percent >= 0 and score_percent <= 100))
);

alter table public.check_definitions enable row level security;
alter table public.check_evaluations enable row level security;
alter table public.scorecard_definitions enable row level security;
alter table public.scorecard_evaluations enable row level security;

create policy check_definitions_select_member on public.check_definitions for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy check_definitions_insert_admin on public.check_definitions for insert to authenticated
  with check ((select private.is_org_admin(organization_id)));
create policy scorecard_definitions_select_member on public.scorecard_definitions for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy scorecard_definitions_insert_admin on public.scorecard_definitions for insert to authenticated
  with check ((select private.is_org_admin(organization_id)));
create policy check_evaluations_select_parent on public.check_evaluations for select to authenticated
  using ((select private.can_access_conversation(conversation_id)));
create policy scorecard_evaluations_select_parent on public.scorecard_evaluations for select to authenticated
  using ((select private.can_access_conversation(conversation_id)));

grant select, insert on public.check_definitions, public.scorecard_definitions to authenticated;
grant select on public.check_evaluations, public.scorecard_evaluations to authenticated;
grant all on public.check_definitions, public.check_evaluations, public.scorecard_definitions, public.scorecard_evaluations to service_role;

create or replace function public.seed_starter_electronics_checks(p_organization_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_member_id uuid;
begin
  if not private.is_org_admin(p_organization_id) then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  v_member_id := private.current_membership_id(p_organization_id);
  insert into public.check_definitions(
    organization_id, key, version, name, description, purpose, applicability,
    evaluation_strategy, observation_types, weight, is_starter, created_by_membership_id
  ) values
    (p_organization_id, 'customer_greeted', 1, 'Customer greeted', 'A clear greeting was observed.', 'scorecard', 'every_interaction', 'semantic', '{}', 1, true, v_member_id),
    (p_organization_id, 'requirement_understood', 1, 'Requirement understood', 'The customer need or use case was identified.', 'scorecard', 'every_interaction', 'observation', '{need}', 2, true, v_member_id),
    (p_organization_id, 'budget_identified', 1, 'Budget identified', 'A customer budget was identified.', 'scorecard', 'every_interaction', 'observation', '{budget}', 1, true, v_member_id),
    (p_organization_id, 'relevant_product_discussed', 1, 'Relevant product discussed', 'A relevant product was discussed.', 'scorecard', 'every_interaction', 'observation', '{product,spec}', 2, true, v_member_id),
    (p_organization_id, 'customer_questions_addressed', 1, 'Customer questions addressed', 'A representative response followed the customer question.', 'scorecard', 'every_interaction', 'semantic', '{question}', 2, true, v_member_id),
    (p_organization_id, 'price_objection_handled', 1, 'Price objection handled when applicable', 'A price comparison or objection received a value response.', 'scorecard', 'when_relevant', 'semantic', '{objection,competitor_price}', 2, true, v_member_id),
    (p_organization_id, 'finance_emi_addressed', 1, 'Finance / EMI addressed when applicable', 'A finance or EMI question received a response.', 'scorecard', 'when_relevant', 'semantic', '{finance,question}', 1, true, v_member_id),
    (p_organization_id, 'next_action_captured', 1, 'Next action captured', 'A specific next action or commitment was captured.', 'scorecard', 'every_interaction', 'observation', '{next_action,commitment}', 1, true, v_member_id)
  on conflict (organization_id, key, version) do nothing;

  insert into public.scorecard_definitions(
    organization_id, key, version, name, check_definition_ids, created_by_membership_id
  ) select p_organization_id, 'starter_electronics', 1, 'Starter Electronics Scorecard',
    array_agg(id order by key), v_member_id
  from public.check_definitions
  where organization_id = p_organization_id and is_starter and purpose = 'scorecard'
  on conflict (organization_id, key, version) do nothing;
end; $$;
revoke all on function public.seed_starter_electronics_checks(uuid) from public;
grant execute on function public.seed_starter_electronics_checks(uuid) to authenticated;

create or replace function public.request_interaction_understanding(p_conversation_id uuid) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_conversation public.conversations%rowtype; v_run_id uuid := gen_random_uuid();
begin
 select * into v_conversation from public.conversations where id=p_conversation_id;
 if not found or not private.can_process_recording((select recording_id from public.transcription_runs where id=v_conversation.active_transcription_run_id)) then raise exception 'You are not allowed to understand this interaction.' using errcode='42501'; end if;
 if v_conversation.active_transcription_run_id is null or v_conversation.active_speaker_mapping_version_id is null then raise exception 'A completed transcript and confirmed speaker mapping are required.' using errcode='23514'; end if;
 if not exists(select 1 from public.transcription_runs where id=v_conversation.active_transcription_run_id and status='completed') or not exists(select 1 from public.transcript_segments where transcription_run_id=v_conversation.active_transcription_run_id) then raise exception 'The active transcript is not usable.' using errcode='23514'; end if;
 insert into public.analysis_runs(id,organization_id,conversation_id,source_transcription_run_id,speaker_mapping_version_id,provider,model,prompt_version,taxonomy_version,domain_pack_version,status) values(v_run_id,v_conversation.organization_id,p_conversation_id,v_conversation.active_transcription_run_id,v_conversation.active_speaker_mapping_version_id,'openai','pending_runtime_model','phase4.v2','phase4.electronics.v2','phase4.electronics.v2','pending');
 return v_run_id;
exception when unique_violation then raise exception 'Understanding is already pending or running.' using errcode='23505'; end; $$;
