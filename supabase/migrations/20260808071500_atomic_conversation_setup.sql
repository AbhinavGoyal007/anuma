-- Atomic Phase 2 conversation shell creation. Runs as the authenticated caller,
-- so table grants, RLS, assignment scope, and tenant checks remain authoritative.

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
  v_participant_id uuid := gen_random_uuid();
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
  ) values (
    v_participant_id,
    p_organization_id,
    v_conversation_id,
    'representative',
    v_membership_id,
    'Representative'
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
    v_participant_id,
    p_consent_status,
    p_consent_capture_method,
    now(),
    v_membership_id,
    jsonb_build_object('source', 'phase2_conversation_setup')
  );

  return v_conversation_id;
end;
$$;

revoke all on function public.create_conversation_with_consent(
  uuid,
  public.conversation_vertical,
  timestamptz,
  uuid,
  uuid,
  text,
  public.consent_status,
  public.consent_capture_method
) from public;
grant execute on function public.create_conversation_with_consent(
  uuid,
  public.conversation_vertical,
  timestamptz,
  uuid,
  uuid,
  text,
  public.consent_status,
  public.consent_capture_method
) to authenticated;

comment on function public.create_conversation_with_consent(
  uuid,
  public.conversation_vertical,
  timestamptz,
  uuid,
  uuid,
  text,
  public.consent_status,
  public.consent_capture_method
) is 'Creates a conversation shell, representative participant, and consent provenance atomically under caller RLS.';
