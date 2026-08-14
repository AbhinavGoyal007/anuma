-- A product can be more than one thing at once.
--
-- The attribute model allowed one value per attribute per item, which is right
-- for a capacity and wrong for a kind. A Ford Escape PHEV is a compact SUV and a
-- plug-in hybrid and a hybrid, all three at once, and a shopper asking for any
-- of them means that car. Forcing a single value made the first fact overwrite
-- the second and the load fail outright when both arrived together.
--
-- Uniqueness moves to the value, so the same fact twice is still one row.

alter table public.catalogue_item_attributes
  drop constraint if exists catalogue_item_attributes_organization_id_item_id_attribute_key;

drop index if exists catalogue_item_attributes_organization_id_item_id_attribute_key;

create unique index if not exists catalogue_item_attributes_unique_value_idx
  on public.catalogue_item_attributes (
    organization_id, item_id, attribute_key,
    coalesce(value_text, ''), coalesce(value_numeric, -1)
  );
