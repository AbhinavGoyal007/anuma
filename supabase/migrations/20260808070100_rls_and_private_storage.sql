-- Phase 2 tenant authorization and private audio Storage foundation.
-- Helper functions are SECURITY DEFINER only to inspect membership/scope without
-- recursive RLS. They have a fixed empty search_path and fully qualify relations.

create or replace function private.current_membership_id(p_organization_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select membership.id
  from public.organization_memberships as membership
  where membership.organization_id = p_organization_id
    and membership.user_id = (select auth.uid())
    and membership.status = 'active'
  limit 1
$$;

create or replace function private.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_membership_id(p_organization_id) is not null
$$;

create or replace function private.is_org_admin(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships as membership
    where membership.organization_id = p_organization_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role = 'admin'
  )
$$;

create or replace function private.is_org_manager(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships as membership
    where membership.organization_id = p_organization_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role = 'manager'
  )
$$;

create or replace function private.has_assignment_scope(
  p_membership_id uuid,
  p_location_id uuid,
  p_team_id uuid,
  p_at timestamptz default now()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.member_assignments as assignment
    where assignment.membership_id = p_membership_id
      and assignment.effective_from <= p_at
      and (assignment.effective_to is null or assignment.effective_to > p_at)
      and (assignment.location_id is null or assignment.location_id = p_location_id)
      and (assignment.team_id is null or assignment.team_id = p_team_id)
  )
$$;

create or replace function private.can_access_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations as conversation
    join public.organization_memberships as membership
      on membership.organization_id = conversation.organization_id
     and membership.user_id = (select auth.uid())
     and membership.status = 'active'
    where conversation.id = p_conversation_id
      and (
        membership.role = 'admin'
        or conversation.representative_membership_id = membership.id
        or conversation.created_by_membership_id = membership.id
        or (
          membership.role = 'manager'
          and private.has_assignment_scope(membership.id, conversation.location_id, conversation.team_id, now())
        )
      )
  )
$$;

create or replace function private.can_create_conversation(
  p_organization_id uuid,
  p_created_by_membership_id uuid,
  p_representative_membership_id uuid,
  p_location_id uuid,
  p_team_id uuid,
  p_started_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships as membership
    where membership.organization_id = p_organization_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and (
        membership.role = 'admin'
        or (
          membership.id = p_created_by_membership_id
          and membership.id = p_representative_membership_id
          and private.has_assignment_scope(membership.id, p_location_id, p_team_id, p_started_at)
        )
      )
  )
$$;

revoke all on function private.current_membership_id(uuid) from public;
revoke all on function private.is_org_member(uuid) from public;
revoke all on function private.is_org_admin(uuid) from public;
revoke all on function private.is_org_manager(uuid) from public;
revoke all on function private.has_assignment_scope(uuid, uuid, uuid, timestamptz) from public;
revoke all on function private.can_access_conversation(uuid) from public;
revoke all on function private.can_create_conversation(uuid, uuid, uuid, uuid, uuid, timestamptz) from public;
grant execute on function private.current_membership_id(uuid) to authenticated, service_role;
grant execute on function private.is_org_member(uuid) to authenticated, service_role;
grant execute on function private.is_org_admin(uuid) to authenticated, service_role;
grant execute on function private.is_org_manager(uuid) to authenticated, service_role;
grant execute on function private.has_assignment_scope(uuid, uuid, uuid, timestamptz) to authenticated, service_role;
grant execute on function private.can_access_conversation(uuid) to authenticated, service_role;
grant execute on function private.can_create_conversation(uuid, uuid, uuid, uuid, uuid, timestamptz) to authenticated, service_role;

create or replace function public.bootstrap_organization(
  p_name text,
  p_country_code text default 'IN',
  p_default_currency text default 'INR',
  p_timezone text default 'Asia/Kolkata'
)
returns table (organization_id uuid, membership_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_organization_id uuid := gen_random_uuid();
  v_membership_id uuid := gen_random_uuid();
  v_slug_base text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.organization_memberships
    where user_id = v_user_id and status = 'active'
  ) then
    raise exception 'Organization bootstrap is only available before the first active membership.' using errcode = '42501';
  end if;

  if char_length(btrim(p_name)) not between 2 and 120
    or upper(p_country_code) !~ '^[A-Z]{2}$'
    or upper(p_default_currency) !~ '^[A-Z]{3}$'
    or char_length(p_timezone) not between 3 and 64 then
    raise exception 'Invalid organization setup values.' using errcode = '22023';
  end if;

  v_slug_base := trim(both '-' from regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '-', 'g'));
  if v_slug_base = '' then
    v_slug_base := 'organization';
  end if;

  insert into public.organizations (id, name, slug, country_code, default_currency, timezone)
  values (
    v_organization_id,
    btrim(p_name),
    left(v_slug_base, 80) || '-' || left(replace(v_organization_id::text, '-', ''), 8),
    upper(p_country_code),
    upper(p_default_currency),
    p_timezone
  );

  insert into public.organization_memberships (id, organization_id, user_id, role, status)
  values (v_membership_id, v_organization_id, v_user_id, 'admin', 'active');

  return query select v_organization_id, v_membership_id;
end;
$$;

revoke all on function public.bootstrap_organization(text, text, text, text) from public;
grant execute on function public.bootstrap_organization(text, text, text, text) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.locations enable row level security;
alter table public.teams enable row level security;
alter table public.member_assignments enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.consent_records enable row level security;
alter table public.recordings enable row level security;
alter table public.transcription_runs enable row level security;
alter table public.transcript_segments enable row level security;
alter table public.speaker_mapping_versions enable row level security;
alter table public.speaker_mapping_entries enable row level security;
alter table public.analysis_runs enable row level security;
alter table public.evidence_groups enable row level security;
alter table public.evidence_references enable row level security;
alter table public.outcome_events enable row level security;
alter table public.conversation_quality_assessments enable row level security;

create policy organizations_select_member on public.organizations for select to authenticated
  using ((select private.is_org_member(id)));
create policy organizations_update_admin on public.organizations for update to authenticated
  using ((select private.is_org_admin(id)))
  with check ((select private.is_org_admin(id)));

create policy memberships_select_scope on public.organization_memberships for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.is_org_admin(organization_id))
    or (select private.is_org_manager(organization_id))
  );
create policy memberships_insert_admin on public.organization_memberships for insert to authenticated
  with check ((select private.is_org_admin(organization_id)));
create policy memberships_update_admin on public.organization_memberships for update to authenticated
  using ((select private.is_org_admin(organization_id)))
  with check ((select private.is_org_admin(organization_id)));

create policy locations_select_member on public.locations for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy locations_insert_admin on public.locations for insert to authenticated
  with check ((select private.is_org_admin(organization_id)));
create policy locations_update_admin on public.locations for update to authenticated
  using ((select private.is_org_admin(organization_id)))
  with check ((select private.is_org_admin(organization_id)));

create policy teams_select_member on public.teams for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy teams_insert_admin on public.teams for insert to authenticated
  with check ((select private.is_org_admin(organization_id)));
create policy teams_update_admin on public.teams for update to authenticated
  using ((select private.is_org_admin(organization_id)))
  with check ((select private.is_org_admin(organization_id)));

create policy assignments_select_scope on public.member_assignments for select to authenticated
  using (
    membership_id = (select private.current_membership_id(organization_id))
    or (select private.is_org_admin(organization_id))
  );
create policy assignments_insert_admin on public.member_assignments for insert to authenticated
  with check ((select private.is_org_admin(organization_id)));
create policy assignments_update_admin on public.member_assignments for update to authenticated
  using ((select private.is_org_admin(organization_id)))
  with check ((select private.is_org_admin(organization_id)));

create policy conversations_select_scope on public.conversations for select to authenticated
  using ((select private.can_access_conversation(id)));
create policy conversations_insert_scope on public.conversations for insert to authenticated
  with check ((select private.can_create_conversation(
    organization_id,
    created_by_membership_id,
    representative_membership_id,
    location_id,
    team_id,
    started_at
  )));
create policy conversations_update_admin on public.conversations for update to authenticated
  using ((select private.is_org_admin(organization_id)))
  with check ((select private.is_org_admin(organization_id)));

create policy participants_select_parent on public.conversation_participants for select to authenticated
  using ((select private.can_access_conversation(conversation_id)));
create policy participants_insert_parent on public.conversation_participants for insert to authenticated
  with check ((select private.can_access_conversation(conversation_id)));

create policy consent_select_parent on public.consent_records for select to authenticated
  using ((select private.can_access_conversation(conversation_id)));
create policy consent_insert_parent on public.consent_records for insert to authenticated
  with check (
    (select private.can_access_conversation(conversation_id))
    and captured_by_membership_id = (select private.current_membership_id(organization_id))
  );

create policy recordings_select_parent on public.recordings for select to authenticated
  using ((select private.can_access_conversation(conversation_id)));
create policy recordings_insert_parent on public.recordings for insert to authenticated
  with check (
    (select private.can_access_conversation(conversation_id))
    and created_by_membership_id = (select private.current_membership_id(organization_id))
  );

create policy transcription_runs_select_parent on public.transcription_runs for select to authenticated
  using ((select private.can_access_conversation(conversation_id)));
create policy transcript_segments_select_parent on public.transcript_segments for select to authenticated
  using ((select private.can_access_conversation(conversation_id)));
create policy mapping_versions_select_parent on public.speaker_mapping_versions for select to authenticated
  using ((select private.can_access_conversation(conversation_id)));
create policy mapping_versions_insert_parent on public.speaker_mapping_versions for insert to authenticated
  with check (
    (select private.can_access_conversation(conversation_id))
    and created_by_membership_id = (select private.current_membership_id(organization_id))
  );
create policy mapping_entries_select_parent on public.speaker_mapping_entries for select to authenticated
  using ((select private.can_access_conversation(conversation_id)));
create policy mapping_entries_insert_parent on public.speaker_mapping_entries for insert to authenticated
  with check ((select private.can_access_conversation(conversation_id)));
create policy analysis_runs_select_parent on public.analysis_runs for select to authenticated
  using ((select private.can_access_conversation(conversation_id)));
create policy evidence_groups_select_parent on public.evidence_groups for select to authenticated
  using ((select private.can_access_conversation(conversation_id)));
create policy evidence_references_select_parent on public.evidence_references for select to authenticated
  using ((select private.can_access_conversation(conversation_id)));
create policy outcomes_select_parent on public.outcome_events for select to authenticated
  using ((select private.can_access_conversation(conversation_id)));
create policy outcomes_insert_parent on public.outcome_events for insert to authenticated
  with check (
    (select private.can_access_conversation(conversation_id))
    and created_by_membership_id = (select private.current_membership_id(organization_id))
  );
create policy quality_select_parent on public.conversation_quality_assessments for select to authenticated
  using ((select private.can_access_conversation(conversation_id)));

revoke all on all tables in schema public from anon, authenticated;
grant select, update on public.organizations to authenticated;
grant select, insert, update on public.organization_memberships to authenticated;
grant select, insert, update on public.locations, public.teams, public.member_assignments to authenticated;
grant select, insert, update on public.conversations to authenticated;
grant select, insert on public.conversation_participants, public.consent_records, public.recordings to authenticated;
grant select on public.transcription_runs, public.transcript_segments, public.analysis_runs to authenticated;
grant select, insert on public.speaker_mapping_versions, public.speaker_mapping_entries to authenticated;
grant select on public.evidence_groups, public.evidence_references, public.conversation_quality_assessments to authenticated;
grant select, insert on public.outcome_events to authenticated;
grant all on all tables in schema public to service_role;

insert into storage.buckets (id, name, public, allowed_mime_types)
values (
  'conversation-audio',
  'conversation-audio',
  false,
  array['audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/wav', 'audio/x-wav', 'audio/ogg']
)
on conflict (id) do update
set public = false,
    allowed_mime_types = excluded.allowed_mime_types;

create policy conversation_audio_select on storage.objects for select to authenticated
  using (
    bucket_id = 'conversation-audio'
    and array_length(storage.foldername(name), 1) >= 3
    and exists (
      select 1
      from public.conversations as conversation
      where conversation.organization_id::text = (storage.foldername(name))[1]
        and conversation.id::text = (storage.foldername(name))[2]
        and (select private.can_access_conversation(conversation.id))
    )
  );

create policy conversation_audio_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'conversation-audio'
    and array_length(storage.foldername(name), 1) >= 3
    and exists (
      select 1
      from public.conversations as conversation
      where conversation.organization_id::text = (storage.foldername(name))[1]
        and conversation.id::text = (storage.foldername(name))[2]
        and (select private.can_access_conversation(conversation.id))
    )
  );

comment on function public.bootstrap_organization(text, text, text, text) is
  'Atomic first-tenant bootstrap. Authenticated callers with no active membership create one organization and become its admin.';
comment on function private.can_access_conversation(uuid) is
  'Conversation authorization: admins in tenant, owning/creating member, or manager with active matching location/team scope.';
