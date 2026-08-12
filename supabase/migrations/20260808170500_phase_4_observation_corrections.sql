-- Phase 4: controlled correction overlays. AI observations remain immutable.
create or replace function public.propose_observation_correction(
  p_observation_id uuid,
  p_proposed_value jsonb,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_observation public.structured_observations%rowtype;
  v_membership_id uuid;
  v_correction_id uuid := gen_random_uuid();
begin
  select * into v_observation from public.structured_observations where id = p_observation_id;
  if not found or not private.can_access_conversation(v_observation.conversation_id) then
    raise exception 'You are not allowed to correct this observation.' using errcode = '42501';
  end if;
  v_membership_id := private.current_membership_id(v_observation.organization_id);
  if v_membership_id is null then
    raise exception 'An active organization membership is required.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.conversations as conversation
    where conversation.id = v_observation.conversation_id
      and (
        conversation.representative_membership_id = v_membership_id
        or private.is_org_admin(v_observation.organization_id)
      )
  ) then
    raise exception 'Only the interaction representative or an administrator may propose a correction.' using errcode = '42501';
  end if;
  insert into public.observation_corrections(
    id, organization_id, conversation_id, observation_id, proposed_value, reason, proposed_by_membership_id
  ) values (
    v_correction_id, v_observation.organization_id, v_observation.conversation_id, p_observation_id,
    p_proposed_value, nullif(trim(p_reason), ''), v_membership_id
  );
  return v_correction_id;
end;
$$;

create or replace function public.review_observation_correction(
  p_correction_id uuid,
  p_review_state public.review_state
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_correction public.observation_corrections%rowtype;
  v_membership_id uuid;
begin
  if p_review_state not in ('confirmed', 'rejected') then
    raise exception 'A correction may only be confirmed or rejected.' using errcode = '23514';
  end if;
  select * into v_correction from public.observation_corrections where id = p_correction_id;
  if not found or not private.can_access_conversation(v_correction.conversation_id) then
    raise exception 'You are not allowed to review this correction.' using errcode = '42501';
  end if;
  if not (private.is_org_admin(v_correction.organization_id) or private.is_org_manager(v_correction.organization_id)) then
    raise exception 'Only a manager or administrator may review a correction.' using errcode = '42501';
  end if;
  v_membership_id := private.current_membership_id(v_correction.organization_id);
  update public.observation_corrections
  set review_state = p_review_state, reviewed_by_membership_id = v_membership_id, reviewed_at = now()
  where id = p_correction_id and review_state = 'unreviewed';
  if not found then
    raise exception 'This correction has already been reviewed.' using errcode = '23505';
  end if;
end;
$$;

revoke all on function public.propose_observation_correction(uuid, jsonb, text) from public;
revoke all on function public.review_observation_correction(uuid, public.review_state) from public;
grant execute on function public.propose_observation_correction(uuid, jsonb, text) to authenticated;
grant execute on function public.review_observation_correction(uuid, public.review_state) to authenticated;
