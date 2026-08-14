-- Taking a retailer's file as it is, and holding what every retailer has.
--
-- Two files have now been loaded from two industries and neither fit. The
-- electronics export packs a product into one free-text description; the
-- Delaware dealer feed has no description at all and declares bodystyle,
-- fueltype, trim, price and mileage as columns. Both were made to fit by a
-- converter written by hand, which is the thing that cannot scale: a client with
-- three hundred products will not wait for an integrator, and neither will one
-- with a hundred and eighty thousand.
--
-- So the ten-column contract stops being the contract. A file arrives, its
-- columns are read once, and what each column means is recorded here.

-- What one column of one retailer's file turned out to mean.
--
-- Kept rather than applied and forgotten, because the mapping is the thing to
-- look at when a load produces something strange, and because a re-upload of the
-- same file should not re-derive it.
create table if not exists public.catalogue_source_columns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_column text not null,
  -- identifier, description, brand, category_1..3, price, msrp, currency,
  -- stock, location, as_of, attribute, ignore
  role text not null,
  -- For a column carrying an attribute: how its values behave.
  value_kind text check (value_kind in ('numeric', 'categorical', 'text')),
  unit text,
  -- Whether the deterministic checks agreed with the proposal, and what they
  -- found. A column proposed as the identifier whose values repeat is not an
  -- identifier, whatever it is named.
  accepted boolean not null default false,
  rejection_reason text,
  distinct_values integer,
  null_share numeric,
  sample_values text[],
  inferred_at timestamptz not null default now(),
  unique (organization_id, source_column)
);

-- Money, which every retailer has and this schema did not.
--
-- A budget is extracted from almost every conversation and there has been
-- nothing to compare it against — the electronics export carried no price and
-- the dealer feed's was dropped on the way in. For a car it is the dimension the
-- whole conversation turns on.
--
-- Minor units and integers, so no rounding ever enters a figure a manager reads.
alter table public.catalogue_items
  add column if not exists price_minor bigint,
  add column if not exists msrp_minor bigint,
  add column if not exists currency_code text;

alter table public.catalogue_staging
  add column if not exists price_minor bigint,
  add column if not exists msrp_minor bigint,
  add column if not exists currency_code text;

create index if not exists catalogue_items_price_idx
  on public.catalogue_items (organization_id, price_minor)
  where valid_to is null and price_minor is not null;

alter table public.catalogue_source_columns enable row level security;

create policy catalogue_source_columns_read on public.catalogue_source_columns
  for select using ((select private.is_org_member(organization_id)));
