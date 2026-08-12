-- Make the catalogue apply genuinely set-based.
--
-- The insert that finishes an import looked set-based but was not. Two of its
-- expressions were correlated subqueries against `catalogue_items` — the very
-- table being inserted into:
--
--   coalesce((select prior.first_seen_import from catalogue_items as prior
--             where prior.item_id = staged.item_id order by prior.valid_from
--             limit 1), p_import_id)
--   ...
--   and not exists (select 1 from catalogue_items as item
--                   where item.item_id = staged.item_id and item.valid_to is null)
--
-- Each is re-evaluated per staged row, so a 180,000-row file performs ~360,000
-- index probes into an index this same statement is extending. Worse, every
-- probe for item X finds the row the statement has just inserted for X, and
-- because that tuple is not visible to the statement's own snapshot the index
-- cannot answer on its own — it must fetch the heap page to reject it. The cost
-- per probe therefore grows as the insert proceeds. A first import of AG LLC's
-- catalogue ran for thirty minutes on this statement without finishing.
--
-- Both lookups read the pre-statement snapshot, so both can be computed once,
-- up front, and joined. `materialized` is stated rather than left to the planner
-- because inlining either CTE restores the per-row plan and the pathology with
-- it, and the anti-join is written as an explicit left join so the shape does
-- not depend on how a `not exists` happens to be estimated.
--
-- The results are identical: the CTEs see exactly what the correlated subqueries
-- saw, which is the table as it stood before this statement began.
--
-- The `set statement_timeout = '600s'` the function used to carry is dropped.
-- It never had any effect — Postgres arms the statement timer when the outer
-- statement begins, and setting the GUC on entry to a function does not re-arm
-- it — and leaving it in place implies a protection that does not exist. The
-- caller sets its own ceiling; see scripts/load-catalogue.mts.

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

  -- Delisted: current items the file no longer contains. This subquery reads
  -- staging, which nothing is writing to, so it stays as it was.
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
    content_hash, first_seen_import, last_seen_import, valid_from
  )
  select v_org, staged.item_id, staged.description, staged.brand_id, staged.brand_name,
    staged.dept_id, staged.dept_name, staged.group_id, staged.group_name,
    staged.subgroup_id, staged.subgroup_name, staged.content_hash,
    coalesce(first_seen.first_seen_import, p_import_id),
    p_import_id, v_at
  from public.catalogue_staging as staged
  left join first_seen on first_seen.item_id = staged.item_id
  left join current_item on current_item.item_id = staged.item_id
  where staged.import_id = p_import_id
    and current_item.item_id is null;
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
