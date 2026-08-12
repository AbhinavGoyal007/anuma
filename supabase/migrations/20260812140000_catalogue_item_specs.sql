-- What each catalogue row actually says about the product.
--
-- A retailer's description is not prose, it is a compressed convention:
--
--   Lenovo LOQ 83DV0007AX i7/16/512/6/15.6/G
--                         └cpu┘ ram storage gpu screen colour
--
-- Nothing downstream can answer "did we have what this customer wanted" against
-- that string. A customer asking for sixteen gigabytes and a 4060 is stating
-- numbers, and numbers have to be compared as numbers — so the reading is done
-- once, at import, and stored in columns a query can filter on.
--
-- The columns live on `catalogue_items` rather than in a table beside it because
-- a spec is a pure function of `description`, and `description` is part of the
-- row's content hash. When the text changes the import closes that version and
-- opens a new one, which is then parsed on its own terms — so a spec can never
-- drift away from the words it was read from, and history stays honest about
-- what the range said on any given day.
--
-- `spec_parser_version` records which set of rules produced the values. The
-- parse is deterministic and reproducible from the description, so improving the
-- rules re-runs in place and moves the version rather than accumulating
-- versions of a row nobody corrected — this is derived text, not a judgement
-- somebody made and might want back.
--
-- `spec_issues` is the reason a field is null, and it is the point of the whole
-- exercise: 57% of this catalogue's descriptions are cut off at 40 characters,
-- so "HP Victus 16R1060NE A57E4EA i7-14700HX/3" ends mid-number and that 3 is
-- the first digit of 32. Recording *why* a row could not be read lets the review
-- screen group thousands of rows under one cause, and one rule then fixes them
-- all rather than a person correcting them one at a time.

alter table public.catalogue_items
  add column if not exists spec_cpu text,
  add column if not exists spec_cpu_family text,
  add column if not exists spec_ram_gb integer,
  add column if not exists spec_storage_gb integer,
  add column if not exists spec_gpu_gb integer,
  add column if not exists spec_screen_in numeric(3, 1),
  add column if not exists spec_colour text,
  add column if not exists spec_issues text[] not null default '{}',
  add column if not exists spec_completeness smallint,
  add column if not exists spec_parser_version text,
  add column if not exists spec_parsed_at timestamptz;

comment on column public.catalogue_items.spec_issues is
  'Why a field could not be read: truncated, no_spec_section, implausible_ram, nothing_parsed.';
comment on column public.catalogue_items.spec_parser_version is
  'Which parser rules produced these values. Re-parsing in place is safe; the parse is a pure function of the description.';

-- The filters an assortment answer actually applies: current rows of one
-- organization, narrowed by the numbers a customer states.
create index if not exists catalogue_items_spec_idx
  on public.catalogue_items (organization_id, spec_cpu_family, spec_ram_gb, spec_storage_gb)
  where valid_to is null;
-- The review screen's own question: what could not be read, worst first.
create index if not exists catalogue_items_spec_issues_idx
  on public.catalogue_items using gin (spec_issues)
  where valid_to is null;

-- Why a catalogue cannot be read, counted.
--
-- An RPC because the answer is a handful of rows aggregated from a few hundred
-- thousand: counting in the application would move the whole catalogue over the
-- wire and hit the API's row cap long before it finished.
create or replace function public.catalogue_spec_health(p_organization_id uuid)
returns table(
  issue text,
  item_count bigint,
  example_description text
)
language sql
stable
security definer
set search_path = ''
as $$
  select issue,
         count(*) as item_count,
         min(item.description) as example_description
  from public.catalogue_items as item
  cross join lateral unnest(
    case when cardinality(item.spec_issues) = 0 then array['readable'] else item.spec_issues end
  ) as issue
  where item.organization_id = p_organization_id
    and item.valid_to is null
    and item.spec_parsed_at is not null
    and (
      (select auth.role()) = 'service_role'
      or (select private.is_org_member(p_organization_id))
    )
  group by issue
  order by count(*) desc
$$;

revoke all on function public.catalogue_spec_health(uuid) from public;
grant execute on function public.catalogue_spec_health(uuid) to authenticated, service_role;
