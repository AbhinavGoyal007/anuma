-- What a customer's own words for a category actually mean.
--
-- The catalogue side of this problem is already solved: a retailer's labels
-- ("Notebooks › Clamshell") are mapped once into ANUMA's stable ontology, and
-- every catalogue rollup groups by that. The conversation side has the same
-- problem and had no answer.
--
-- `purchase_category` is extracted from what was said, so it arrives in the
-- customer's phrasing. Across fifteen real conversations it produced twelve
-- distinct values, of which six — "2 bhk flat", "2 bhk property", "3 bhk
-- property/flat", "property / 2 bhk flat", "residential property",
-- "residential property / apartment" — are one category described six ways.
-- Grouping by that text splits one line of demand into six rows of one, and a
-- category head reading the dashboard sees noise where there is a pattern.
--
-- So spoken phrases map into the same ontology, through the same mechanism:
-- similarity proposes, a person confirms, and every rollup groups by what the
-- person confirmed. A phrase outside the range ANUMA covers is marked
-- 'not_relevant' rather than forced into a category it does not belong to, and
-- the dashboard discloses how many interactions that excluded.

create table public.spoken_category_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- The extracted value, lowercased and trimmed — the same normalisation the
  -- aggregate already applies, so the two agree without a shared code path.
  phrase text not null check (char_length(btrim(phrase)) between 1 and 200),
  -- Null with status 'not_relevant' means "not a category ANUMA covers".
  anuma_category_key text references public.anuma_categories(key),
  status text not null default 'proposed'
    check (status in ('proposed', 'confirmed', 'not_relevant')),
  proposed_key text references public.anuma_categories(key),
  proposed_score numeric(4, 3),
  -- Interactions using this phrasing, so the queue leads with what matters.
  occurrence_count integer not null default 0,
  confirmed_by_membership_id uuid references public.organization_memberships(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, phrase)
);

create index spoken_category_mappings_org_status_idx
  on public.spoken_category_mappings (organization_id, status);

create trigger spoken_category_mappings_set_updated_at
  before update on public.spoken_category_mappings
  for each row execute function private.set_updated_at();

alter table public.spoken_category_mappings enable row level security;

create policy spoken_category_mappings_select on public.spoken_category_mappings
  for select to authenticated using ((select private.is_org_member(organization_id)));
create policy spoken_category_mappings_update_admin on public.spoken_category_mappings
  for update to authenticated
  using ((select private.is_org_admin(organization_id)))
  with check ((select private.is_org_admin(organization_id)));

grant select, update on public.spoken_category_mappings to authenticated;
grant all on public.spoken_category_mappings to service_role;

-- The distinct category phrasings currently in use, with how many interactions
-- used each.
--
-- Only the current record per conversation counts. A re-extracted conversation
-- leaves earlier records behind, and counting those would weight a conversation
-- by how many times it happened to be processed.
--
-- Like `catalogue_label_summary` this recognises the service role, which has no
-- `auth.uid()` and would otherwise see an empty organization and propose
-- nothing at all.
create or replace function public.spoken_category_summary(p_organization_id uuid)
returns table(phrase text, occurrence_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with current_record as (
    select distinct on (record.conversation_id) record.id
    from public.interaction_records as record
    where record.organization_id = p_organization_id
      and record.status = 'completed'
    order by record.conversation_id, record.created_at desc
  )
  select lower(btrim(value.value_text)) as phrase, count(*) as occurrence_count
  from public.interaction_field_values as value
  join current_record on current_record.id = value.interaction_record_id
  where value.organization_id = p_organization_id
    and value.field_key = 'purchase_category'
    and value.abstention is null
    and value.value_text is not null
    and btrim(value.value_text) <> ''
    and (
      (select auth.role()) = 'service_role'
      or (select private.is_org_member(p_organization_id))
    )
  group by 1
  order by count(*) desc
$$;

revoke all on function public.spoken_category_summary(uuid) from public;
grant execute on function public.spoken_category_summary(uuid) to authenticated, service_role;

-- Category roles are stated against ANUMA categories, not against whatever the
-- customer happened to say. The column stays text so nothing has to move, but
-- it now holds an `anuma_categories.key` and the administration form offers the
-- ontology rather than a free-text box.
comment on column public.category_roles.category is
  'An anuma_categories.key. Free text was accepted before the ontology existed.';
