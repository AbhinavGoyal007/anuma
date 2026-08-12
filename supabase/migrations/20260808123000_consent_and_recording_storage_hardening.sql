-- Phase 2.1: correct customer recording-consent provenance and bind private
-- audio object authorization to immutable recording metadata.

create or replace function public.create_conversation_with_consent(
  p_organization_id uuid,
  p_vertical public.conversation_vertical,
  p_started_at timestamptz,
  p_location_id uuid default null,
  p_team_id uuid default null,
  p_title text default null,
  p_consent_status public.consent_status default 'unknown',
  p_consent_capture_method public.consent_capture_method default 'digital'
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_membership_id uuid;
  v_conversation_id uuid := gen_random_uuid();
  v_representative_participant_id uuid := gen_random_uuid();
  v_customer_participant_id uuid := gen_random_uuid();
begin
  v_membership_id := private.current_membership_id(p_organization_id);

  if v_membership_id is null then
    raise exception 'An active organization membership is required.' using errcode = '42501';
  end if;

  insert into public.conversations (
    id,
    organization_id,
    created_by_membership_id,
    representative_membership_id,
    location_id,
    team_id,
    vertical,
    started_at,
    lifecycle_status,
    title
  ) values (
    v_conversation_id,
    p_organization_id,
    v_membership_id,
    v_membership_id,
    p_location_id,
    p_team_id,
    p_vertical,
    p_started_at,
    'ready_for_recording',
    nullif(btrim(p_title), '')
  );

  insert into public.conversation_participants (
    id,
    organization_id,
    conversation_id,
    role,
    membership_id,
    display_label
  ) values
    (
      v_representative_participant_id,
      p_organization_id,
      v_conversation_id,
      'representative',
      v_membership_id,
      'Representative'
    ),
    (
      v_customer_participant_id,
      p_organization_id,
      v_conversation_id,
      'customer',
      null,
      'Customer'
    );

  insert into public.consent_records (
    organization_id,
    conversation_id,
    participant_id,
    status,
    capture_method,
    captured_at,
    captured_by_membership_id,
    evidence_metadata
  ) values (
    p_organization_id,
    v_conversation_id,
    v_customer_participant_id,
    p_consent_status,
    p_consent_capture_method,
    now(),
    v_membership_id,
    jsonb_build_object('source', 'conversation_setup', 'scope', 'customer_recording')
  );

  return v_conversation_id;
end;
$$;

create or replace function private.can_upload_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations as conversation
    join public.organization_memberships as membership
      on membership.organization_id = conversation.organization_id
     and membership.user_id = (select auth.uid())
     and membership.status = 'active'
    where conversation.id = p_conversation_id
      and (
        membership.role = 'admin'
        or conversation.representative_membership_id = membership.id
      )
  )
$$;

create or replace function private.can_upload_recording(p_recording_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.recordings as recording
    join public.conversations as conversation
      on conversation.organization_id = recording.organization_id
     and conversation.id = recording.conversation_id
    join public.organization_memberships as membership
      on membership.organization_id = recording.organization_id
     and membership.user_id = (select auth.uid())
     and membership.status = 'active'
    where recording.id = p_recording_id
      and recording.created_by_membership_id = membership.id
      and (
        membership.role = 'admin'
        or conversation.representative_membership_id = membership.id
      )
  )
$$;

revoke all on function private.can_upload_conversation(uuid) from public;
revoke all on function private.can_upload_recording(uuid) from public;
grant execute on function private.can_upload_conversation(uuid) to authenticated, service_role;
grant execute on function private.can_upload_recording(uuid) to authenticated, service_role;

drop policy recordings_insert_parent on public.recordings;
create policy recordings_insert_upload_authority on public.recordings for insert to authenticated
  with check (
    (select private.can_upload_conversation(conversation_id))
    and created_by_membership_id = (select private.current_membership_id(organization_id))
  );

drop policy conversation_audio_select on storage.objects;
create policy conversation_audio_select on storage.objects for select to authenticated
  using (
    bucket_id = 'conversation-audio'
    and array_length(storage.foldername(name), 1) >= 3
    and exists (
      select 1
      from public.recordings as recording
      where recording.storage_bucket = storage.objects.bucket_id
        and recording.storage_object_path = storage.objects.name
        and recording.organization_id::text = (storage.foldername(storage.objects.name))[1]
        and recording.conversation_id::text = (storage.foldername(storage.objects.name))[2]
        and recording.id::text = (storage.foldername(storage.objects.name))[3]
        and (select private.can_access_conversation(recording.conversation_id))
    )
  );

drop policy conversation_audio_insert on storage.objects;
create policy conversation_audio_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'conversation-audio'
    and array_length(storage.foldername(name), 1) >= 3
    and exists (
      select 1
      from public.recordings as recording
      where recording.storage_bucket = storage.objects.bucket_id
        and recording.storage_object_path = storage.objects.name
        and recording.organization_id::text = (storage.foldername(storage.objects.name))[1]
        and recording.conversation_id::text = (storage.foldername(storage.objects.name))[2]
        and recording.id::text = (storage.foldername(storage.objects.name))[3]
        and (select private.can_upload_recording(recording.id))
    )
  );

comment on function public.create_conversation_with_consent(
  uuid,
  public.conversation_vertical,
  timestamptz,
  uuid,
  uuid,
  text,
  public.consent_status,
  public.consent_capture_method
) is 'Creates a conversation with a representative and anonymous customer participant. The consent record captures customer recording-consent provenance; it is not a legal-compliance determination.';

comment on function private.can_upload_conversation(uuid) is
  'Recording metadata may be created only by the interaction representative or an organization admin. Manager read scope does not confer upload authority.';
comment on function private.can_upload_recording(uuid) is
  'Private audio upload requires an exact recording row/path created by the caller and representative-or-admin authority for the parent conversation.';
