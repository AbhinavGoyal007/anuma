-- A SELECT INTO assigns NULL when no pending row exists. Keep the generated
-- immutable review-run ID separate from the optional existing pending run.
create or replace function public.request_interaction_review(
  p_conversation_id uuid,
  p_trigger_reason text default 'initial'
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_conversation public.conversations%rowtype;
  v_member_id uuid;
  v_existing_run_id uuid;
  v_run_id uuid := gen_random_uuid();
  v_version text;
  v_snapshot jsonb;
begin
  select * into v_conversation from public.conversations where id = p_conversation_id;
  if not found or not private.can_access_conversation(p_conversation_id) then
    raise exception 'You are not allowed to review this interaction.' using errcode = '42501';
  end if;
  if v_conversation.active_analysis_run_id is null then
    raise exception 'Interaction understanding is required before review.' using errcode = '23514';
  end if;
  if p_trigger_reason not in ('initial', 'correction', 'configuration_change', 'manual') then
    raise exception 'Invalid review trigger.' using errcode = '22023';
  end if;

  select id into v_existing_run_id from public.review_runs
  where conversation_id = p_conversation_id and status in ('pending', 'running')
  order by created_at desc limit 1;
  if v_existing_run_id is not null then return v_existing_run_id; end if;

  v_member_id := private.current_membership_id(v_conversation.organization_id);
  select jsonb_build_object(
    'checks', coalesce(jsonb_agg(jsonb_build_object(
      'id', definition.id, 'name', definition.name, 'description', definition.description,
      'purpose', definition.purpose, 'applicability', definition.applicability,
      'evaluationStrategy', definition.evaluation_strategy, 'observationTypes', definition.observation_types,
      'phrase', definition.phrase, 'weight', definition.weight
    ) order by definition.created_at), '[]'::jsonb),
    'scorecards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', scorecard.id, 'name', scorecard.name,
        'checkIds', (select coalesce(jsonb_agg(association.check_definition_id), '[]'::jsonb)
                     from public.scorecard_definition_checks association
                     where association.scorecard_definition_id = scorecard.id)
      )) from public.scorecard_definitions scorecard
      where scorecard.organization_id = v_conversation.organization_id and scorecard.active
    ), '[]'::jsonb)
  ) into v_snapshot
  from public.check_definitions definition
  where definition.organization_id = v_conversation.organization_id and definition.active;

  v_version := 'phase5.v1.' || replace(v_run_id::text, '-', '');
  insert into public.review_runs(
    id, organization_id, conversation_id, analysis_run_id, evaluation_version,
    trigger_reason, configuration_snapshot, created_by_membership_id
  ) values (
    v_run_id, v_conversation.organization_id, p_conversation_id, v_conversation.active_analysis_run_id,
    v_version, p_trigger_reason, v_snapshot, v_member_id
  );
  return v_run_id;
end;
$$;

revoke all on function public.request_interaction_review(uuid, text) from public;
grant execute on function public.request_interaction_review(uuid, text) to authenticated;
