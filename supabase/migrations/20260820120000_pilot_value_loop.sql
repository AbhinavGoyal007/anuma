-- Pilot value loop: what managers actually do with Intelligence, and what they
-- say the findings were worth.
--
-- Two tables, deliberately narrow. Usage events record which management objects
-- were opened, never what was in them: no transcript text, no customer words,
-- no extracted values. A pilot needs to know whether a manager reached the
-- evidence, not what the evidence said — the second is already in the product
-- and putting a copy of it in an analytics table is how a recording of a real
-- customer ends up somewhere nobody is watching.
--
-- Finding reviews are the manager's own judgement, stored against a scope hash
-- rather than a live query, so "was this useful" stays attached to the finding
-- as it stood when they answered.

create table if not exists public.product_usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  membership_id uuid not null references public.organization_memberships (id) on delete cascade,
  session_id uuid not null,
  occurred_at timestamptz not null default now(),
  page text not null,
  event_name text not null,
  object_type text,
  object_key text,
  cohort_key text,
  conversation_id uuid references public.conversations (id) on delete set null,
  filters jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  constraint product_usage_events_event_name_allowed check (
    event_name in (
      'intelligence_page_viewed',
      'filter_changed',
      'core_signal_opened',
      'priority_action_opened',
      'trend_metric_selected',
      'breakdown_dimension_selected',
      'demand_value_reviewed',
      'journey_cohort_selected',
      'journey_stage_selected',
      'journey_diagnosis_opened',
      'frontline_stage_selected',
      'evidence_drawer_opened',
      'conversation_opened',
      'finding_reviewed',
      'finding_usefulness_saved',
      'management_action_saved'
    )
  )
);

create index if not exists product_usage_events_org_time_idx
  on public.product_usage_events (organization_id, occurred_at desc);
create index if not exists product_usage_events_membership_idx
  on public.product_usage_events (organization_id, membership_id, occurred_at desc);

create table if not exists public.management_finding_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  membership_id uuid not null references public.organization_memberships (id) on delete cascade,
  finding_key text not null,
  cohort_key text not null,
  scope_hash text not null,
  reviewed_at timestamptz,
  usefulness text,
  action_type text,
  would_have_known_without_anuma text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint management_finding_reviews_usefulness_allowed check (
    usefulness is null or usefulness in ('yes', 'no', 'unclear')
  ),
  constraint management_finding_reviews_action_allowed check (
    action_type is null or action_type in (
      'no_action_yet',
      'store_follow_up',
      'frontline_coaching',
      'commercial_follow_up',
      'data_correction',
      'share_escalate',
      'other'
    )
  ),
  constraint management_finding_reviews_known_allowed check (
    would_have_known_without_anuma is null
      or would_have_known_without_anuma in ('yes', 'no', 'unsure')
  ),
  -- One review per manager per finding per scope. Re-answering updates the
  -- answer rather than leaving two contradictory ones behind.
  constraint management_finding_reviews_unique
    unique (organization_id, membership_id, finding_key, cohort_key, scope_hash)
);

create index if not exists management_finding_reviews_org_idx
  on public.management_finding_reviews (organization_id, created_at desc);

alter table public.product_usage_events enable row level security;
alter table public.management_finding_reviews enable row level security;

-- A manager may only write events as themselves. Without the membership check a
-- member of the organization could attribute activity to a colleague, which
-- would make every pilot metric about adoption unfalsifiable.
create policy product_usage_events_select_member on public.product_usage_events
  for select to authenticated
  using ((select private.is_org_member(organization_id)));

create policy product_usage_events_insert_self on public.product_usage_events
  for insert to authenticated
  with check (
    (select private.is_org_member(organization_id))
    and membership_id = (select private.current_membership_id(organization_id))
  );

create policy management_finding_reviews_select_member on public.management_finding_reviews
  for select to authenticated
  using ((select private.is_org_member(organization_id)));

create policy management_finding_reviews_insert_self on public.management_finding_reviews
  for insert to authenticated
  with check (
    (select private.is_org_member(organization_id))
    and membership_id = (select private.current_membership_id(organization_id))
  );

create policy management_finding_reviews_update_self on public.management_finding_reviews
  for update to authenticated
  using (
    (select private.is_org_member(organization_id))
    and membership_id = (select private.current_membership_id(organization_id))
  )
  with check (
    (select private.is_org_member(organization_id))
    and membership_id = (select private.current_membership_id(organization_id))
  );
