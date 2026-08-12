-- Cross-sell and upsell counts on the interaction metrics.
--
-- Whether the representative reached for a complementary offer (accessory,
-- warranty, add-on) or a step-up (a costlier model, more RAM) is a rep-execution
-- signal the demand and frontline views both slice by, so it is stored here as a
-- deterministic count per conversation rather than recomputed on read. Counted
-- in code from the extracted facts, never by a model.

alter table public.interaction_metrics
  add column cross_sell_count integer not null default 0,
  add column upsell_count integer not null default 0;
