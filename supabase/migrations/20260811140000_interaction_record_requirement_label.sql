-- Category-adaptive requirements need a dimension label to stay queryable.
--
-- `additional_requirements` replaced the laptop-only portability and battery
-- fields. Its entries only mean something with the aspect they describe: "high
-- floor" is free text, but floor_preference=high is a fact you can count across
-- thousands of property conversations. The label is that aspect.

alter table public.interaction_field_values
  add column if not exists label text
    check (label is null or label ~ '^[a-z][a-z0-9_]{0,39}$');

comment on column public.interaction_field_values.label is
  'Requirement dimension for labelled fields (e.g. additional_requirements): floor_preference, fuel_type, battery_life. Null for every other field.';

-- The persist function learns one new slot. Everything else is unchanged: the
-- label rides alongside the value and its evidence in the same atomic write.
create or replace function public.persist_interaction_record(
  p_record_id uuid,
  p_values jsonb
)
returns table(persisted_values integer, already_persisted boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record public.interaction_records%rowtype;
  v_value jsonb;
  v_group_id uuid;
  v_segment_id uuid;
  v_sequence integer;
  v_count integer := 0;
  v_evidence_count integer;
begin
  select * into v_record from public.interaction_records where id = p_record_id for update;
  if not found then
    raise exception 'Interaction record was not found.' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_values) <> 'array' then
    raise exception 'Interaction record payload must be an array.' using errcode = '22023';
  end if;

  if exists (select 1 from public.interaction_field_values where interaction_record_id = p_record_id) then
    return query select 0, true;
    return;
  end if;

  for v_value in select value from jsonb_array_elements(p_values) loop
    v_group_id := null;
    v_evidence_count := coalesce(jsonb_array_length(v_value -> 'evidenceSegmentIds'), 0);

    if v_evidence_count > 0 then
      insert into public.evidence_groups(organization_id, conversation_id, purpose)
      values (
        v_record.organization_id,
        v_record.conversation_id,
        'interaction_field:' || (v_value ->> 'field')
      )
      returning id into v_group_id;

      v_sequence := 0;
      for v_segment_id in select value::uuid from jsonb_array_elements_text(v_value -> 'evidenceSegmentIds') loop
        insert into public.evidence_references(
          organization_id, conversation_id, evidence_group_id, transcription_run_id,
          transcript_segment_id, sequence_number, start_milliseconds, end_milliseconds
        )
        select v_record.organization_id, v_record.conversation_id, v_group_id,
          v_record.source_transcription_run_id, segment.id, v_sequence,
          segment.start_milliseconds, segment.end_milliseconds
        from public.transcript_segments as segment
        where segment.id = v_segment_id
          and segment.organization_id = v_record.organization_id
          and segment.conversation_id = v_record.conversation_id
          and segment.transcription_run_id = v_record.source_transcription_run_id;
        if not found then
          raise exception 'Field evidence is not part of this source transcript.' using errcode = '22023';
        end if;
        v_sequence := v_sequence + 1;
      end loop;
    end if;

    insert into public.interaction_field_values(
      organization_id, conversation_id, interaction_record_id, field_key, source_class,
      abstention, value_text, value_number, spoken_amount, spoken_scale,
      value_amount_minor, currency_code, attributed_to, label, evidence_group_id, original_model_value
    ) values (
      v_record.organization_id, v_record.conversation_id, p_record_id,
      v_value ->> 'field',
      (v_value ->> 'sourceClass')::public.fact_source_class,
      nullif(v_value ->> 'abstention', '')::public.fact_abstention,
      nullif(v_value ->> 'valueText', ''),
      nullif(v_value ->> 'valueNumber', '')::numeric,
      nullif(v_value ->> 'spokenAmount', '')::numeric,
      nullif(v_value ->> 'spokenScale', ''),
      nullif(v_value ->> 'amountMinor', '')::bigint,
      case when nullif(v_value ->> 'amountMinor', '') is null then null
           else nullif(v_value ->> 'currency', '') end,
      nullif(v_value ->> 'attributedTo', '')::public.fact_claimant,
      nullif(v_value ->> 'label', ''),
      v_group_id,
      v_value
    );
    v_count := v_count + 1;
  end loop;

  return query select v_count, false;
end;
$$;

revoke all on function public.persist_interaction_record(uuid, jsonb) from public;
