import { cache } from "react";
import { cookies } from "next/headers";
import "server-only";

import { getAuthenticatedUser } from "@/lib/auth/session";
import type { Database } from "@/lib/supabase/database.generated";
import { createClient } from "@/lib/supabase/server";
import type { MembershipRole } from "@/modules/identity/roles";

export const organizationCookieName = "anuma_organization_id";

export type OrganizationOption = {
  id: string;
  name: string;
  role: MembershipRole;
};

export type OrganizationLocation = {
  id: string;
  name: string;
  locationType: Database["public"]["Enums"]["location_type"];
  timezone: string | null;
};

export type OrganizationTeam = { id: string; name: string };

export type ScopeAssignment = {
  effectiveFrom: string;
  effectiveTo: string | null;
  locationId: string | null;
  teamId: string | null;
};

export type ApplicationContext = {
  user: { id: string; email: string | null };
  organizations: OrganizationOption[];
  current: null | {
    organization: {
      id: string;
      name: string;
      countryCode: string;
      defaultCurrency: string;
      timezone: string;
    };
    membership: { id: string; role: MembershipRole };
    assignments: ScopeAssignment[];
    locations: OrganizationLocation[];
    teams: OrganizationTeam[];
  };
};

function reportContextDatabaseFailure(
  stage:
    | "organization_memberships"
    | "organization_memberships_retry"
    | "organizations"
    | "organization_scope",
  error: { code?: string; message: string },
) {
  console.error("ANUMA application context database failure", {
    code: error.code ?? null,
    message: error.message,
    stage,
  });
}

async function loadActiveMemberships(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  const query = () =>
    supabase
      .from("organization_memberships")
      .select("id, organization_id, role")
      .eq("user_id", userId)
      .eq("status", "active");

  let result = await query();
  // A newly issued token can reach PostgREST before its iat is valid on the
  // database service's clock. This is a bounded clock-skew retry, not a way
  // to hide authorization/database failures.
  for (let retry = 0; result.error?.code === "PGRST303" && retry < 4; retry += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    result = await query();
  }
  return result;
}

export const getApplicationContext = cache(async (): Promise<ApplicationContext | null> => {
  const user = await getAuthenticatedUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data: membershipRows, error: membershipsError } = await loadActiveMemberships(
    supabase,
    user.id,
  );

  if (membershipsError) {
    reportContextDatabaseFailure("organization_memberships", membershipsError);
    throw new Error("Could not load organization memberships.");
  }
  const memberships = membershipRows ?? [];
  if (memberships.length === 0) return { user, organizations: [], current: null };

  const organizationIds = memberships.map((membership) => membership.organization_id);
  const { data: organizations, error: organizationsError } = await supabase
    .from("organizations")
    .select("id, name, country_code, default_currency, timezone")
    .in("id", organizationIds)
    .order("name");

  if (organizationsError) {
    reportContextDatabaseFailure("organizations", organizationsError);
    throw new Error("Could not load organizations.");
  }

  const membershipByOrganization = new Map(
    memberships.map((membership) => [membership.organization_id, membership]),
  );
  const options = organizations.map((organization) => ({
    id: organization.id,
    name: organization.name,
    role: membershipByOrganization.get(organization.id)!.role,
  }));
  const cookieStore = await cookies();
  const requestedOrganizationId = cookieStore.get(organizationCookieName)?.value;
  const selectedOrganization =
    organizations.find((organization) => organization.id === requestedOrganizationId) ??
    organizations[0];
  const selectedMembership = membershipByOrganization.get(selectedOrganization.id)!;

  const [locationsResult, teamsResult, assignmentsResult] = await Promise.all([
    supabase
      .from("locations")
      .select("id, name, location_type, timezone")
      .eq("organization_id", selectedOrganization.id)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("teams")
      .select("id, name")
      .eq("organization_id", selectedOrganization.id)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("member_assignments")
      .select("location_id, team_id, effective_from, effective_to")
      .eq("membership_id", selectedMembership.id)
      .lte("effective_from", new Date().toISOString()),
  ]);

  if (locationsResult.error || teamsResult.error || assignmentsResult.error) {
    reportContextDatabaseFailure(
      "organization_scope",
      locationsResult.error ?? teamsResult.error ?? assignmentsResult.error!,
    );
    throw new Error("Could not load organization scope.");
  }

  const now = Date.now();
  const assignments = assignmentsResult.data
    .filter((assignment) => !assignment.effective_to || Date.parse(assignment.effective_to) > now)
    .map((assignment) => ({
      effectiveFrom: assignment.effective_from,
      effectiveTo: assignment.effective_to,
      locationId: assignment.location_id,
      teamId: assignment.team_id,
    }));

  return {
    user,
    organizations: options,
    current: {
      organization: {
        id: selectedOrganization.id,
        name: selectedOrganization.name,
        countryCode: selectedOrganization.country_code,
        defaultCurrency: selectedOrganization.default_currency,
        timezone: selectedOrganization.timezone,
      },
      membership: { id: selectedMembership.id, role: selectedMembership.role },
      assignments,
      locations: locationsResult.data.map((location) => ({
        id: location.id,
        name: location.name,
        locationType: location.location_type,
        timezone: location.timezone,
      })),
      teams: teamsResult.data,
    },
  };
});
