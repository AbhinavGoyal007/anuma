-- Phase 5.1 changes deterministic metric semantics. Historical metric runs
-- remain untouched; new analysis persistence records the new algorithm.
create or replace function public.persist_analysis_result(
  p_analysis_run_id uuid,
  p_metric_values jsonb,
  p_observations jsonb
)
returns table(metric_run_id uuid, already_persisted boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_run public.analysis_runs%rowtype;
  v_metric_run_id uuid;
  v_observation jsonb;
  v_group_id uuid;
  v_segment_id uuid;
  v_sequence integer;
  v_metric jsonb;
begin
  select * into v_run from public.analysis_runs where id = p_analysis_run_id for update;
  if not found then raise exception 'Analysis run was not found.' using errcode = 'P0002'; end if;
  if jsonb_typeof(p_metric_values) <> 'array' or jsonb_typeof(p_observations) <> 'array' then
    raise exception 'Analysis persistence payload must contain arrays.' using errcode = '22023';
  end if;

  -- Metric lineage is the durable persisted-state marker, including valid
  -- zero-observation analyses. Never create a second immutable metric run.
  if v_run.metric_run_id is not null then
    return query select v_run.metric_run_id, true;
    return;
  end if;
  if exists (select 1 from public.structured_observations where analysis_run_id = p_analysis_run_id) then
    raise exception 'Persisted observations have no metric lineage.' using errcode = '23514';
  end if;

  insert into public.metric_runs(
    organization_id, conversation_id, source_transcription_run_id, speaker_mapping_version_id, algorithm_version
  ) values (
    v_run.organization_id, v_run.conversation_id, v_run.source_transcription_run_id,
    v_run.speaker_mapping_version_id, 'phase5.1.v1'
  ) returning id into v_metric_run_id;

  for v_metric in select value from jsonb_array_elements(p_metric_values) loop
    insert into public.metric_values(
      organization_id, conversation_id, metric_run_id, metric_key, numeric_value, unit
    ) values (
      v_run.organization_id, v_run.conversation_id, v_metric_run_id,
      v_metric ->> 'metric_key', (v_metric ->> 'numeric_value')::numeric, v_metric ->> 'unit'
    );
  end loop;

  for v_observation in select value from jsonb_array_elements(p_observations) loop
    if not exists (
      select 1 from jsonb_array_elements_text(v_observation -> 'evidenceSegmentIds') as evidence_id
      join public.transcript_segments as segment on segment.id = evidence_id::uuid
      where segment.organization_id = v_run.organization_id
        and segment.conversation_id = v_run.conversation_id
        and segment.transcription_run_id = v_run.source_transcription_run_id
    ) or coalesce(jsonb_array_length(v_observation -> 'evidenceSegmentIds'), 0) = 0 then
      raise exception 'Observation evidence must reference source transcript segments.' using errcode = '22023';
    end if;

    insert into public.evidence_groups(organization_id, conversation_id, purpose, source_analysis_run_id)
    values (v_run.organization_id, v_run.conversation_id, 'observation:' || (v_observation ->> 'type'), p_analysis_run_id)
    returning id into v_group_id;

    v_sequence := 0;
    for v_segment_id in select value::uuid from jsonb_array_elements_text(v_observation -> 'evidenceSegmentIds') loop
      insert into public.evidence_references(
        organization_id, conversation_id, evidence_group_id, transcription_run_id, transcript_segment_id,
        sequence_number, start_milliseconds, end_milliseconds
      )
      select v_run.organization_id, v_run.conversation_id, v_group_id, v_run.source_transcription_run_id,
        segment.id, v_sequence, segment.start_milliseconds, segment.end_milliseconds
      from public.transcript_segments as segment
      where segment.id = v_segment_id and segment.organization_id = v_run.organization_id
        and segment.conversation_id = v_run.conversation_id
        and segment.transcription_run_id = v_run.source_transcription_run_id;
      if not found then raise exception 'Observation evidence segment is not part of this source transcript.' using errcode = '22023'; end if;
      v_sequence := v_sequence + 1;
    end loop;

    insert into public.structured_observations(
      organization_id, conversation_id, analysis_run_id, observation_type, normalized_key, value_text,
      value_amount_minor, currency_code, attributes, original_model_value, evidence_group_id
    ) values (
      v_run.organization_id, v_run.conversation_id, p_analysis_run_id,
      v_observation ->> 'type', v_observation ->> 'key', nullif(v_observation ->> 'text', ''),
      nullif(v_observation ->> 'amountMinor', '')::bigint,
      case when nullif(v_observation ->> 'amountMinor', '') is null then null else nullif(v_observation ->> 'currency', '') end,
      coalesce(v_observation -> 'attributes', '{}'::jsonb), v_observation, v_group_id
    );
  end loop;

  update public.analysis_runs set metric_run_id = v_metric_run_id where id = p_analysis_run_id;
  return query select v_metric_run_id, false;
end;
$$;
