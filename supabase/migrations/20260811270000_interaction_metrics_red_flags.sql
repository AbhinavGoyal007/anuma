-- Red-flag count on the interaction metrics.
--
-- How many moments in an interaction a manager should review — a negative
-- remark, a compliance gap, a channel conflict — is a risk signal the dashboard
-- and frontline views slice by, so it is stored here as a deterministic count
-- per conversation. Counted in code from the extracted, evidence-backed flags,
-- never produced by a model as a number.

alter table public.interaction_metrics
  add column red_flag_count integer not null default 0;
