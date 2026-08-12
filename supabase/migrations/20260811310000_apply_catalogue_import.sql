-- Applies a staged catalogue file to the versioned item table.
--
-- Set-based on purpose: a daily file is 180,000 rows, and comparing it row by
-- row from the application would take minutes and hold a transaction open. Here
-- the whole diff is four statements, and the common case — a row that did not
-- change — costs a single hash comparison and one column update.

create or replace function public.apply_catalogue_import(p_import_id uuid)
returns table(added integer, changed integer, delisted integer, unchanged integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_at timestamptz;
  v_added integer := 0;
  v_changed integer := 0;
  v_delisted integer := 0;
  v_unchanged integer := 0;
  v_inserted integer := 0;
begin
  select organization_id, created_at into v_org, v_at
  from public.catalogue_imports where id = p_import_id;
  if v_org is null then
    raise exception 'Catalogue import was not found.' using errcode = 'P0002';
  end if;

  -- Unchanged: same content. Only note that this import still saw it.
  update public.catalogue_items as item
  set last_seen_import = p_import_id
  from public.catalogue_staging as staged
  where staged.import_id = p_import_id
    and item.organization_id = v_org
    and item.valid_to is null
    and item.item_id = staged.item_id
    and item.content_hash = staged.content_hash;
  get diagnostics v_unchanged = row_count;

  -- Changed: the item is still listed but something about it differs. Close the
  -- old version; the new one is inserted below.
  update public.catalogue_items as item
  set valid_to = v_at
  from public.catalogue_staging as staged
  where staged.import_id = p_import_id
    and item.organization_id = v_org
    and item.valid_to is null
    and item.item_id = staged.item_id
    and item.content_hash <> staged.content_hash;
  get diagnostics v_changed = row_count;

  -- Delisted: current items the file no longer contains.
  update public.catalogue_items as item
  set valid_to = v_at
  where item.organization_id = v_org
    and item.valid_to is null
    and not exists (
      select 1 from public.catalogue_staging as staged
      where staged.import_id = p_import_id and staged.item_id = item.item_id
    );
  get diagnostics v_delisted = row_count;

  -- Everything in the file without a current row: the genuinely new items plus
  -- the changed ones just closed. first_seen is carried over where the item has
  -- been seen before, so an item's history stays traceable to its first sighting.
  insert into public.catalogue_items (
    organization_id, item_id, description, brand_id, brand_name,
    dept_id, dept_name, group_id, group_name, subgroup_id, subgroup_name,
    content_hash, first_seen_import, last_seen_import, valid_from
  )
  select v_org, staged.item_id, staged.description, staged.brand_id, staged.brand_name,
    staged.dept_id, staged.dept_name, staged.group_id, staged.group_name,
    staged.subgroup_id, staged.subgroup_name, staged.content_hash,
    coalesce(
      (select prior.first_seen_import from public.catalogue_items as prior
       where prior.organization_id = v_org and prior.item_id = staged.item_id
       order by prior.valid_from limit 1),
      p_import_id
    ),
    p_import_id, v_at
  from public.catalogue_staging as staged
  where staged.import_id = p_import_id
    and not exists (
      select 1 from public.catalogue_items as item
      where item.organization_id = v_org and item.item_id = staged.item_id
        and item.valid_to is null
    );
  get diagnostics v_inserted = row_count;
  v_added := v_inserted - v_changed;

  update public.catalogue_imports
  set added_count = v_added, changed_count = v_changed,
      delisted_count = v_delisted, unchanged_count = v_unchanged,
      status = 'completed', completed_at = now()
  where id = p_import_id;

  delete from public.catalogue_staging where import_id = p_import_id;

  return query select v_added, v_changed, v_delisted, v_unchanged;
end;
$$;

revoke all on function public.apply_catalogue_import(uuid) from public;
grant execute on function public.apply_catalogue_import(uuid) to service_role;
