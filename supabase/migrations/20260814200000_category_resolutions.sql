-- What a customer's word for a category means in this retailer's own terms.
--
-- Demand has been grouped by a fixed list of seventeen categories written for an
-- electronics shop. A car dealer's customer says "SUV", which is on nobody's
-- list but their own, so their dashboard is empty: the phrase arrives, matches
-- none of the seventeen, and is reported as unresolved. The same is true of a
-- mattress, a lens, a jacket.
--
-- The retailer's own vocabulary is the only vocabulary there is, so a spoken
-- phrase resolves to one of their category values instead. Resolved by measuring
-- rather than by asking anyone: the margin rule that settles category proposals
-- everywhere else in this system, with the score kept so a thin resolution can
-- be seen for what it is.
--
-- Nothing here is required. A phrase with no resolution still groups under
-- itself, in the customer's words, which is a worse label than the retailer's
-- and a far better one than none.

create table if not exists public.category_resolutions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- The customer's phrase, normalised the way the metrics normalise it.
  phrase text not null,
  -- The retailer's own label for it, taken from their catalogue.
  resolved_label text not null,
  score numeric not null,
  margin numeric not null,
  resolved_at timestamptz not null default now(),
  unique (organization_id, phrase)
);

create index if not exists category_resolutions_lookup_idx
  on public.category_resolutions (organization_id, phrase);

alter table public.category_resolutions enable row level security;

create policy category_resolutions_read on public.category_resolutions
  for select using ((select private.is_org_member(organization_id)));
