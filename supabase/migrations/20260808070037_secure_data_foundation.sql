-- Phase 2: minimum secure persistent foundation for ANUMA's end-to-end MVP.
-- All business timestamps are timestamptz (UTC at rest). Transcript offsets use
-- integer milliseconds so no precision is implied beyond provider segment timing.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create type public.membership_role as enum ('representative', 'manager', 'admin');
create type public.membership_status as enum ('active', 'inactive');
create type public.location_type as enum ('store', 'showroom', 'office', 'other');
create type public.conversation_vertical as enum ('electronics', 'automotive');
create type public.conversation_status as enum ('draft', 'ready_for_recording', 'processing', 'ready', 'partial', 'failed', 'archived');
create type public.participant_role as enum ('representative', 'customer', 'additional_customer', 'manager', 'unknown');
create type public.consent_status as enum ('granted', 'declined', 'withdrawn', 'not_required', 'unknown');
create type public.consent_capture_method as enum ('verbal', 'written', 'digital', 'imported', 'other');
create type public.recording_status as enum ('pending', 'uploading', 'uploaded', 'failed', 'deleted');
create type public.run_status as enum ('pending', 'running', 'completed', 'failed', 'cancelled');
create type public.speaker_mapping_source as enum ('model', 'human', 'hybrid');
create type public.speaker_mapping_status as enum ('draft', 'active', 'superseded');
create type public.outcome_source as enum ('manual', 'import');
create type public.quality_state as enum ('adequate', 'limited', 'insufficient', 'unknown', 'not_assessed');
create type public.review_state as enum ('unreviewed', 'confirmed', 'needs_review', 'rejected');

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  country_code text not null default 'IN' check (country_code ~ '^[A-Z]{2}$'),
  default_currency text not null default 'INR' check (default_currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'Asia/Kolkata' check (char_length(timezone) between 3 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  role public.membership_role not null,
  status public.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id),
  unique (organization_id, id)
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  business_code text check (business_code is null or char_length(btrim(business_code)) between 1 and 40),
  location_type public.location_type not null default 'other',
  timezone text check (timezone is null or char_length(timezone) between 3 and 64),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (organization_id, id)
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (organization_id, id)
);

create table public.member_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  membership_id uuid not null,
  location_id uuid,
  team_id uuid,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_assignments_membership_fk foreign key (organization_id, membership_id)
    references public.organization_memberships(organization_id, id) on delete cascade,
  constraint member_assignments_location_fk foreign key (organization_id, location_id)
    references public.locations(organization_id, id),
  constraint member_assignments_team_fk foreign key (organization_id, team_id)
    references public.teams(organization_id, id),
  constraint member_assignments_scope_check check (location_id is not null or team_id is not null),
  constraint member_assignments_dates_check check (effective_to is null or effective_to > effective_from),
  unique (organization_id, id)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by_membership_id uuid not null,
  representative_membership_id uuid not null,
  location_id uuid,
  team_id uuid,
  vertical public.conversation_vertical not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  lifecycle_status public.conversation_status not null default 'draft',
  title text check (title is null or char_length(btrim(title)) between 1 and 160),
  active_transcription_run_id uuid,
  active_speaker_mapping_version_id uuid,
  active_analysis_run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_creator_fk foreign key (organization_id, created_by_membership_id)
    references public.organization_memberships(organization_id, id),
  constraint conversations_representative_fk foreign key (organization_id, representative_membership_id)
    references public.organization_memberships(organization_id, id),
  constraint conversations_location_fk foreign key (organization_id, location_id)
    references public.locations(organization_id, id),
  constraint conversations_team_fk foreign key (organization_id, team_id)
    references public.teams(organization_id, id),
  constraint conversations_dates_check check (ended_at is null or ended_at >= started_at),
  unique (organization_id, id)
);

create table public.conversation_participants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid not null,
  role public.participant_role not null,
  membership_id uuid,
  display_label text check (display_label is null or char_length(btrim(display_label)) between 1 and 120),
  created_at timestamptz not null default now(),
  constraint conversation_participants_conversation_fk foreign key (organization_id, conversation_id)
    references public.conversations(organization_id, id) on delete cascade,
  constraint conversation_participants_membership_fk foreign key (organization_id, membership_id)
    references public.organization_memberships(organization_id, id),
  unique (organization_id, conversation_id, id)
);

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid not null,
  participant_id uuid,
  status public.consent_status not null,
  capture_method public.consent_capture_method not null,
  captured_at timestamptz not null,
  captured_by_membership_id uuid not null,
  evidence_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint consent_records_conversation_fk foreign key (organization_id, conversation_id)
    references public.conversations(organization_id, id) on delete cascade,
  constraint consent_records_participant_fk foreign key (organization_id, conversation_id, participant_id)
    references public.conversation_participants(organization_id, conversation_id, id),
  constraint consent_records_captured_by_fk foreign key (organization_id, captured_by_membership_id)
    references public.organization_memberships(organization_id, id),
  unique (organization_id, conversation_id, id)
);

create table public.recordings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid not null,
  storage_bucket text not null default 'conversation-audio' check (storage_bucket = 'conversation-audio'),
  storage_object_path text not null,
  mime_type text not null check (mime_type like 'audio/%'),
  file_size_bytes bigint not null check (file_size_bytes >= 0),
  duration_milliseconds bigint check (duration_milliseconds is null or duration_milliseconds >= 0),
  checksum_sha256 text check (checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$'),
  status public.recording_status not null default 'pending',
  created_by_membership_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recordings_conversation_fk foreign key (organization_id, conversation_id)
    references public.conversations(organization_id, id) on delete cascade,
  constraint recordings_created_by_fk foreign key (organization_id, created_by_membership_id)
    references public.organization_memberships(organization_id, id),
  constraint recordings_storage_path_check check (
    storage_object_path like organization_id::text || '/' || conversation_id::text || '/' || id::text || '/%'
  ),
  unique (storage_bucket, storage_object_path),
  unique (organization_id, conversation_id, id),
  unique (organization_id, id)
);

create table public.transcription_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid not null,
  recording_id uuid not null,
  provider text not null check (char_length(btrim(provider)) between 1 and 80),
  model text not null check (char_length(btrim(model)) between 1 and 120),
  provider_model_version text,
  status public.run_status not null default 'pending',
  provider_request_id text,
  requested_language_mode text,
  started_at timestamptz,
  completed_at timestamptz,
  latency_milliseconds bigint check (latency_milliseconds is null or latency_milliseconds >= 0),
  cost_minor bigint check (cost_minor is null or cost_minor >= 0),
  cost_currency text check (cost_currency is null or cost_currency ~ '^[A-Z]{3}$'),
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  constraint transcription_runs_recording_fk foreign key (organization_id, conversation_id, recording_id)
    references public.recordings(organization_id, conversation_id, id),
  constraint transcription_runs_dates_check check (completed_at is null or started_at is null or completed_at >= started_at),
  unique (organization_id, conversation_id, id),
  unique (organization_id, id)
);

create table public.transcript_segments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid not null,
  transcription_run_id uuid not null,
  sequence_number integer not null check (sequence_number >= 0),
  provider_speaker_identifier text,
  start_milliseconds bigint not null check (start_milliseconds >= 0),
  end_milliseconds bigint not null check (end_milliseconds >= start_milliseconds),
  original_text text not null check (char_length(original_text) > 0),
  confidence numeric(6,5) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  detected_languages text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint transcript_segments_run_fk foreign key (organization_id, conversation_id, transcription_run_id)
    references public.transcription_runs(organization_id, conversation_id, id) on delete cascade,
  unique (transcription_run_id, sequence_number),
  unique (organization_id, conversation_id, transcription_run_id, id)
);

create table public.speaker_mapping_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid not null,
  transcription_run_id uuid not null,
  version_number integer not null check (version_number > 0),
  source public.speaker_mapping_source not null,
  status public.speaker_mapping_status not null default 'draft',
  reason text,
  created_by_membership_id uuid,
  created_at timestamptz not null default now(),
  constraint speaker_mapping_versions_run_fk foreign key (organization_id, conversation_id, transcription_run_id)
    references public.transcription_runs(organization_id, conversation_id, id) on delete cascade,
  constraint speaker_mapping_versions_creator_fk foreign key (organization_id, created_by_membership_id)
    references public.organization_memberships(organization_id, id),
  unique (transcription_run_id, version_number),
  unique (organization_id, conversation_id, transcription_run_id, id),
  unique (organization_id, conversation_id, id)
);

create unique index speaker_mapping_versions_one_active_per_run
  on public.speaker_mapping_versions(transcription_run_id)
  where status = 'active';

create table public.speaker_mapping_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid not null,
  transcription_run_id uuid not null,
  speaker_mapping_version_id uuid not null,
  provider_speaker_identifier text not null,
  participant_role public.participant_role not null,
  participant_id uuid,
  created_at timestamptz not null default now(),
  constraint speaker_mapping_entries_version_fk foreign key (organization_id, conversation_id, transcription_run_id, speaker_mapping_version_id)
    references public.speaker_mapping_versions(organization_id, conversation_id, transcription_run_id, id) on delete cascade,
  constraint speaker_mapping_entries_participant_fk foreign key (organization_id, conversation_id, participant_id)
    references public.conversation_participants(organization_id, conversation_id, id),
  unique (speaker_mapping_version_id, provider_speaker_identifier)
);

create table public.analysis_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid not null,
  source_transcription_run_id uuid not null,
  speaker_mapping_version_id uuid,
  provider text not null check (char_length(btrim(provider)) between 1 and 80),
  model text not null check (char_length(btrim(model)) between 1 and 120),
  model_version text,
  prompt_version text not null,
  taxonomy_version text not null,
  domain_pack_version text not null,
  status public.run_status not null default 'pending',
  started_at timestamptz,
  completed_at timestamptz,
  input_tokens bigint check (input_tokens is null or input_tokens >= 0),
  output_tokens bigint check (output_tokens is null or output_tokens >= 0),
  latency_milliseconds bigint check (latency_milliseconds is null or latency_milliseconds >= 0),
  cost_minor bigint check (cost_minor is null or cost_minor >= 0),
  cost_currency text check (cost_currency is null or cost_currency ~ '^[A-Z]{3}$'),
  provider_request_id text,
  error_code text,
  error_message text,
  provenance_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance_metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint analysis_runs_transcription_fk foreign key (organization_id, conversation_id, source_transcription_run_id)
    references public.transcription_runs(organization_id, conversation_id, id),
  constraint analysis_runs_mapping_fk foreign key (organization_id, conversation_id, source_transcription_run_id, speaker_mapping_version_id)
    references public.speaker_mapping_versions(organization_id, conversation_id, transcription_run_id, id),
  constraint analysis_runs_dates_check check (completed_at is null or started_at is null or completed_at >= started_at),
  unique (organization_id, conversation_id, source_transcription_run_id, id),
  unique (organization_id, conversation_id, id),
  unique (organization_id, id)
);

create table public.evidence_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid not null,
  purpose text not null check (char_length(btrim(purpose)) between 1 and 120),
  source_analysis_run_id uuid,
  created_by_membership_id uuid,
  created_at timestamptz not null default now(),
  constraint evidence_groups_conversation_fk foreign key (organization_id, conversation_id)
    references public.conversations(organization_id, id) on delete cascade,
  constraint evidence_groups_analysis_fk foreign key (organization_id, conversation_id, source_analysis_run_id)
    references public.analysis_runs(organization_id, conversation_id, id),
  constraint evidence_groups_creator_fk foreign key (organization_id, created_by_membership_id)
    references public.organization_memberships(organization_id, id),
  unique (organization_id, conversation_id, id)
);

create table public.evidence_references (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid not null,
  evidence_group_id uuid not null,
  transcription_run_id uuid not null,
  transcript_segment_id uuid not null,
  sequence_number integer not null check (sequence_number >= 0),
  start_milliseconds bigint,
  end_milliseconds bigint,
  excerpt_checksum_sha256 text check (excerpt_checksum_sha256 is null or excerpt_checksum_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  constraint evidence_references_group_fk foreign key (organization_id, conversation_id, evidence_group_id)
    references public.evidence_groups(organization_id, conversation_id, id) on delete cascade,
  constraint evidence_references_segment_fk foreign key (organization_id, conversation_id, transcription_run_id, transcript_segment_id)
    references public.transcript_segments(organization_id, conversation_id, transcription_run_id, id),
  constraint evidence_references_offsets_check check (
    (start_milliseconds is null and end_milliseconds is null)
    or (start_milliseconds is not null and end_milliseconds is not null and start_milliseconds >= 0 and end_milliseconds >= start_milliseconds)
  ),
  unique (evidence_group_id, sequence_number)
);

create table public.outcome_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid not null,
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  occurred_at timestamptz not null,
  value_amount_minor bigint check (value_amount_minor is null or value_amount_minor >= 0),
  currency_code text check (currency_code is null or currency_code ~ '^[A-Z]{3}$'),
  external_reference text,
  source public.outcome_source not null default 'manual',
  created_by_membership_id uuid not null,
  created_at timestamptz not null default now(),
  constraint outcome_events_conversation_fk foreign key (organization_id, conversation_id)
    references public.conversations(organization_id, id) on delete cascade,
  constraint outcome_events_creator_fk foreign key (organization_id, created_by_membership_id)
    references public.organization_memberships(organization_id, id),
  constraint outcome_events_money_check check (
    (value_amount_minor is null and currency_code is null)
    or (value_amount_minor is not null and currency_code is not null)
  ),
  unique (organization_id, conversation_id, id)
);

create table public.conversation_quality_assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid not null,
  transcription_run_id uuid,
  speaker_mapping_version_id uuid,
  analysis_run_id uuid,
  policy_version text not null,
  producer text not null,
  producer_version text not null,
  audio_quality public.quality_state not null default 'not_assessed',
  transcription_quality public.quality_state not null default 'not_assessed',
  diarization_quality public.quality_state not null default 'not_assessed',
  speaker_mapping_quality public.quality_state not null default 'not_assessed',
  semantic_analysis_quality public.quality_state not null default 'not_assessed',
  analytics_eligible boolean,
  benchmark_eligible boolean,
  outcome_comparison_eligible boolean,
  exclusion_reason text,
  review_state public.review_state not null default 'unreviewed',
  provenance_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance_metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint quality_assessments_conversation_fk foreign key (organization_id, conversation_id)
    references public.conversations(organization_id, id) on delete cascade,
  constraint quality_assessments_transcription_fk foreign key (organization_id, conversation_id, transcription_run_id)
    references public.transcription_runs(organization_id, conversation_id, id),
  constraint quality_assessments_mapping_fk foreign key (organization_id, conversation_id, transcription_run_id, speaker_mapping_version_id)
    references public.speaker_mapping_versions(organization_id, conversation_id, transcription_run_id, id),
  constraint quality_assessments_analysis_fk foreign key (organization_id, conversation_id, transcription_run_id, analysis_run_id)
    references public.analysis_runs(organization_id, conversation_id, source_transcription_run_id, id),
  constraint quality_assessments_mapping_source_check check (speaker_mapping_version_id is null or transcription_run_id is not null),
  constraint quality_assessments_analysis_source_check check (analysis_run_id is null or transcription_run_id is not null),
  constraint quality_assessments_eligibility_presence_check check (
    analytics_eligible is not null or (benchmark_eligible is null and outcome_comparison_eligible is null)
  ),
  constraint quality_assessments_benchmark_check check (benchmark_eligible is distinct from true or analytics_eligible is true),
  constraint quality_assessments_outcome_check check (outcome_comparison_eligible is distinct from true or analytics_eligible is true),
  unique (organization_id, conversation_id, id)
);

alter table public.conversations
  add constraint conversations_active_transcription_fk
    foreign key (organization_id, id, active_transcription_run_id)
    references public.transcription_runs(organization_id, conversation_id, id),
  add constraint conversations_active_mapping_fk
    foreign key (organization_id, id, active_speaker_mapping_version_id)
    references public.speaker_mapping_versions(organization_id, conversation_id, id),
  add constraint conversations_active_analysis_fk
    foreign key (organization_id, id, active_analysis_run_id)
    references public.analysis_runs(organization_id, conversation_id, id);

create index organization_memberships_user_active_idx on public.organization_memberships(user_id, organization_id) where status = 'active';
create index member_assignments_membership_dates_idx on public.member_assignments(membership_id, effective_from, effective_to);
create index member_assignments_scope_idx on public.member_assignments(organization_id, location_id, team_id);
create index conversations_org_started_idx on public.conversations(organization_id, started_at desc);
create index conversations_representative_idx on public.conversations(representative_membership_id, started_at desc);
create index conversations_location_team_idx on public.conversations(organization_id, location_id, team_id, started_at desc);
create index recordings_conversation_idx on public.recordings(conversation_id, created_at);
create index transcription_runs_conversation_idx on public.transcription_runs(conversation_id, created_at desc);
create index transcript_segments_run_sequence_idx on public.transcript_segments(transcription_run_id, sequence_number);
create index analysis_runs_conversation_idx on public.analysis_runs(conversation_id, created_at desc);
create index outcome_events_conversation_occurred_idx on public.outcome_events(conversation_id, occurred_at desc);
create index quality_assessments_conversation_idx on public.conversation_quality_assessments(conversation_id, created_at desc);
create index quality_assessments_analytics_idx on public.conversation_quality_assessments(organization_id, analytics_eligible);
create index quality_assessments_benchmark_idx on public.conversation_quality_assessments(organization_id, benchmark_eligible);
create index quality_assessments_outcome_idx on public.conversation_quality_assessments(organization_id, outcome_comparison_eligible);

create trigger organizations_set_updated_at before update on public.organizations
  for each row execute function private.set_updated_at();
create trigger organization_memberships_set_updated_at before update on public.organization_memberships
  for each row execute function private.set_updated_at();
create trigger locations_set_updated_at before update on public.locations
  for each row execute function private.set_updated_at();
create trigger teams_set_updated_at before update on public.teams
  for each row execute function private.set_updated_at();
create trigger member_assignments_set_updated_at before update on public.member_assignments
  for each row execute function private.set_updated_at();
create trigger conversations_set_updated_at before update on public.conversations
  for each row execute function private.set_updated_at();
create trigger recordings_set_updated_at before update on public.recordings
  for each row execute function private.set_updated_at();

create or replace function private.validate_evidence_reference()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_segment_start bigint;
  v_segment_end bigint;
begin
  select segment.start_milliseconds, segment.end_milliseconds
    into v_segment_start, v_segment_end
  from public.transcript_segments as segment
  where segment.id = new.transcript_segment_id
    and segment.transcription_run_id = new.transcription_run_id
    and segment.conversation_id = new.conversation_id
    and segment.organization_id = new.organization_id;

  if not found then
    raise exception 'Evidence segment does not match its organization, conversation, or run.';
  end if;

  if new.start_milliseconds is not null
    and (new.start_milliseconds < v_segment_start or new.end_milliseconds > v_segment_end) then
    raise exception 'Evidence offsets must remain inside the source transcript segment.';
  end if;

  return new;
end;
$$;

create trigger evidence_references_validate_bounds before insert or update on public.evidence_references
  for each row execute function private.validate_evidence_reference();

comment on table public.conversations is 'MVP CORE business interaction record; separate from recordings, transcripts, analyses, and outcomes.';
comment on table public.transcript_segments is 'Immutable provider transcript segments. Time offsets are integer milliseconds.';
comment on table public.evidence_references is 'MVP SUPPORTING relational evidence side; Phase 4 adds typed semantic target bindings.';
comment on table public.outcome_events is 'MVP CORE append-only external business events independent of trackers, scorecards, and coaching.';
comment on column public.conversations.active_transcription_run_id is 'Explicit selected result; never infer permanent business state from latest-created run.';
