-- Carrying money through the apply.
--
-- `price_minor`, `msrp_minor` and `currency_code` were added to both the staging
-- table and the item table, but the statement that moves one into the other
-- names its columns explicitly, so every price staged was dropped on the way in
-- and every item landed with a null price. Silent, and exactly the failure the
-- rest of this system is built to avoid: the load reported success.
--
-- The content hash deliberately does not cover price. A price change is a change
-- to what the product costs, not to what the product is, and folding it into the
-- hash would open a new version of every item in the catalogue on the day a
-- retailer runs a sale.

drop function if exists public.apply_catalogue_import(uuid);

create function public.apply_catalogue_import(p_import_id uuid)
returns table(added_count integer, changed_count integer, delisted_count integer, unchanged_count integer)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_org uuid;
  v_at timestamptz;
  v_added integer := 0;
  v_changed integer := 0;
  v_delisted integer := 0;
  v_unchanged integer := 0;
begin
  select organization_id, created_at into v_org, v_at
  from public.catalogue_imports where id = p_import_id;
  if v_org is null then
    raise exception 'No such import: %', p_import_id;
  end if;

  select count(*) into v_unchanged
  from public.catalogue_staging as staged
  join public.catalogue_items as item
    on item.organization_id = v_org
   and item.valid_to is null
   and item.item_id = staged.item_id
   and item.content_hash = staged.content_hash
  where staged.import_id = p_import_id;

  select count(*) into v_changed
  from public.catalogue_staging as staged
  join public.catalogue_items as item
    on item.organization_id = v_org
   and item.valid_to is null
   and item.item_id = staged.item_id
   and item.content_hash <> staged.content_hash
  where staged.import_id = p_import_id;

  -- Anything current that this file no longer lists has left the range.
  update public.catalogue_items as item
  set valid_to = v_at
  where item.organization_id = v_org
    and item.valid_to is null
    and not exists (
      select 1 from public.catalogue_staging as staged
      where staged.import_id = p_import_id and staged.item_id = item.item_id
    );
  get diagnostics v_delisted = row_count;

  -- Anything whose content changed is closed so the new version can open.
  update public.catalogue_items as item
  set valid_to = v_at
  from public.catalogue_staging as staged
  where item.organization_id = v_org
    and item.valid_to is null
    and staged.import_id = p_import_id
    and staged.item_id = item.item_id
    and staged.content_hash <> item.content_hash;

  with current_item as materialized (
    select item.item_id
    from public.catalogue_items as item
    where item.organization_id = v_org and item.valid_to is null
  ),
  first_seen as materialized (
    select distinct on (item.item_id) item.item_id, item.first_seen_import
    from public.catalogue_items as item
    where item.organization_id = v_org
    order by item.item_id, item.valid_from
  )
  insert into public.catalogue_items (
    organization_id, item_id, description, brand_id, brand_name,
    dept_id, dept_name, group_id, group_name, subgroup_id, subgroup_name,
    price_minor, msrp_minor, currency_code,
    content_hash, first_seen_import, last_seen_import, valid_from
  )
  select v_org, staged.item_id, staged.description, staged.brand_id, staged.brand_name,
    staged.dept_id, staged.dept_name, staged.group_id, staged.group_name,
    staged.subgroup_id, staged.subgroup_name,
    staged.price_minor, staged.msrp_minor, staged.currency_code,
    staged.content_hash,
    coalesce(first_seen.first_seen_import, p_import_id), p_import_id, v_at
  from public.catalogue_staging as staged
  left join first_seen on first_seen.item_id = staged.item_id
  left join current_item on current_item.item_id = staged.item_id
  where staged.import_id = p_import_id
    and current_item.item_id is null;
  get diagnostics v_added = row_count;

  -- A price that moved on an item whose description did not is not a new
  -- version of the item; it is the same item at a new price.
  update public.catalogue_items as item
  set price_minor = staged.price_minor,
      msrp_minor = staged.msrp_minor,
      currency_code = coalesce(staged.currency_code, item.currency_code)
  from public.catalogue_staging as staged
  where item.organization_id = v_org
    and item.valid_to is null
    and staged.import_id = p_import_id
    and staged.item_id = item.item_id
    and staged.price_minor is distinct from item.price_minor;

  update public.catalogue_imports
  set status = 'completed', completed_at = now(),
      added_count = v_added, changed_count = v_changed,
      delisted_count = v_delisted, unchanged_count = v_unchanged
  where id = p_import_id;

  delete from public.catalogue_staging where import_id = p_import_id;

  return query select v_added, v_changed, v_delisted, v_unchanged;
end;
$function$;
