-- Member directory: resolve a membership to a person.
--
-- organization_memberships holds only user_id; the display identity (email)
-- lives in auth.users, which the cookie/RLS client cannot read. This
-- security-definer function exposes the minimum — membership id, email and role
-- — for the active members of an organization the caller belongs to, so the
-- frontline views can label a salesperson by name instead of a UUID.
--
-- It is a name lookup, not an access grant: which interactions a viewer may see
-- is still decided by row level security on conversations. The frontline pages
-- only ever look up membership ids they already obtained through RLS-scoped
-- conversations, so a representative — who sees only their own conversations —
-- only ever resolves their own name.

create or replace function public.organization_member_directory(p_organization_id uuid)
returns table (membership_id uuid, user_id uuid, email text, role public.membership_role)
language sql
stable
security definer
set search_path = ''
as $$
  select membership.id, membership.user_id, account.email::text, membership.role
  from public.organization_memberships as membership
  join auth.users as account on account.id = membership.user_id
  where membership.organization_id = p_organization_id
    and membership.status = 'active'
    and (select private.is_org_member(p_organization_id))
$$;

revoke all on function public.organization_member_directory(uuid) from public;
grant execute on function public.organization_member_directory(uuid) to authenticated, service_role;
