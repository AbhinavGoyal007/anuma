-- ANUMA's own category ontology, and the per-organization mapping into it.
--
-- A retailer's taxonomy is their data: it differs between businesses and it
-- changes daily. It therefore cannot be the spine any analytic stands on — a
-- trend line would break the day someone renames a subgroup, and no two
-- customers could ever be compared.
--
-- So ANUMA keeps a small, stable, versioned category set of its own, and each
-- organization's labels are mapped into it once. Every rollup groups by the
-- ANUMA category; the retailer's words are only ever an input.
--
-- Deliberately narrow, per the guide's warning against building a universal
-- retail ontology prematurely: electronics, with laptops the only category
-- taken to any depth.

create table public.anuma_categories (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,48}$'),
  label text not null,
  -- Written for a person, and also what the mapping proposal compares against,
  -- so it carries the synonyms a retailer might use.
  description text not null,
  vertical text not null default 'electronics',
  sort_order integer not null default 0,
  active boolean not null default true
);

-- The mapping is keyed on the label path a person actually confirms — "Notebooks
-- › Clamshell means laptop" — not on the retailer's internal ids, which can be
-- reassigned. A rename therefore re-queues the label for confirmation, which is
-- correct: a new name may well mean a new thing.
create table public.category_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  group_name text not null,
  subgroup_name text not null,
  -- Null with status 'not_relevant' means "this is not a category we cover".
  anuma_category_key text references public.anuma_categories(key),
  status text not null default 'proposed'
    check (status in ('proposed', 'confirmed', 'not_relevant')),
  -- What we suggested and how sure we were, kept after confirmation so the
  -- proposal quality can be measured against what people actually chose.
  proposed_key text references public.anuma_categories(key),
  proposed_score numeric(4, 3),
  item_count integer not null default 0,
  confirmed_by_membership_id uuid references public.organization_memberships(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, group_name, subgroup_name)
);

create index category_mappings_org_status_idx
  on public.category_mappings (organization_id, status);

create trigger category_mappings_set_updated_at
  before update on public.category_mappings
  for each row execute function private.set_updated_at();

alter table public.anuma_categories enable row level security;
alter table public.category_mappings enable row level security;

-- The ontology is reference data every member may read.
create policy anuma_categories_select on public.anuma_categories
  for select to authenticated using (true);

create policy category_mappings_select on public.category_mappings
  for select to authenticated using ((select private.is_org_member(organization_id)));
create policy category_mappings_update_admin on public.category_mappings
  for update to authenticated
  using ((select private.is_org_admin(organization_id)))
  with check ((select private.is_org_admin(organization_id)));

grant select on public.anuma_categories to authenticated;
grant select, update on public.category_mappings to authenticated;
grant all on public.anuma_categories, public.category_mappings to service_role;

insert into public.anuma_categories (key, label, description, sort_order) values
  ('laptop', 'Laptop', 'portable personal computer — notebook, ultrabook, clamshell, convertible or 2-in-1 laptop, MacBook', 10),
  ('gaming_laptop', 'Gaming laptop', 'portable computer built for gaming, with a discrete graphics card', 20),
  ('desktop', 'Desktop computer', 'desktop tower, all-in-one PC or workstation for a desk', 30),
  ('tablet', 'Tablet', 'tablet computer such as an iPad or Android tablet, with a touchscreen and no keyboard', 40),
  ('smartphone', 'Smartphone', 'mobile phone, cellphone, smartphone handset', 50),
  ('television', 'Television', 'television set, smart TV, LED or OLED TV for watching at home', 60),
  ('refrigerator', 'Refrigerator', 'fridge, freezer, refrigerator for keeping food cold', 70),
  ('washing_machine', 'Washing machine', 'clothes washer, washing machine, laundry dryer', 80),
  ('air_conditioner', 'Air conditioner', 'air conditioner, AC unit, cooling appliance', 90),
  ('kitchen_appliance', 'Kitchen appliance', 'small kitchen appliance — microwave, oven, mixer, blender, kettle, food preparation', 100),
  ('smartwatch', 'Smartwatch & wearable', 'smartwatch, fitness band, wearable smart device worn on the body', 110),
  ('audio', 'Audio', 'headphones, earphones, earbuds, speakers, soundbar, audio equipment', 120),
  ('camera', 'Camera', 'camera, DSLR, mirrorless camera, camcorder, lens', 130),
  ('gaming_console', 'Gaming console', 'games console such as PlayStation, Xbox or Nintendo, and console games', 140),
  ('printer', 'Printer', 'printer, scanner, all-in-one printing device', 150),
  ('networking', 'Networking', 'router, modem, wifi extender, network switch, networking equipment', 160),
  ('accessory', 'Accessory', 'accessory or add-on for another device — case, cable, charger, mouse, keyboard, stand, adapter', 170);
