-- Phase 3: authenticated capture, immutable audio evidence and durable transcription requests.
-- This migration is deliberately forward-only. Provider output remains immutable; the
-- functions below only create new runs/mapping versions or advance operational state.

alter table public.recordings
  add column if not exists capture_source text not null default 'upload'
    check (capture_source in ('browser_recording', 'existing_upload')),
  add column if not exists original_filename text,
  add column if not exists finalized_at timestamptz;

alter table public.transcription_runs
  add column if not exists requested_by_membership_id uuid,
  add column if not exists workflow_run_id text,
  add column if not exists provider_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(provider_metadata) = 'object');

alter table public.transcription_runs
  add constraint transcription_runs_requested_by_fk
    foreign key (organization_id, requested_by_membership_id)
    references public.organization_memberships(organization_id, id);

create unique index transcription_runs_one_active_attempt_per_recording
  on public.transcription_runs(recording_id)
  where status in ('pending', 'running');

create or replace function private.can_process_recording(p_recording_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_upload_recording(p_recording_id)
$$;

create or replace function private.latest_customer_recording_consent_allows(
  p_conversation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select consent.status in ('granted', 'not_required')
    from public.consent_records as consent
    join public.conversation_participants as participant
      on participant.organization_id = consent.organization_id
     and participant.conversation_id = consent.conversation_id
     and participant.id = consent.participant_id
    where consent.conversation_id = p_conversation_id
      and participant.role = 'customer'
    order by consent.captured_at desc, consent.created_at desc
    limit 1
  ), false)
$$;

revoke all on function private.can_process_recording(uuid) from public;
revoke all on function private.latest_customer_recording_consent_allows(uuid) from public;
grant execute on function private.can_process_recording(uuid) to authenticated, service_role;
grant execute on function private.latest_customer_recording_consent_allows(uuid) to authenticated, service_role;

create or replace function public.append_customer_recording_consent(
  p_conversation_id uuid,
  p_status public.consent_status,
  p_capture_method public.consent_capture_method
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation public.conversations%rowtype;
  v_membership_id uuid;
  v_customer_id uuid;
  v_consent_id uuid := gen_random_uuid();
begin
  select * into v_conversation from public.conversations where id = p_conversation_id;
  if not found or not private.can_upload_conversation(p_conversation_id) then
    raise exception 'You are not allowed to update customer recording consent for this interaction.' using errcode = '42501';
  end if;

  v_membership_id := private.current_membership_id(v_conversation.organization_id);
  select id into v_customer_id
  from public.conversation_participants
  where organization_id = v_conversation.organization_id
    and conversation_id = p_conversation_id
    and role = 'customer'
    and membership_id is null
  order by created_at
  limit 1;

  if v_customer_id is null then
    raise exception 'This interaction has no anonymous customer participant.' using errcode = '23514';
  end if;

  insert into public.consent_records (
    id, organization_id, conversation_id, participant_id, status, capture_method,
    captured_at, captured_by_membership_id, evidence_metadata
  ) values (
    v_consent_id, v_conversation.organization_id, p_conversation_id, v_customer_id,
    p_status, p_capture_method, now(), v_membership_id,
    jsonb_build_object('source', 'phase3_consent_update', 'scope', 'customer_recording')
  );

  return v_consent_id;
end;
$$;

create or replace function public.prepare_recording_upload(
  p_conversation_id uuid,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_duration_milliseconds bigint,
  p_capture_source text,
  p_original_filename text default null
)
returns table(recording_id uuid, storage_bucket text, storage_object_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation public.conversations%rowtype;
  v_membership_id uuid;
  v_recording_id uuid := gen_random_uuid();
  v_filename text;
begin
  select * into v_conversation from public.conversations where id = p_conversation_id;
  if not found or not private.can_upload_conversation(p_conversation_id) then
    raise exception 'You are not allowed to add audio to this interaction.' using errcode = '42501';
  end if;
  if not private.latest_customer_recording_consent_allows(p_conversation_id) then
    raise exception 'Customer recording consent is required before audio can be added.' using errcode = '42501';
  end if;
  if p_mime_type not in ('audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/ogg') then
    raise exception 'This audio format is not supported.' using errcode = '22023';
  end if;
  if p_file_size_bytes < 1 or p_file_size_bytes > 104857600 then
    raise exception 'Audio must be between 1 byte and 100 MB.' using errcode = '22023';
  end if;
  if p_duration_milliseconds is null or p_duration_milliseconds < 1 or p_duration_milliseconds > 7200000 then
    raise exception 'Audio must be no longer than two hours.' using errcode = '22023';
  end if;
  if p_capture_source not in ('browser_recording', 'existing_upload') then
    raise exception 'Unsupported audio source.' using errcode = '22023';
  end if;

  v_membership_id := private.current_membership_id(v_conversation.organization_id);
  v_filename := case p_mime_type
    when 'audio/webm' then 'source.webm'
    when 'audio/mp4' then 'source.m4a'
    when 'audio/mpeg' then 'source.mp3'
    when 'audio/ogg' then 'source.ogg'
    else 'source.wav'
  end;

  insert into public.recordings (
    id, organization_id, conversation_id, storage_object_path, mime_type,
    file_size_bytes, duration_milliseconds, status, created_by_membership_id,
    capture_source, original_filename
  ) values (
    v_recording_id, v_conversation.organization_id, p_conversation_id,
    v_conversation.organization_id::text || '/' || p_conversation_id::text || '/' || v_recording_id::text || '/' || v_filename,
    p_mime_type, p_file_size_bytes, p_duration_milliseconds, 'pending', v_membership_id,
    p_capture_source, nullif(left(btrim(coalesce(p_original_filename, '')), 160), '')
  );

  return query select v_recording_id, 'conversation-audio'::text,
    v_conversation.organization_id::text || '/' || p_conversation_id::text || '/' || v_recording_id::text || '/' || v_filename;
end;
$$;

create or replace function public.finalize_recording_upload(p_recording_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recording public.recordings%rowtype;
  v_object_exists boolean;
begin
  select * into v_recording from public.recordings where id = p_recording_id;
  if not found or not private.can_process_recording(p_recording_id) then
    raise exception 'You are not allowed to finalize this audio.' using errcode = '42501';
  end if;
  if v_recording.status <> 'pending' then
    raise exception 'This audio is not awaiting upload finalization.' using errcode = '23514';
  end if;

  select exists (
    select 1 from storage.objects
    where bucket_id = v_recording.storage_bucket
      and name = v_recording.storage_object_path
  ) into v_object_exists;
  if not v_object_exists then
    raise exception 'The expected private audio object was not found.' using errcode = '23514';
  end if;

  update public.recordings
  set status = 'uploaded', finalized_at = now()
  where id = p_recording_id;
end;
$$;

create or replace function public.request_transcription_run(p_recording_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recording public.recordings%rowtype;
  v_run_id uuid := gen_random_uuid();
  v_membership_id uuid;
begin
  select * into v_recording from public.recordings where id = p_recording_id;
  if not found or not private.can_process_recording(p_recording_id) then
    raise exception 'You are not allowed to process this audio.' using errcode = '42501';
  end if;
  if v_recording.status <> 'uploaded' then
    raise exception 'Audio must be secured before transcription can start.' using errcode = '23514';
  end if;
  if not private.latest_customer_recording_consent_allows(v_recording.conversation_id) then
    raise exception 'Customer recording consent no longer permits processing.' using errcode = '42501';
  end if;

  v_membership_id := private.current_membership_id(v_recording.organization_id);
  insert into public.transcription_runs (
    id, organization_id, conversation_id, recording_id, provider, model,
    requested_language_mode, status, requested_by_membership_id
  ) values (
    v_run_id, v_recording.organization_id, v_recording.conversation_id, p_recording_id,
    'sarvam', 'saaras:v3', 'codemix', 'pending', v_membership_id
  );
  update public.conversations set lifecycle_status = 'processing' where id = v_recording.conversation_id;
  return v_run_id;
exception when unique_violation then
  raise exception 'A transcription is already pending or running for this audio.' using errcode = '23505';
end;
$$;

create or replace function public.create_speaker_mapping_version(
  p_transcription_run_id uuid,
  p_entries jsonb,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.transcription_runs%rowtype;
  v_mapping_id uuid := gen_random_uuid();
  v_membership_id uuid;
  v_entry jsonb;
  v_speaker text;
  v_role public.participant_role;
  v_participant_id uuid;
  v_version integer;
begin
  select * into v_run from public.transcription_runs where id = p_transcription_run_id;
  if not found or not private.can_process_recording(v_run.recording_id) then
    raise exception 'You are not allowed to map speakers for this transcript.' using errcode = '42501';
  end if;
  if v_run.status <> 'completed' then
    raise exception 'Speaker mapping requires a completed transcript.' using errcode = '23514';
  end if;
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) = 0 then
    raise exception 'At least one speaker mapping is required.' using errcode = '22023';
  end if;

  v_membership_id := private.current_membership_id(v_run.organization_id);
  select coalesce(max(version_number), 0) + 1 into v_version
  from public.speaker_mapping_versions where transcription_run_id = p_transcription_run_id;

  update public.speaker_mapping_versions
  set status = 'superseded'
  where transcription_run_id = p_transcription_run_id and status = 'active';

  insert into public.speaker_mapping_versions (
    id, organization_id, conversation_id, transcription_run_id, version_number,
    source, status, reason, created_by_membership_id
  ) values (
    v_mapping_id, v_run.organization_id, v_run.conversation_id, p_transcription_run_id,
    v_version, 'human', 'active', nullif(left(btrim(coalesce(p_reason, '')), 500), ''), v_membership_id
  );

  for v_entry in select value from jsonb_array_elements(p_entries) loop
    v_speaker := nullif(btrim(v_entry ->> 'providerSpeakerIdentifier'), '');
    v_role := (v_entry ->> 'participantRole')::public.participant_role;
    v_participant_id := nullif(v_entry ->> 'participantId', '')::uuid;
    if v_speaker is null or not exists (
      select 1 from public.transcript_segments
      where transcription_run_id = p_transcription_run_id and provider_speaker_identifier = v_speaker
    ) then
      raise exception 'Unknown provider speaker identifier.' using errcode = '22023';
    end if;
    if v_participant_id is not null and not exists (
      select 1 from public.conversation_participants
      where id = v_participant_id and organization_id = v_run.organization_id
        and conversation_id = v_run.conversation_id and role = v_role
    ) then
      raise exception 'Participant does not belong to this interaction or role.' using errcode = '22023';
    end if;
    insert into public.speaker_mapping_entries (
      organization_id, conversation_id, transcription_run_id, speaker_mapping_version_id,
      provider_speaker_identifier, participant_role, participant_id
    ) values (
      v_run.organization_id, v_run.conversation_id, p_transcription_run_id, v_mapping_id,
      v_speaker, v_role, v_participant_id
    );
  end loop;

  update public.conversations
  set active_speaker_mapping_version_id = v_mapping_id, lifecycle_status = 'ready'
  where id = v_run.conversation_id;
  return v_mapping_id;
end;
$$;

revoke all on function public.append_customer_recording_consent(uuid, public.consent_status, public.consent_capture_method) from public;
revoke all on function public.prepare_recording_upload(uuid, text, bigint, bigint, text, text) from public;
revoke all on function public.finalize_recording_upload(uuid) from public;
revoke all on function public.request_transcription_run(uuid) from public;
revoke all on function public.create_speaker_mapping_version(uuid, jsonb, text) from public;
grant execute on function public.append_customer_recording_consent(uuid, public.consent_status, public.consent_capture_method) to authenticated;
grant execute on function public.prepare_recording_upload(uuid, text, bigint, bigint, text, text) to authenticated;
grant execute on function public.finalize_recording_upload(uuid) to authenticated;
grant execute on function public.request_transcription_run(uuid) to authenticated;
grant execute on function public.create_speaker_mapping_version(uuid, jsonb, text) to authenticated;

comment on function public.prepare_recording_upload(uuid, text, bigint, bigint, text, text) is
  'Creates exact authorized private-audio metadata before the browser uploads. Client-provided file metadata is guarded again by trusted processing.';
comment on function public.finalize_recording_upload(uuid) is
  'Marks audio uploaded only after an exact expected object exists in the private bucket.';
comment on function public.request_transcription_run(uuid) is
  'Creates one immutable pending Sarvam transcription attempt per recording; concurrent pending/running attempts are blocked.';
