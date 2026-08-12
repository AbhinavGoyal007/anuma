-- Per-organization field library.
--
-- The Commercial Interaction Record's fields began as a compile-time registry
-- (fields.ts). This table lifts that registry into per-organization, editable
-- configuration: the tags a business wants extracted from every customer
-- conversation, each with the definition the model is given for it.
--
-- The canonical fields ship as seeded rows (is_system = true): their display
-- name and definition are freely editable and they can be switched off, but
-- their key — the identity the deterministic metrics and dashboards join on —
-- is fixed, and they cannot be deleted, only disabled. Custom fields a business
-- adds (is_system = false) are theirs to rename, redefine and delete outright.
--
-- The rows here are configuration, not derived data, so edits are made in place
-- (the versioned-never-overwritten rule governs transcripts, analyses and
-- scores — the extraction outputs — not the definitions that shape them).

create table public.interaction_field_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- The machine identity the record, metrics and dashboards join on. Fixed once
  -- created; the same slug shape the value table enforces on field_key.
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  -- The editable display name shown to people.
  label text not null check (char_length(trim(label)) between 1 and 80),
  -- The extraction definition handed to the model, verbatim: the text a reviewer
  -- reads and the text the model is given are one and the same.
  definition text not null check (char_length(trim(definition)) between 2 and 1200),
  source_class public.fact_source_class not null default 'evidence_extracted',
  alternate_source_class public.fact_source_class,
  value_kind text not null default 'text'
    check (value_kind in ('text', 'number', 'money', 'enum', 'entity', 'timestamp', 'identifier')),
  cardinality text not null default 'multiple' check (cardinality in ('single', 'multiple')),
  enum_values text[] not null default '{}'::text[],
  labelled boolean not null default false,
  requires_evidence boolean not null default true,
  -- A canonical field: identity protected, disable-not-delete.
  is_system boolean not null default false,
  -- Whether the model is asked to extract it. Disabling a system field is how a
  -- business turns a metric off without losing the ability to turn it back on.
  is_enabled boolean not null default true,
  sort_order integer not null default 0,
  created_by_membership_id uuid references public.organization_memberships(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key),
  -- An enum field is meaningless without its permitted values.
  check (value_kind <> 'enum' or coalesce(array_length(enum_values, 1), 0) >= 1)
);

create index interaction_field_definitions_org_idx
  on public.interaction_field_definitions (organization_id, sort_order);

create trigger interaction_field_definitions_set_updated_at
  before update on public.interaction_field_definitions
  for each row execute function private.set_updated_at();

alter table public.interaction_field_definitions enable row level security;

-- Any member of the organization may read its field library; the definitions
-- are context every reviewer needs to read a record.
create policy interaction_field_definitions_select_member
  on public.interaction_field_definitions for select to authenticated
  using ((select private.is_org_member(organization_id)));

-- Only administrators shape the library.
create policy interaction_field_definitions_insert_admin
  on public.interaction_field_definitions for insert to authenticated
  with check ((select private.is_org_admin(organization_id)));

create policy interaction_field_definitions_update_admin
  on public.interaction_field_definitions for update to authenticated
  using ((select private.is_org_admin(organization_id)))
  with check ((select private.is_org_admin(organization_id)));

-- Custom fields may be deleted; the canonical ones are disabled, never removed,
-- so that historical records still resolve the field they were extracted under.
create policy interaction_field_definitions_delete_admin
  on public.interaction_field_definitions for delete to authenticated
  using ((select private.is_org_admin(organization_id)) and is_system = false);

grant select, insert, update, delete on public.interaction_field_definitions to authenticated;
grant all on public.interaction_field_definitions to service_role;
