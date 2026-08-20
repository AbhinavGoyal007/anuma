-- Two corrections to the pilot loop: identity that is actually an identity, and
-- reviews that are actually private.
--
-- Identity. The first version stored a joined `key=value&key=value` string and
-- called it a hash. It collided, it ignored the absolute dates a relative period
-- resolves to, and it bound a manager's answer to nothing about the interactions
-- they were looking at. A review saved against "last 30 days" meant something
-- different a week later and nothing said so. Both fingerprints are now SHA-256
-- over a canonical serialisation, computed server-side, with the resolved cohort
-- membership folded into the finding's identity.
--
-- Privacy. Selecting organization-wide let any member read every colleague's
-- private judgement of their team's work, and the panel presented what it found
-- as the reader's own earlier answer. A member now reads only their own rows;
-- organization-wide reading is an admin path, for the pilot aggregate report.
--
-- Written to run against a table that already holds rows: every existing row is
-- given a non-colliding legacy fingerprint rather than being assumed absent.

-- ---------------------------------------------------------------- usage events

alter table public.product_usage_events
  add column if not exists client_event_id uuid,
  add column if not exists scope_fingerprint text;

-- One real interaction, one id. Legacy rows predate the idea, so each gets its
-- own so the unique constraint below can be trusted from here on.
update public.product_usage_events
  set client_event_id = gen_random_uuid()
  where client_event_id is null;

update public.product_usage_events
  set scope_fingerprint = 'legacy_' || id::text
  where scope_fingerprint is null;

alter table public.product_usage_events
  alter column client_event_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'product_usage_events_client_event_id_key'
  ) then
    alter table public.product_usage_events
      add constraint product_usage_events_client_event_id_key unique (client_event_id);
  end if;
end
$$;

-- Journey rail nodes are static, so there is no stage to select. Restated in
-- full rather than patched, so the allowed set is readable in one place.
alter table public.product_usage_events
  drop constraint if exists product_usage_events_event_name_allowed;

alter table public.product_usage_events
  add constraint product_usage_events_event_name_allowed check (
    event_name in (
      'intelligence_page_viewed',
      'filter_changed',
      'core_signal_opened',
      'priority_action_opened',
      'trend_metric_selected',
      'breakdown_dimension_selected',
      'demand_value_reviewed',
      'journey_cohort_selected',
      'journey_diagnosis_opened',
      'frontline_stage_selected',
      'evidence_drawer_opened',
      'conversation_opened',
      'finding_reviewed',
      'finding_usefulness_saved',
      'management_action_saved'
    )
  );

-- ------------------------------------------------------------ finding reviews

alter table public.management_finding_reviews
  add column if not exists scope_fingerprint text,
  add column if not exists finding_fingerprint text;

-- A legacy row's cohort membership is unknowable now, so it cannot be given a
-- real fingerprint. It gets a unique one instead: it stays readable, and it can
-- never be mistaken for a finding computed under the new definition.
update public.management_finding_reviews
  set scope_fingerprint = coalesce(scope_fingerprint, 'legacy_' || id::text),
      finding_fingerprint = coalesce(finding_fingerprint, 'legacy_' || id::text);

alter table public.management_finding_reviews
  alter column scope_fingerprint set not null,
  alter column finding_fingerprint set not null;

alter table public.management_finding_reviews
  drop column if exists scope_hash;

alter table public.management_finding_reviews
  drop constraint if exists management_finding_reviews_unique;

-- One answer per manager per finding instance. The instance is the finding as
-- it stood — same scope, same cohort, same interactions — so re-answering the
-- same thing updates it and a changed population is a new question.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'management_finding_reviews_unique'
  ) then
    alter table public.management_finding_reviews
      add constraint management_finding_reviews_unique
      unique (organization_id, membership_id, finding_fingerprint);
  end if;
end
$$;

create index if not exists management_finding_reviews_scope_idx
  on public.management_finding_reviews (organization_id, membership_id, scope_fingerprint);

-- ------------------------------------------------------------------- privacy

drop policy if exists product_usage_events_select_member on public.product_usage_events;
drop policy if exists management_finding_reviews_select_member on public.management_finding_reviews;

create policy product_usage_events_select_self on public.product_usage_events
  for select to authenticated
  using (
    (select private.is_org_member(organization_id))
    and membership_id = (select private.current_membership_id(organization_id))
  );

-- Organization-wide reading exists for one purpose: the pilot aggregate report,
-- which is a management report and is admin-only in the application too.
create policy product_usage_events_select_admin on public.product_usage_events
  for select to authenticated
  using ((select private.is_org_admin(organization_id)));

create policy management_finding_reviews_select_self on public.management_finding_reviews
  for select to authenticated
  using (
    (select private.is_org_member(organization_id))
    and membership_id = (select private.current_membership_id(organization_id))
  );

create policy management_finding_reviews_select_admin on public.management_finding_reviews
  for select to authenticated
  using ((select private.is_org_admin(organization_id)));
