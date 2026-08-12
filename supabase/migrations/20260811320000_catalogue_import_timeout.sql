-- Let a catalogue import take the time a bulk load needs.
--
-- A first import inserts 180,000 rows against four indexes, which comfortably
-- exceeds the API's default statement timeout. The import is a deliberate,
-- administrator-triggered system operation rather than a user query, so the
-- limit is raised for this function alone — every other statement keeps the
-- short timeout that protects the database from a runaway dashboard query.

alter function public.apply_catalogue_import(uuid) set statement_timeout = '600s';

-- The diff joins staging to items on the item id; without this the join falls
-- back to a sequential scan of the staged file for every comparison.
create index if not exists catalogue_staging_item_idx
  on public.catalogue_staging (import_id, item_id);
