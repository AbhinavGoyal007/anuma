-- Phase 4: immutable structured understanding, metrics, and correction overlays.
create table public.structured_observations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid not null,
  analysis_run_id uuid not null,
  observation_type text not null check (observation_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  normalized_key text not null check (char_length(normalized_key) between 1 and 160),
  value_text text,
  value_amount_minor bigint check (value_amount_minor is null or value_amount_minor >= 0),
  currency_code text check (currency_code is null or currency_code ~ '^[A-Z]{3}$'),
  attributes jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object'),
  original_model_value jsonb not null check (jsonb_typeof(original_model_value) = 'object'),
  evidence_group_id uuid not null,
  created_at timestamptz not null default now(),
  constraint observations_analysis_fk foreign key (organization_id, conversation_id, analysis_run_id)
    references public.analysis_runs(organization_id, conversation_id, id) on delete cascade,
  constraint observations_evidence_fk foreign key (organization_id, conversation_id, evidence_group_id)
    references public.evidence_groups(organization_id, conversation_id, id) on delete restrict,
  constraint observations_money_check check ((value_amount_minor is null and currency_code is null) or (value_amount_minor is not null and currency_code is not null)),
  unique (organization_id, conversation_id, id)
);
create index structured_observations_lookup_idx on public.structured_observations(organization_id, observation_type, normalized_key);
create index structured_observations_conversation_idx on public.structured_observations(conversation_id, analysis_run_id);

create table public.metric_runs (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, conversation_id uuid not null,
  source_transcription_run_id uuid not null, speaker_mapping_version_id uuid not null,
  algorithm_version text not null, created_at timestamptz not null default now(),
  unique (organization_id, conversation_id, id),
  foreign key (organization_id, conversation_id, source_transcription_run_id) references public.transcription_runs(organization_id, conversation_id, id),
  foreign key (organization_id, conversation_id, source_transcription_run_id, speaker_mapping_version_id) references public.speaker_mapping_versions(organization_id, conversation_id, transcription_run_id, id)
);
create table public.metric_values (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, conversation_id uuid not null,
  metric_run_id uuid not null, metric_key text not null check (metric_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  numeric_value numeric not null, unit text not null, created_at timestamptz not null default now(),
  unique(metric_run_id, metric_key),
  foreign key (organization_id, conversation_id, metric_run_id) references public.metric_runs(organization_id, conversation_id, id) on delete cascade
);

create table public.observation_corrections (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, conversation_id uuid not null,
  observation_id uuid not null, proposed_value jsonb not null, reason text, review_state public.review_state not null default 'unreviewed',
  proposed_by_membership_id uuid not null, reviewed_by_membership_id uuid, reviewed_at timestamptz, created_at timestamptz not null default now(),
  foreign key (organization_id, conversation_id, observation_id) references public.structured_observations(organization_id, conversation_id, id) on delete cascade,
  foreign key (organization_id, proposed_by_membership_id) references public.organization_memberships(organization_id, id),
  foreign key (organization_id, reviewed_by_membership_id) references public.organization_memberships(organization_id, id)
);

alter table public.structured_observations enable row level security;
alter table public.metric_runs enable row level security;
alter table public.metric_values enable row level security;
alter table public.observation_corrections enable row level security;
create policy observations_select_parent on public.structured_observations for select to authenticated using ((select private.can_access_conversation(conversation_id)));
create policy metric_runs_select_parent on public.metric_runs for select to authenticated using ((select private.can_access_conversation(conversation_id)));
create policy metric_values_select_parent on public.metric_values for select to authenticated using ((select private.can_access_conversation(conversation_id)));
create policy corrections_select_parent on public.observation_corrections for select to authenticated using ((select private.can_access_conversation(conversation_id)));
grant select on public.structured_observations, public.metric_runs, public.metric_values, public.observation_corrections to authenticated;
grant all on public.structured_observations, public.metric_runs, public.metric_values, public.observation_corrections to service_role;

create unique index analysis_runs_one_active_attempt_per_conversation on public.analysis_runs(conversation_id) where status in ('pending','running');
create or replace function public.request_interaction_understanding(p_conversation_id uuid) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_conversation public.conversations%rowtype; v_run_id uuid := gen_random_uuid();
begin
 select * into v_conversation from public.conversations where id=p_conversation_id;
 if not found or not private.can_process_recording((select recording_id from public.transcription_runs where id=v_conversation.active_transcription_run_id)) then raise exception 'You are not allowed to understand this interaction.' using errcode='42501'; end if;
 if v_conversation.active_transcription_run_id is null or v_conversation.active_speaker_mapping_version_id is null then raise exception 'A completed transcript and confirmed speaker mapping are required.' using errcode='23514'; end if;
 if not exists(select 1 from public.transcription_runs where id=v_conversation.active_transcription_run_id and status='completed') or not exists(select 1 from public.transcript_segments where transcription_run_id=v_conversation.active_transcription_run_id) then raise exception 'The active transcript is not usable.' using errcode='23514'; end if;
 insert into public.analysis_runs(id,organization_id,conversation_id,source_transcription_run_id,speaker_mapping_version_id,provider,model,prompt_version,taxonomy_version,domain_pack_version,status) values(v_run_id,v_conversation.organization_id,p_conversation_id,v_conversation.active_transcription_run_id,v_conversation.active_speaker_mapping_version_id,'openai','gpt-5.6-luna','phase4.v1','phase4.electronics.v1','phase4.electronics.v1','pending');
 return v_run_id;
exception when unique_violation then raise exception 'Understanding is already pending or running.' using errcode='23505'; end; $$;
revoke all on function public.request_interaction_understanding(uuid) from public;
grant execute on function public.request_interaction_understanding(uuid) to authenticated;
