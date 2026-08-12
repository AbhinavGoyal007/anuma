-- The distinct category labels a catalogue currently uses, with item counts.
--
-- Asked as a function rather than a query because the answer is a few hundred
-- rows aggregated from a few hundred thousand: fetching the items to group them
-- in the application would move the whole catalogue over the wire, and would hit
-- the API's row limit long before it finished.

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
    and (select private.is_org_member(p_organization_id))
  group by 1, 2
  order by count(*) desc
$$;

revoke all on function public.catalogue_label_summary(uuid) from public;
grant execute on function public.catalogue_label_summary(uuid) to authenticated, service_role;
