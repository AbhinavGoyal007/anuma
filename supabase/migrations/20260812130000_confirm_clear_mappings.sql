-- Confirming the proposals that were never in doubt.
--
-- A retailer's taxonomy is several hundred labels — AG LLC's is 372. Asking a
-- person to press Accept 372 times is not review; by the fiftieth row they are
-- not reading, and an unread confirmation is worse than no confirmation because
-- it looks like one. So the labels where the model was genuinely unsure are
-- separated from the ones where it plainly was not, and only the second kind may
-- be settled in a single action.
--
-- The test is the margin to the runner-up, not the top score. Measured against
-- this catalogue, every wrong call sat below 0.10 and every right one at or
-- above it, while the scores themselves overlapped and settled nothing — a wrong
-- "Mobile Cases -> smartphone" scored 0.583, a right "Copilot+ PC -> laptop"
-- scored 0.579. The threshold is passed in rather than hard-coded here so it
-- stays stated in one place in the application.
--
-- `security invoker`, deliberately: the update then has to satisfy
-- `category_mappings_update_admin` like any other write, so this cannot become a
-- way for a non-administrator to confirm several hundred mappings at once.

create or replace function public.confirm_clear_category_mappings(
  p_organization_id uuid,
  p_min_margin numeric,
  p_membership_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.category_mappings
  set status = 'confirmed',
      anuma_category_key = proposed_key,
      confirmed_by_membership_id = p_membership_id
  where organization_id = p_organization_id
    and status = 'proposed'
    and proposed_key is not null
    and proposed_margin is not null
    and proposed_margin >= p_min_margin;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.confirm_clear_spoken_mappings(
  p_organization_id uuid,
  p_min_margin numeric,
  p_membership_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.spoken_category_mappings
  set status = 'confirmed',
      anuma_category_key = proposed_key,
      confirmed_by_membership_id = p_membership_id
  where organization_id = p_organization_id
    and status = 'proposed'
    and proposed_key is not null
    and proposed_margin is not null
    and proposed_margin >= p_min_margin;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.confirm_clear_category_mappings(uuid, numeric, uuid) from public;
revoke all on function public.confirm_clear_spoken_mappings(uuid, numeric, uuid) from public;
grant execute on function public.confirm_clear_category_mappings(uuid, numeric, uuid)
  to authenticated, service_role;
grant execute on function public.confirm_clear_spoken_mappings(uuid, numeric, uuid)
  to authenticated, service_role;
