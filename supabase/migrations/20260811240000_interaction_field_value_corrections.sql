-- Human corrections to extracted facts.
--
-- A correction is an override a person makes on a single extracted value — the
-- right budget, an objection that was not really raised — never a gate. The
-- pipeline stays fully automatic; corrections are optional and exception-based.
--
-- The original AI value is never touched: it stays in interaction_field_values,
-- and the correction lives here as a separate overlay. The table is append-only,
-- so it is a full history — the most recent correction for a value is the
-- current one, and "AI said X, a person corrected it to Y at time T" is always
-- reconstructable. That audit trail is the point, and the accumulating set of
-- corrections is the labelled dataset the accuracy harness will later use.
--
-- Only administrators and managers may correct, so a rep cannot quietly rewrite
-- the facts their own metrics are built from.

create table public.interaction_field_value_corrections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid not null,
  interaction_record_id uuid not null,
  -- The specific extracted value being corrected.
  field_value_id uuid not null references public.interaction_field_values(id) on delete cascade,
  -- Denormalised so "correction rate by field" — where the model fails — is a
  -- plain group-by rather than a join back to the value.
  field_key text not null check (field_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  -- The person's assertion: the right value as they entered it, or a rejection
  -- that the value should not exist at all.
  corrected_text text
    check (corrected_text is null or char_length(btrim(corrected_text)) between 1 and 400),
  is_rejected boolean not null default false,
  note text check (note is null or char_length(btrim(note)) between 1 and 500),
  created_by_membership_id uuid not null references public.organization_memberships(id),
  created_at timestamptz not null default now(),
  -- A correction either sets a value or rejects one; never neither.
  check (is_rejected or corrected_text is not null)
);

-- Overlay lookup for a record, latest-first per value; and the telemetry slice.
create index interaction_field_value_corrections_value_idx
  on public.interaction_field_value_corrections (field_value_id, created_at desc);
create index interaction_field_value_corrections_record_idx
  on public.interaction_field_value_corrections (interaction_record_id);
create index interaction_field_value_corrections_field_idx
  on public.interaction_field_value_corrections (organization_id, field_key);

alter table public.interaction_field_value_corrections enable row level security;

-- Anyone who can see the conversation sees its corrections.
create policy field_value_corrections_select on public.interaction_field_value_corrections
  for select to authenticated
  using ((select private.can_access_conversation(conversation_id)));

-- Only a manager or administrator with access to the conversation may correct.
create policy field_value_corrections_insert on public.interaction_field_value_corrections
  for insert to authenticated
  with check (
    (select private.can_access_conversation(conversation_id))
    and (
      (select private.is_org_admin(organization_id))
      or (select private.is_org_manager(organization_id))
    )
  );

grant select, insert on public.interaction_field_value_corrections to authenticated;
grant all on public.interaction_field_value_corrections to service_role;
