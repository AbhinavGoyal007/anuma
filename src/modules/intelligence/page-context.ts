import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getApplicationContext } from "@/modules/identity/application-context";
import {
  parseFilters,
  resolvePeriods,
  type IntelligenceFilters,
  type ResolvedPeriods,
} from "@/modules/intelligence/filters";
import { loadPopulation, type PopulationSummary } from "@/modules/intelligence/population";

/**
 * Everything the four Intelligence pages need, resolved once.
 *
 * Extracted because the same twenty lines were repeated on every page: work out
 * which stores the viewer may see, validate the selection against them, resolve
 * the periods, load both populations. Repeated authorization logic is repeated
 * chances to get authorization wrong, and the copy on the fourth page is the one
 * that gets forgotten when the rule changes.
 */

export type FilterOption = { id: string; name: string };

export type IntelligencePageContext = {
  organizationId: string;
  filters: IntelligenceFilters;
  periods: ResolvedPeriods;
  current: PopulationSummary;
  previous: PopulationSummary | null;
  stores: FilterOption[];
  representatives: FilterOption[];
  categories: string[];
  selectedStoreName: string | null;
};

/**
 * The representatives the viewer may filter by.
 *
 * Read through the cookie client so row-level security decides what comes back,
 * and narrowed again to the conversations actually in scope — a name that has
 * never appeared on the floor being filtered is not a useful option, and listing
 * the whole roster to someone scoped to one store leaks the shape of the
 * organization.
 */
async function representativeOptions(
  organizationId: string,
  membershipIds: readonly string[],
): Promise<FilterOption[]> {
  if (membershipIds.length === 0) return [];
  const supabase = await createClient();
  // The directory RPC the roster page already uses, rather than a second join
  // that would have to be kept in step with it.
  const { data } = await supabase.rpc("organization_member_directory", {
    p_organization_id: organizationId,
  });
  const wanted = new Set(membershipIds);
  return (data ?? [])
    .filter((row) => wanted.has(row.membership_id))
    .map((row) => ({ id: row.membership_id, name: row.email ?? "Unnamed" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function resolveIntelligencePage(
  raw: Record<string, string | string[] | undefined>,
): Promise<IntelligencePageContext | { redirect: string }> {
  const context = await getApplicationContext();
  if (!context) return { redirect: "/sign-in" };
  if (!context.current) return { redirect: "/setup" };

  const { organization, membership, assignments, locations } = context.current;
  const filters = parseFilters(raw);
  const periods = resolvePeriods(filters);

  // A representative sees only the stores they are assigned to. Narrowing the
  // options here rather than in the query means an unassigned store is not a
  // selectable option at all, so a hand-typed id in the URL cannot widen what
  // somebody sees.
  const assignedLocationIds = new Set(
    assignments.flatMap((item) => (item.locationId ? [item.locationId] : [])),
  );
  const stores = (
    membership.role === "admin"
      ? locations
      : locations.filter((item) => assignedLocationIds.has(item.id))
  ).map((item) => ({ id: item.id, name: item.name }));

  const selectedStore = stores.find((item) => item.id === filters.storeId) ?? null;
  // An unauthorized or stale id is dropped rather than passed through, so a
  // hand-edited URL narrows to nothing rather than widening to everything.
  const scopedFilters: IntelligenceFilters = { ...filters, storeId: selectedStore?.id ?? null };

  const load = (from: string, to: string, representativeMembershipId: string | null) =>
    loadPopulation({
      organizationId: organization.id,
      from,
      to,
      locationId: selectedStore?.id ?? null,
      purchaseCategory: scopedFilters.category,
      representativeMembershipId,
    });

  // Loaded once without the representative filter to learn who is selectable,
  // then again narrowed if the selection turns out to be authorized.
  const unscoped = await load(periods.current.from, periods.current.to, null);
  const representatives = await representativeOptions(organization.id, [
    ...new Set(
      unscoped.rows.flatMap((row) =>
        row.representativeMembershipId ? [row.representativeMembershipId] : [],
      ),
    ),
  ]);
  const selectedRep =
    representatives.find((item) => item.id === scopedFilters.representativeMembershipId) ?? null;
  scopedFilters.representativeMembershipId = selectedRep?.id ?? null;

  const [current, previous] = await Promise.all([
    selectedRep ? load(periods.current.from, periods.current.to, selectedRep.id) : unscoped,
    periods.previous
      ? load(periods.previous.from, periods.previous.to, selectedRep?.id ?? null)
      : null,
  ]);

  return {
    organizationId: organization.id,
    filters: scopedFilters,
    periods,
    current,
    previous,
    stores,
    representatives,
    // From the unnarrowed slice, so choosing a category never removes the others.
    categories: unscoped.availableCategories,
    selectedStoreName: selectedStore?.name ?? null,
  };
}
