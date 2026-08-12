-- Automatic speaker mapping: assign rep/customer roles without a human.
--
-- At hundreds or thousands of conversations a day nobody can map speakers by
-- hand, so the system must decide who is the representative and who is the
-- customer on its own. The existing mapping function is built for a manager in
-- the dashboard: it demands an authenticated membership and stamps every
-- mapping as 'human'. Neither fits a server-initiated decision.
--
-- This adds a confidence signal and a server-only function that records the
-- decision as what it is — a model's judgement, with a number saying how sure
-- it was — so downstream can weight or audit a low-confidence mapping rather
-- than pretend every automatic call is certain.

alter table public.speaker_mapping_versions
  add column if not exists confidence numeric(4, 3)
    check (confidence is null or (confidence >= 0 and confidence <= 1));

comment on column public.speaker_mapping_versions.confidence is
  'How sure an automatic mapping was, 0..1. Null for human mappings.';

-- Server-initiated mapping. No auth.uid() gate: this runs from the transcription
-- pipeline, not a user session. It still validates every speaker against the
-- transcript, so a mapping can never name a speaker the audio did not contain.
create or replace function public.create_automatic_speaker_mapping(
  p_transcription_run_id uuid,
  p_entries jsonb,
  p_confidence numeric,
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
  v_entry jsonb;
  v_speaker text;
  v_role public.participant_role;
  v_version integer;
begin
  select * into v_run from public.transcription_runs where id = p_transcription_run_id;
  if not found then
    raise exception 'Transcription run was not found.' using errcode = 'P0002';
  end if;
  if v_run.status <> 'completed' then
    raise exception 'Speaker mapping requires a completed transcript.' using errcode = '23514';
  end if;
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) = 0 then
    raise exception 'At least one speaker mapping is required.' using errcode = '22023';
  end if;

  select coalesce(max(version_number), 0) + 1 into v_version
  from public.speaker_mapping_versions where transcription_run_id = p_transcription_run_id;

  -- A fresh automatic run supersedes whatever was active, exactly as a human
  -- re-map would, so the newest decision is the one downstream reads.
  update public.speaker_mapping_versions
  set status = 'superseded'
  where transcription_run_id = p_transcription_run_id and status = 'active';

  insert into public.speaker_mapping_versions (
    id, organization_id, conversation_id, transcription_run_id, version_number,
    source, status, reason, confidence, created_by_membership_id
  ) values (
    v_mapping_id, v_run.organization_id, v_run.conversation_id, p_transcription_run_id,
    v_version, 'model', 'active', nullif(left(btrim(coalesce(p_reason, '')), 500), ''),
    greatest(0, least(1, coalesce(p_confidence, 0))), null
  );

  for v_entry in select value from jsonb_array_elements(p_entries) loop
    v_speaker := nullif(btrim(v_entry ->> 'providerSpeakerIdentifier'), '');
    v_role := (v_entry ->> 'participantRole')::public.participant_role;
    if v_speaker is null or not exists (
      select 1 from public.transcript_segments
      where transcription_run_id = p_transcription_run_id and provider_speaker_identifier = v_speaker
    ) then
      raise exception 'Unknown provider speaker identifier.' using errcode = '22023';
    end if;
    insert into public.speaker_mapping_entries (
      organization_id, conversation_id, transcription_run_id, speaker_mapping_version_id,
      provider_speaker_identifier, participant_role, participant_id
    ) values (
      v_run.organization_id, v_run.conversation_id, p_transcription_run_id, v_mapping_id,
      v_speaker, v_role, null
    );
  end loop;

  update public.conversations
  set active_speaker_mapping_version_id = v_mapping_id, lifecycle_status = 'ready'
  where id = v_run.conversation_id;
  return v_mapping_id;
end;
$$;

revoke all on function public.create_automatic_speaker_mapping(uuid, jsonb, numeric, text) from public;
