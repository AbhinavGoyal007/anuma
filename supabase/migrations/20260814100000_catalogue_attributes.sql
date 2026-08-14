-- What a retailer's products vary by, discovered rather than declared.
--
-- The columns this replaces — spec_ram_gb, spec_storage_gb, spec_gpu_gb,
-- spec_screen_in — encode one industry in DDL. They are already failing on the
-- catalogue that motivated them: of 39,651 domestic appliances loaded, 148 carry
-- any parsed dimension, because a washing machine's capacity is kilograms, a
-- refrigerator's is litres and an air conditioner's is tons, and none of those
-- is a column. A mattress retailer or a jeweller cannot be described at all.
--
-- Adding columns per industry is a migration per customer and still cannot
-- describe the next one. What generalises is not the list of dimensions but the
-- shape of a requirement, of which there are two: a value from a fixed
-- vocabulary — cotton, king, front-load, 22-carat — or a number with a
-- direction. Every retail conversation asks for one of those.
--
-- So attributes are rows, defined per retailer against the retailer's *own*
-- taxonomy node. Nothing here is mapped onto a vocabulary of ours, because we
-- do not have one and should not: each customer's terminology is theirs, and
-- a mattress retailer is onboarded by uploading mattresses.

-- What the products under one node of the retailer's taxonomy vary by.
create table if not exists public.category_attributes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- The retailer's own path, "MDA > Laundry > Washing Machines". Their words.
  node_key text not null,
  attribute_key text not null,
  kind text not null check (kind in ('numeric', 'categorical')),
  comparison text not null check (comparison in ('at_least', 'at_most', 'equals')),
  -- Unit *words*, never a pattern. A model proposing vocabulary is proposing
  -- what words mean; a model proposing a regex is writing code that then runs
  -- against a hundred and eighty thousand rows.
  unit_tokens text[] not null default '{}',
  unit text,
  range_min numeric,
  range_max numeric,
  -- {"front_load": ["front load", "FL"], "top_load": ["top load", "TL"]}
  vocabulary jsonb not null default '{}'::jsonb,
  -- Whether the extraction, once run, described the products. Attributes that
  -- failed are kept rather than deleted: the reason is what makes a bad
  -- discovery debuggable, and re-proposing one already rejected wastes a call.
  status text not null default 'proposed'
    check (status in ('proposed', 'active', 'rejected')),
  rejection_reason text,
  coverage numeric,
  spread numeric,
  distinct_values integer,
  extractor_version text not null,
  discovered_at timestamptz not null default now(),
  judged_at timestamptz,
  unique (organization_id, node_key, attribute_key)
);

create index if not exists category_attributes_node_idx
  on public.category_attributes (organization_id, node_key)
  where status = 'active';

-- One reading of one attribute from one product's description.
--
-- A side table rather than a JSON column on the item, because the question asked
-- of it is "satisfy these N constraints of mixed type", and that indexes and
-- explains far better as rows — including which constraint failed, which is the
-- part a person actually needs to see.
create table if not exists public.catalogue_item_attributes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  item_id text not null,
  attribute_key text not null,
  value_text text,
  value_numeric numeric,
  unit text,
  extractor_version text not null,
  extracted_at timestamptz not null default now(),
  unique (organization_id, item_id, attribute_key),
  -- Exactly one of the two shapes, so a reading can never be half a value.
  check ((value_text is null) <> (value_numeric is null))
);

create index if not exists catalogue_item_attributes_lookup_idx
  on public.catalogue_item_attributes (organization_id, attribute_key, value_numeric);
create index if not exists catalogue_item_attributes_text_idx
  on public.catalogue_item_attributes (organization_id, attribute_key, value_text);
create index if not exists catalogue_item_attributes_item_idx
  on public.catalogue_item_attributes (organization_id, item_id);

-- What is actually on the shelf.
--
-- Separate from the catalogue on purpose: the catalogue says what a retailer
-- *ranges*, and answering "did we have it" from the range is the one mistake
-- that cannot be walked back. A manager who is told they held stock they never
-- held stops believing every other number on the page.
--
-- `as_of` carries a date rather than being a bare snapshot so a conversation
-- from three weeks ago is judged against the shelf as it was, matching how
-- catalogue_items already works. A retailer who can only send a current snapshot
-- still works — every row simply shares one date, and the claim is labelled as
-- the weaker one it is rather than overstated.
create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  item_id text not null,
  location_id uuid references public.locations(id) on delete set null,
  stock integer not null,
  as_of timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, item_id, location_id, as_of)
);

create index if not exists inventory_lookup_idx
  on public.inventory (organization_id, item_id, as_of desc);

alter table public.category_attributes enable row level security;
alter table public.catalogue_item_attributes enable row level security;
alter table public.inventory enable row level security;

-- Readable by the organization; written only by the import and discovery jobs,
-- which run as the service role and bypass these policies.
create policy category_attributes_read on public.category_attributes
  for select using ((select private.is_org_member(organization_id)));

create policy catalogue_item_attributes_read on public.catalogue_item_attributes
  for select using ((select private.is_org_member(organization_id)));

create policy inventory_read on public.inventory
  for select using ((select private.is_org_member(organization_id)));
