-- A human-readable recap of the interaction, on the record itself.
--
-- The summary is generated from the record's own validated facts, not the raw
-- transcript, so it cannot assert anything the extraction did not already
-- support. It is derived data versioned with the record it belongs to — a new
-- record version carries its own summary — so it lives as a column here rather
-- than in a table of its own. Nullable: older records and any where generation
-- was skipped simply have none.

alter table public.interaction_records
  add column summary text check (summary is null or char_length(btrim(summary)) between 1 and 2000);
