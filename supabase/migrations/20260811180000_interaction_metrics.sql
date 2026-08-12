-- Interaction-level metrics: the deterministic numbers, one row per conversation.
--
-- The atomic facts say what happened; this says what it means as a measure —
-- objection coverage, the price gap, how much the customer's requirement
-- clarified. Computed in code from the facts, never by a model, and stored so
-- that aggregation across stores and time is a plain GROUP BY rather than a
-- re-derivation on every dashboard load.
--
-- The store, category and time are denormalised onto each row on purpose: the
-- dashboard slices by them constantly, and a metrics table that needs a join to
-- answer "objection coverage in Pune electronics last week" is the wrong shape.

create table public.interaction_metrics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid not null,
  interaction_record_id uuid not null,
  -- The formula version. Change a definition and every row is recomputed to the
  -- new version, so an aggregate never mixes two definitions of the same metric.
  algorithm_version text not null check (char_length(btrim(algorithm_version)) between 1 and 40),

  -- Denormalised slicing dimensions, copied from the conversation.
  location_id uuid,
  team_id uuid,
  vertical public.conversation_vertical not null,
  started_at timestamptz not null,
  purchase_category text,

  -- Intent and outcome.
  arrival_intent text,
  decision_state text,

  -- Requirement clarification (ordinal 0..3).
  clarity_start smallint check (clarity_start is null or clarity_start between 0 and 3),
  clarity_end smallint check (clarity_end is null or clarity_end between 0 and 3),
  clarity_delta smallint check (clarity_delta is null or clarity_delta between -3 and 3),

  -- Budget, in minor units so sums and averages are exact.
  target_budget_minor bigint check (target_budget_minor is null or target_budget_minor >= 0),
  max_budget_minor bigint check (max_budget_minor is null or max_budget_minor >= 0),
  budget_currency text check (budget_currency is null or budget_currency ~ '^[A-Z]{3}$'),

  -- Demand shape.
  use_case_count integer not null default 0,
  requirement_count integer not null default 0,
  products_considered_count integer not null default 0,
  products_recommended_count integer not null default 0,

  -- Friction and how it was handled.
  objection_count integer not null default 0,
  objection_coverage numeric(4, 3) check (objection_coverage is null or (objection_coverage >= 0 and objection_coverage <= 1)),
  alternative_offered text,

  -- Competition. The price gap is always customer-claimed until a feed verifies
  -- it, and the basis column is what keeps that distinction from being lost.
  competitor_count integer not null default 0,
  price_gap numeric(8, 4),
  price_gap_basis text check (price_gap_basis is null or price_gap_basis in ('claimed', 'verified')),

  -- Commercial signals.
  finance_requested boolean not null default false,
  promotion_discussed boolean not null default false,
  demo_performed text,

  computed_at timestamptz not null default now(),

  -- One current metrics row per record; recomputing replaces it in place, and
  -- the record itself is the version anchor for the facts underneath.
  unique (interaction_record_id),
  constraint interaction_metrics_record_fk
    foreign key (organization_id, conversation_id, interaction_record_id)
    references public.interaction_records(organization_id, conversation_id, id) on delete cascade
);

-- The indexes the aggregation layer actually uses: slice by org over time, and
-- by category within an org.
create index interaction_metrics_org_time_idx
  on public.interaction_metrics (organization_id, started_at desc);
create index interaction_metrics_org_vertical_idx
  on public.interaction_metrics (organization_id, vertical, started_at desc);

alter table public.interaction_metrics enable row level security;

create policy interaction_metrics_select_parent on public.interaction_metrics
  for select to authenticated using ((select private.can_access_conversation(conversation_id)));

grant select on public.interaction_metrics to authenticated;
