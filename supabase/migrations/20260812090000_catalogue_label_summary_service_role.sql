-- Let a system caller read the catalogue's label summary.
--
-- `catalogue_label_summary` guards itself with `private.is_org_member`, which
-- asks whether `auth.uid()` belongs to the organization. A service-role caller
-- has no `auth.uid()` — it is a system identity, not a person — so the guard was
-- false and the function returned no rows at all.
--
-- The visible effect was worse than an error: `proposeCategoryMappings` runs as
-- the service role, so it saw an empty label list, concluded there was nothing
-- to map, and reported success having proposed nothing. A silent zero is the
-- most expensive kind of wrong.
--
-- The service role already bypasses row-level security on every table this
-- function reads. Recognising it here does not widen access; it stops a
-- security-definer function being stricter than the tables behind it.

create or replace function public.catalogue_label_summary(p_organization_id uuid)
returns table(group_name text, subgroup_name text, item_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(item.group_name, '') as group_name,
         coalesce(item.subgroup_name, '') as subgroup_name,
         count(*) as item_count
  from public.catalogue_items as item
  where item.organization_id = p_organization_id
    and item.valid_to is null
    and (
      (select auth.role()) = 'service_role'
      or (select private.is_org_member(p_organization_id))
    )
  group by 1, 2
  order by count(*) desc
$$;

revoke all on function public.catalogue_label_summary(uuid) from public;
grant execute on function public.catalogue_label_summary(uuid) to authenticated, service_role;
