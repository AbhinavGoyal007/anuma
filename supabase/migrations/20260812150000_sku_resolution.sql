-- Finding the products a conversation was about, and the ones it could have
-- been about.
--
-- Both questions are asked against the catalogue *as it stood on the day*, which
-- is the entire reason `catalogue_items` carries a validity window. If a
-- customer wanted something on 11 August and the range did not hold it, adding
-- it on 20 August does not undo the gap — and an assortment report that quietly
-- judged August against today's range would be flattering and wrong.
--
-- Both are functions rather than application queries for the same two reasons:
-- PostgREST caps every request at a thousand rows and this searches a hundred
-- and eighty thousand, and the filtering is far cheaper next to the data than
-- across a network to Mumbai and back.
--
-- Neither ranks anything. They narrow the catalogue to candidates; which
-- candidate is *the* product, and whether it satisfies what the customer asked
-- for, is decided in tested code where a wrong variant can be caught.

-- The rows whose description contains every model word, on a given date.
create or replace function public.catalogue_candidates(
  p_organization_id uuid,
  p_as_of timestamptz,
  -- Both default to "no constraint": a mention that named no brand has not ruled
  -- any brand out, and the generated client omits an argument rather than
  -- sending null.
  p_brand text default null,
  p_tokens text[] default null,
  p_limit integer default 40
)
returns table(
  id uuid,
  item_id text,
  description text,
  brand_name text,
  group_name text,
  subgroup_name text,
  spec_cpu_family text,
  spec_ram_gb integer,
  spec_storage_gb integer,
  spec_gpu_gb integer,
  spec_screen_in numeric,
  spec_issues text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select item.id, item.item_id, item.description, item.brand_name,
         item.group_name, item.subgroup_name, item.spec_cpu_family,
         item.spec_ram_gb, item.spec_storage_gb, item.spec_gpu_gb,
         item.spec_screen_in, item.spec_issues
  from public.catalogue_items as item
  where item.organization_id = p_organization_id
    -- As it stood on the day, not as it stands now.
    and item.valid_from <= p_as_of
    and (item.valid_to is null or item.valid_to > p_as_of)
    and (p_brand is null or item.brand_name ilike p_brand)
    and (
      p_tokens is null
      or cardinality(p_tokens) = 0
      or (
        -- The first token is written as a plain ILIKE so the trigram index can
        -- answer it: `ILIKE ALL (subquery)` is opaque to the planner and turns
        -- every lookup into a full scan of the range — measured at 2.4s against
        -- 529ms for the same search expressed this way.
        item.description ilike ('%' || p_tokens[1] || '%')
        -- Every remaining model word must also appear. A row matching "Swift"
        -- but not "Go" is a different machine, and offering it as the same one
        -- is the whole error this exists to avoid. Cheap: it only ever runs on
        -- the handful of rows the index already narrowed to.
        and item.description ilike all (
          select '%' || token || '%' from unnest(p_tokens) as token
        )
      )
    )
    and (
      (select auth.role()) = 'service_role'
      or (select private.is_org_member(p_organization_id))
    )
  order by item.description
  limit least(p_limit, 200)
$$;

-- The rows that satisfy a stated requirement, within one ANUMA category, on a
-- given date.
--
-- A null requirement is not a filter: a customer who never mentioned storage has
-- not ruled anything out. A row whose description was cut off before it said is
-- excluded from the *satisfying* set but counted separately, because "we could
-- not tell" and "we did not have it" are different answers to a buyer.
create or replace function public.catalogue_requirement_matches(
  p_organization_id uuid,
  p_as_of timestamptz,
  p_category_key text,
  p_min_ram_gb integer default null,
  p_min_storage_gb integer default null,
  p_min_gpu_gb integer default null,
  p_limit integer default 40
)
returns table(
  id uuid,
  item_id text,
  description text,
  brand_name text,
  group_name text,
  subgroup_name text,
  spec_cpu_family text,
  spec_ram_gb integer,
  spec_storage_gb integer,
  spec_gpu_gb integer,
  spec_screen_in numeric,
  spec_issues text[],
  total_matching bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with in_category as (
    select item.*
    from public.catalogue_items as item
    join public.category_mappings as mapping
      on mapping.organization_id = item.organization_id
     and mapping.group_name = coalesce(item.group_name, '')
     and mapping.subgroup_name = coalesce(item.subgroup_name, '')
     -- Only a confirmed mapping counts. A category rollup must never rest on a
     -- similarity score nobody agreed to.
     and mapping.status = 'confirmed'
     and mapping.anuma_category_key = p_category_key
    where item.organization_id = p_organization_id
      and item.valid_from <= p_as_of
      and (item.valid_to is null or item.valid_to > p_as_of)
  ),
  satisfying as (
    select * from in_category
    where (p_min_ram_gb is null or spec_ram_gb >= p_min_ram_gb)
      and (p_min_storage_gb is null or spec_storage_gb >= p_min_storage_gb)
      and (p_min_gpu_gb is null or spec_gpu_gb >= p_min_gpu_gb)
  )
  select id, item_id, description, brand_name, group_name, subgroup_name,
         spec_cpu_family, spec_ram_gb, spec_storage_gb, spec_gpu_gb,
         spec_screen_in, spec_issues,
         (select count(*) from satisfying) as total_matching
  from satisfying
  where (
    (select auth.role()) = 'service_role'
    or (select private.is_org_member(p_organization_id))
  )
  -- The best-specified rows first, so a reader sees real products rather than
  -- the ones whose descriptions happen to sort early.
  order by spec_ram_gb desc nulls last, spec_storage_gb desc nulls last, description
  limit least(p_limit, 200)
$$;

revoke all on function public.catalogue_candidates(uuid, timestamptz, text, text[], integer) from public;
revoke all on function public.catalogue_requirement_matches(uuid, timestamptz, text, integer, integer, integer, integer) from public;
grant execute on function public.catalogue_candidates(uuid, timestamptz, text, text[], integer)
  to authenticated, service_role;
grant execute on function public.catalogue_requirement_matches(uuid, timestamptz, text, integer, integer, integer, integer)
  to authenticated, service_role;

-- The candidate search is a substring match over the whole range, so it needs
-- trigram support or it reads every row on every question.
create extension if not exists pg_trgm;
create index if not exists catalogue_items_description_trgm_idx
  on public.catalogue_items using gin (description gin_trgm_ops);
