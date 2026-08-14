-- What is true about a product that no retailer writes down.
--
-- A dealer's file says a Super Meteor 650 exists in Astral Black. It does not
-- say it is the touring bike in the range, and a customer who wants to ride to
-- Coorg with his wife has asked exactly that. A Delaware feed says Escape PHEV;
-- it does not say a plug-in hybrid is a hybrid. Every retailer assumes we know,
-- because everyone who works on their floor does.
--
-- This is knowledge about products, not about anybody's stock, so it is held
-- once and shared: a Super Meteor is a Super Meteor at every dealer in the
-- world, and the second retailer to carry one costs nothing to onboard. Keyed on
-- brand and model rather than on a retailer's item id for that reason.
--
-- Cost is bounded by how many distinct products exist, not how many rows any
-- catalogue has — fifty-five models across 726 vehicles, and they are asked
-- about once, ever.

create table if not exists public.product_knowledge (
  id uuid primary key default gen_random_uuid(),
  -- Normalised: lower case, collapsed whitespace, so "Super Meteor 650" and
  -- "SUPER METEOR  650" are one product rather than two.
  brand_key text not null,
  model_key text not null,
  brand text not null,
  model text not null,
  -- What kind of thing it is, in ordinary words a shopper would use: cruiser,
  -- touring motorcycle, compact SUV, plug-in hybrid.
  descriptors text[] not null default '{}',
  -- What it is good for, as a shopper would say it: long highway rides, city
  -- commuting, carrying a family of five.
  suited_to text[] not null default '{}',
  -- Left null when the model is not recognised. An unbranded no-name product
  -- has no world knowledge, and inventing some is the failure this whole system
  -- is built to avoid.
  recognised boolean not null default false,
  source_model text not null,
  created_at timestamptz not null default now(),
  unique (brand_key, model_key)
);

create index if not exists product_knowledge_lookup_idx
  on public.product_knowledge (brand_key, model_key)
  where recognised;

-- Readable by any authenticated member of any organization: it is a fact about
-- the world, not about a tenant. Written only by the discovery job, which runs
-- as the service role.
alter table public.product_knowledge enable row level security;

create policy product_knowledge_read on public.product_knowledge
  for select to authenticated using (true);
