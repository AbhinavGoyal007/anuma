-- Commercial Interaction Record: the forty atomic facts of one conversation.
--
-- The transcript says what was spoken. This says what it meant commercially:
-- what the customer wanted, what the store offered, where friction appeared and
-- how it ended. It is the object the demand-intelligence product is built on.
--
-- Two properties are load-bearing. Every value carries a source_class, so a
-- figure read off an invoice is never displayed as though it were a model's
-- reading of a noisy shop floor. And every extracted value carries an evidence
-- group, so any number on a dashboard drills back to the words behind it.

create type public.fact_source_class as enum (
  'verified',           -- business system or deterministic fact
  'evidence_extracted', -- read from what was actually said
  'evaluated',          -- judgement against an explicit rubric
  'inferred'            -- statistical conclusion across facts
);

-- Why a field has no value. A blank is indistinguishable from a failure;
-- "the customer never mentioned a budget" is itself a commercial finding.
create type public.fact_abstention as enum (
  'not_stated',
  'insufficient_evidence',
  'ambiguous',
  'unknown'
);

-- Whose assertion a value is, where authorship changes its meaning. A price a
-- customer reports seeing elsewhere is that customer's claim, not a market fact.
create type public.fact_claimant as enum ('representative', 'customer', 'other');

create table public.interaction_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid not null,
  source_transcription_run_id uuid not null,
  speaker_mapping_version_id uuid not null,
  model text not null check (char_length(btrim(model)) between 1 and 120),
  -- The extraction contract is generated from a versioned field registry;
  -- recording the version is what makes two records comparable later.
  schema_version text not null check (char_length(btrim(schema_version)) between 1 and 40),
  status public.run_status not null default 'pending',
  input_tokens bigint check (input_tokens is null or input_tokens >= 0),
  output_tokens bigint check (output_tokens is null or output_tokens >= 0),
  -- Values the model produced that the transcript did not support. A quality
  -- signal worth keeping: a rising rejection rate is a regression.
  rejected_value_count integer not null default 0 check (rejected_value_count >= 0),
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint interaction_records_conversation_fk foreign key (organization_id, conversation_id)
    references public.conversations(organization_id, id) on delete cascade,
  constraint interaction_records_transcription_fk
    foreign key (organization_id, conversation_id, source_transcription_run_id)
    references public.transcription_runs(organization_id, conversation_id, id),
  unique (organization_id, conversation_id, id)
);

create index interaction_records_conversation_idx
  on public.interaction_records (organization_id, conversation_id, created_at desc);

create table public.interaction_field_values (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid not null,
  interaction_record_id uuid not null,
  -- Checked as text rather than an enum: the registry is versioned in code and
  -- a new field must not require a database migration to start being recorded.
  field_key text not null check (field_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  source_class public.fact_source_class not null,
  -- Exactly one of a value or an abstention. Both, or neither, is a bug.
  abstention public.fact_abstention,
  value_text text check (value_text is null or char_length(value_text) between 1 and 400),
  value_number numeric,
  -- Money is stored twice on purpose: as spoken, and as resolved. The spoken
  -- form is the evidence; the resolved form is what aggregates sum.
  spoken_amount numeric check (spoken_amount is null or spoken_amount >= 0),
  spoken_scale text check (spoken_scale is null or spoken_scale ~ '^[a-z]{3,10}$'),
  value_amount_minor bigint check (value_amount_minor is null or value_amount_minor >= 0),
  currency_code text check (currency_code is null or currency_code ~ '^[A-Z]{3}$'),
  attributed_to public.fact_claimant,
  evidence_group_id uuid,
  -- The model's untouched reply for this value, so a correction can always be
  -- compared against what was originally produced.
  original_model_value jsonb not null check (jsonb_typeof(original_model_value) = 'object'),
  created_at timestamptz not null default now(),
  constraint field_values_record_fk foreign key (organization_id, conversation_id, interaction_record_id)
    references public.interaction_records(organization_id, conversation_id, id) on delete cascade,
  constraint field_values_evidence_fk foreign key (organization_id, conversation_id, evidence_group_id)
    references public.evidence_groups(organization_id, conversation_id, id),
  constraint field_values_value_or_abstention check (
    (abstention is not null and value_text is null and value_number is null and value_amount_minor is null)
    or (abstention is null and (value_text is not null or value_number is not null or value_amount_minor is not null))
  ),
  constraint field_values_money_needs_currency check (
    value_amount_minor is null or currency_code is not null
  ),
  -- An abstention has nothing to cite. Anything else must be traceable.
  constraint field_values_evidence_required check (
    abstention is not null or evidence_group_id is not null or source_class = 'verified'
  )
);

create index field_values_record_idx
  on public.interaction_field_values (organization_id, conversation_id, interaction_record_id);
create index field_values_field_idx
  on public.interaction_field_values (organization_id, field_key);

alter table public.interaction_records enable row level security;
alter table public.interaction_field_values enable row level security;

create policy interaction_records_select_parent on public.interaction_records
  for select to authenticated using ((select private.can_access_conversation(conversation_id)));
create policy field_values_select_parent on public.interaction_field_values
  for select to authenticated using ((select private.can_access_conversation(conversation_id)));

grant select on public.interaction_records, public.interaction_field_values to authenticated;

-- Writes go through this function only, so a record can never be half-written:
-- either every value and its evidence lands, or none of it does.
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

  -- Replaying a completed extraction must not double-write its facts.
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
        -- A citation naming a segment outside this transcript is fabricated
        -- provenance, which is worse than no value at all.
        if not found then
          raise exception 'Field evidence is not part of this source transcript.' using errcode = '22023';
        end if;
        v_sequence := v_sequence + 1;
      end loop;
    end if;

    insert into public.interaction_field_values(
      organization_id, conversation_id, interaction_record_id, field_key, source_class,
      abstention, value_text, value_number, spoken_amount, spoken_scale,
      value_amount_minor, currency_code, attributed_to, evidence_group_id, original_model_value
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
      v_group_id,
      v_value
    );
    v_count := v_count + 1;
  end loop;

  return query select v_count, false;
end;
$$;

revoke all on function public.persist_interaction_record(uuid, jsonb) from public;
