-- The strategic role a business assigns each category.
--
-- The category playbook holds that a category's role — destination, routine,
-- convenience, occasional — determines how it should be ranged, priced and
-- measured, and that a mismatch between that role and how customers actually
-- behave is the usual root cause of underperformance. The role is a business
-- decision, so it is stated here by an administrator rather than inferred; the
-- behaviour it is compared against is measured from conversations.

create table public.category_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Matches the extracted purchase_category, lowercased, so the two join.
  category text not null check (char_length(btrim(category)) between 1 and 80),
  intended_role text not null
    check (intended_role in ('destination', 'routine', 'convenience', 'occasional')),
  created_by_membership_id uuid references public.organization_memberships(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, category)
);

create index category_roles_org_idx on public.category_roles (organization_id);

create trigger category_roles_set_updated_at
  before update on public.category_roles
  for each row execute function private.set_updated_at();

alter table public.category_roles enable row level security;

create policy category_roles_select_member on public.category_roles
  for select to authenticated using ((select private.is_org_member(organization_id)));
create policy category_roles_write_admin on public.category_roles
  for insert to authenticated with check ((select private.is_org_admin(organization_id)));
create policy category_roles_update_admin on public.category_roles
  for update to authenticated
  using ((select private.is_org_admin(organization_id)))
  with check ((select private.is_org_admin(organization_id)));
create policy category_roles_delete_admin on public.category_roles
  for delete to authenticated using ((select private.is_org_admin(organization_id)));

grant select, insert, update, delete on public.category_roles to authenticated;
grant all on public.category_roles to service_role;
