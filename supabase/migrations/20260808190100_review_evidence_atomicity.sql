-- Phase 5B correction: keep review-result evidence creation inside the same
-- transaction as immutable check and scorecard evaluation persistence.
create or replace function public.persist_interaction_review(
  p_review_run_id uuid, p_check_evaluations jsonb, p_scorecard_evaluations jsonb, p_semantic_request_count integer default 0
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_run public.review_runs%rowtype;
  v_analysis public.analysis_runs%rowtype;
  v_item jsonb;
  v_check_id uuid;
  v_scorecard_id uuid;
  v_group_id uuid;
  v_segment_id uuid;
  v_sequence integer;
begin
  select * into v_run from public.review_runs where id=p_review_run_id for update;
  if not found then raise exception 'Review run was not found.' using errcode='P0002'; end if;
  if v_run.status='completed' then return; end if;
  select * into v_analysis from public.analysis_runs where id=v_run.analysis_run_id;
  if not found then raise exception 'Review source analysis was not found.' using errcode='P0002'; end if;
  if jsonb_typeof(p_check_evaluations) <> 'array' or jsonb_typeof(p_scorecard_evaluations) <> 'array' then raise exception 'Review persistence payload must contain arrays.' using errcode='22023'; end if;
  for v_item in select value from jsonb_array_elements(p_check_evaluations) loop
    v_check_id := (v_item ->> 'checkDefinitionId')::uuid;
    if not exists (select 1 from jsonb_array_elements(v_run.configuration_snapshot -> 'checks') item where (item ->> 'id')::uuid=v_check_id) then raise exception 'Review check was not part of the configuration snapshot.' using errcode='22023'; end if;
    v_group_id := nullif(v_item ->> 'evidenceGroupId','')::uuid;
    if v_group_id is not null and not exists (select 1 from public.evidence_groups where id=v_group_id and organization_id=v_run.organization_id and conversation_id=v_run.conversation_id) then raise exception 'Review evidence does not belong to this interaction.' using errcode='22023'; end if;
    if v_group_id is null and coalesce(jsonb_array_length(v_item -> 'evidenceSegmentIds'), 0) > 0 then
      insert into public.evidence_groups(organization_id, conversation_id, purpose, source_analysis_run_id)
      values(v_run.organization_id, v_run.conversation_id, 'review:' || v_check_id::text, v_run.analysis_run_id)
      returning id into v_group_id;
      v_sequence := 0;
      for v_segment_id in select value::uuid from jsonb_array_elements_text(v_item -> 'evidenceSegmentIds') loop
        insert into public.evidence_references(organization_id, conversation_id, evidence_group_id, transcription_run_id, transcript_segment_id, sequence_number, start_milliseconds, end_milliseconds)
        select v_run.organization_id, v_run.conversation_id, v_group_id, v_analysis.source_transcription_run_id, segment.id, v_sequence, segment.start_milliseconds, segment.end_milliseconds
        from public.transcript_segments segment
        where segment.id=v_segment_id and segment.organization_id=v_run.organization_id and segment.conversation_id=v_run.conversation_id and segment.transcription_run_id=v_analysis.source_transcription_run_id;
        if not found then raise exception 'Review evidence segment is not part of this source transcript.' using errcode='22023'; end if;
        v_sequence := v_sequence + 1;
      end loop;
    end if;
    if (v_item ->> 'resultState') in ('met','partial') and v_group_id is null then raise exception 'Positive review results require evidence.' using errcode='22023'; end if;
    insert into public.check_evaluations(organization_id, conversation_id, analysis_run_id, check_definition_id, review_run_id, evaluation_version, result_state, applicability_reason, explanation, evidence_group_id)
    values(v_run.organization_id, v_run.conversation_id, v_run.analysis_run_id, v_check_id, v_run.id, v_run.evaluation_version, v_item ->> 'resultState', nullif(v_item ->> 'applicabilityReason',''), v_item ->> 'explanation', v_group_id);
  end loop;
  for v_item in select value from jsonb_array_elements(p_scorecard_evaluations) loop
    v_scorecard_id := (v_item ->> 'scorecardDefinitionId')::uuid;
    if not exists (select 1 from jsonb_array_elements(v_run.configuration_snapshot -> 'scorecards') item where (item ->> 'id')::uuid=v_scorecard_id) then raise exception 'Scorecard was not part of the configuration snapshot.' using errcode='22023'; end if;
    insert into public.scorecard_evaluations(organization_id, conversation_id, analysis_run_id, scorecard_definition_id, review_run_id, evaluation_version, score_percent, applicable_check_count, evaluated_check_count, insufficient_evidence_count)
    values(v_run.organization_id, v_run.conversation_id, v_run.analysis_run_id, v_scorecard_id, v_run.id, v_run.evaluation_version, nullif(v_item ->> 'scorePercent','')::numeric, (v_item ->> 'applicableCheckCount')::integer, (v_item ->> 'evaluatedCheckCount')::integer, (v_item ->> 'insufficientEvidenceCount')::integer);
  end loop;
  update public.review_runs set status='completed', semantic_request_count=greatest(0,p_semantic_request_count), started_at=coalesce(started_at,now()), completed_at=now() where id=p_review_run_id;
end; $$;
