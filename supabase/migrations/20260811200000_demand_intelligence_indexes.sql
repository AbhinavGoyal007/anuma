-- Stage 0 read-path indexes for demand intelligence.
--
-- The dashboard aggregates on read. Three queries dominate it, and the largest
-- one — "every completed record, newest first, so the current record per
-- conversation can be chosen" — had no supporting index and no time bound. It
-- scanned the whole table and grew without limit. These indexes, together with
-- the rolling window the aggregator now applies and the explicit organization
-- pre-filter it now passes, turn each of the three into a bounded scan that the
-- planner can prune to one tenant before row level security runs.
--
-- Every index leads with organization_id: the read path now supplies an
-- explicit `organization_id = $viewer_org` predicate (RLS still enforces the
-- finer admin/manager/rep scope on top), so leading with the tenant is what
-- lets the planner cut to that tenant's slice first.

-- (1) The current-record scan: a tenant's completed records, newest first,
-- inside the window. conversation_id and id are carried so choosing the current
-- record per conversation can be an index-only scan.
create index interaction_records_org_status_time_idx
  on public.interaction_records (organization_id, status, created_at desc)
  include (conversation_id, id);

-- (2) The fact fetch: every present (non-abstained) fact for a set of records.
-- Partial, because the aggregation only ever reads the facts that resolved.
create index field_values_org_record_present_idx
  on public.interaction_field_values (organization_id, interaction_record_id)
  where abstention is null;

-- (3) The conversations list outcome lookup: the latest metrics row per
-- conversation, for the outcome badge.
create index interaction_metrics_org_conversation_time_idx
  on public.interaction_metrics (organization_id, conversation_id, computed_at desc);
