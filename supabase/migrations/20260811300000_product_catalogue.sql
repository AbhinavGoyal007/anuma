-- The retailer's product catalogue, versioned by import.
--
-- Two things make this shape necessary rather than a plain product table.
--
-- First, the catalogue is per-organization and changes daily: item text is
-- rewritten, items are re-classified between categories, and items are
-- delisted. Second, and more importantly, an assortment finding must be judged
-- against the catalogue *as it stood on the day of the conversation*. If a
-- customer wanted something the range did not carry on 11 August, adding it on
-- 20 August does not undo the gap. Overwriting rows would silently rewrite
-- history, so each row carries the window over which it was true and a query
-- asks "what was true on this date".
--
-- Rows that do not change between imports are left alone — only their
-- last_seen_import moves — so a daily 180,000-row file costs almost nothing.

create table public.catalogue_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  filename text,
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed')),
  -- What the file contained, and what it changed.
  row_count integer not null default 0,
  added_count integer not null default 0,
  changed_count integer not null default 0,
  delisted_count integer not null default 0,
  unchanged_count integer not null default 0,
  error_message text,
  imported_by_membership_id uuid references public.organization_memberships(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index catalogue_imports_org_idx
  on public.catalogue_imports (organization_id, created_at desc);

create table public.catalogue_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- The retailer's own stable key. Everything else about an item may change.
  item_id text not null,
  description text not null default '',
  brand_id text,
  brand_name text,
  dept_id text,
  dept_name text,
  group_id text,
  group_name text,
  subgroup_id text,
  subgroup_name text,
  -- Hash of every attribute above, so an unchanged row is detected in one
  -- comparison rather than ten.
  content_hash text not null,
  first_seen_import uuid references public.catalogue_imports(id),
  last_seen_import uuid references public.catalogue_imports(id),
  -- The window this version of the item was true for. valid_to null = current.
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  created_at timestamptz not null default now()
);

-- One current version per item, enforced rather than assumed.
create unique index catalogue_items_current_idx
  on public.catalogue_items (organization_id, item_id)
  where valid_to is null;
-- The as-of-date lookup, and the category rollups.
create index catalogue_items_asof_idx
  on public.catalogue_items (organization_id, item_id, valid_from desc);
create index catalogue_items_subgroup_idx
  on public.catalogue_items (organization_id, subgroup_id)
  where valid_to is null;
create index catalogue_items_brand_idx
  on public.catalogue_items (organization_id, brand_name)
  where valid_to is null;

-- Raw landing area for an import. Truncated per import; never read by the app.
create table public.catalogue_staging (
  organization_id uuid not null,
  import_id uuid not null,
  item_id text not null,
  description text not null default '',
  brand_id text,
  brand_name text,
  dept_id text,
  dept_name text,
  group_id text,
  group_name text,
  subgroup_id text,
  subgroup_name text,
  content_hash text not null
);

create index catalogue_staging_import_idx on public.catalogue_staging (import_id);

alter table public.catalogue_imports enable row level security;
alter table public.catalogue_items enable row level security;
alter table public.catalogue_staging enable row level security;

create policy catalogue_imports_select on public.catalogue_imports
  for select to authenticated using ((select private.is_org_member(organization_id)));
create policy catalogue_items_select on public.catalogue_items
  for select to authenticated using ((select private.is_org_member(organization_id)));
-- Staging is machinery, not data: no authenticated access at all.

grant select on public.catalogue_imports, public.catalogue_items to authenticated;
grant all on public.catalogue_imports, public.catalogue_items, public.catalogue_staging
  to service_role;
