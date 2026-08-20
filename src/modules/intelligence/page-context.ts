import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getApplicationContext } from "@/modules/identity/application-context";
import {
  narrowByScope,
  observedLanguages,
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
  /** The viewer's own membership, for attributing pilot events to them. */
  membershipId: string;
  /** Null unless a supporting read failed; never rendered as empty data. */
  directoryError: string | null;
  filters: IntelligenceFilters;
  periods: ResolvedPeriods;
  current: PopulationSummary;
  previous: PopulationSummary | null;
  stores: FilterOption[];
  representatives: FilterOption[];
  categories: string[];
  /** Arrival intents actually observed in the authorized slice. */
  intents: string[];
  /** Languages actually observed in the authorized slice. */
  languages: string[];
  selectedStoreName: string | null;
  /** Distinct stores represented in the current, fully narrowed population. */
  storeCount: number;
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
type DirectoryResult = { ok: true; options: FilterOption[] } | { ok: false; message: string };

async function representativeOptions(
  organizationId: string,
  membershipIds: readonly string[],
): Promise<DirectoryResult> {
  if (membershipIds.length === 0) return { ok: true, options: [] };
  const supabase = await createClient();
  // The directory RPC the roster page already uses, rather than a second join
  // that would have to be kept in step with it.
  const { data, error } = await supabase.rpc("organization_member_directory", {
    p_organization_id: organizationId,
  });
  // A failed directory read used to return an empty list, which validated the
  // selected representative away and quietly widened the page to everybody —
  // the reader saw more data than they had asked for and nothing said so.
  if (error) return { ok: false, message: error.message };
  const wanted = new Set(membershipIds);
  return {
    ok: true,
    options: (data ?? [])
      .filter((row) => wanted.has(row.membership_id))
      .map((row) => ({ id: row.membership_id, name: row.email ?? "Unnamed" }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
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

  const load = (
    from: string,
    to: string,
    representativeMembershipId: string | null,
    purchaseCategory: string | null,
  ) =>
    loadPopulation({
      organizationId: organization.id,
      from,
      to,
      locationId: selectedStore?.id ?? null,
      purchaseCategory,
      representativeMembershipId,
    });

  // The option source: authorized store and period, narrowed by neither
  // category nor representative. Deriving options from an already-narrowed
  // slice is what made a selection erase its own alternatives — pick one
  // category and the others vanished, pick a representative with no rows in
  // that category and the filter silently widened back to everybody.
  // Where nothing narrows the population, the comparison window does not depend
  // on anything the current one resolves, so the two periods are read together
  // rather than one after the other. Narrowed, the previous window needs the
  // validated representative and has to wait.
  const unnarrowed =
    scopedFilters.category === null && scopedFilters.representativeMembershipId === null;
  const [base, eagerPrevious] = await Promise.all([
    load(periods.current.from, periods.current.to, null, null),
    unnarrowed && periods.previous
      ? load(periods.previous.from, periods.previous.to, null, null)
      : null,
  ]);
  const directory = await representativeOptions(organization.id, [
    ...new Set(
      base.rows.flatMap((row) =>
        row.representativeMembershipId ? [row.representativeMembershipId] : [],
      ),
    ),
  ]);
  const representatives = directory.ok ? directory.options : [];
  // When the directory is unavailable the selection is honoured anyway: it is
  // still a valid membership id inside this organization, RLS still scopes the
  // read, and keeping it narrows the page rather than widening it. What is lost
  // is the ability to name the person, which the page says.
  const selectedRep = directory.ok
    ? (representatives.find((item) => item.id === scopedFilters.representativeMembershipId) ?? null)
    : scopedFilters.representativeMembershipId
      ? { id: scopedFilters.representativeMembershipId, name: "Selected salesperson" }
      : null;
  scopedFilters.representativeMembershipId = selectedRep?.id ?? null;

  // An authorized representative with no rows in the selected category stays
  // selected and returns nothing, which is the honest answer. Dropping them
  // because their slice is empty would widen the page back to every
  // representative without the reader asking for it.
  const narrowed = selectedRep !== null || scopedFilters.category !== null;
  const [currentAll, previousAll] = await Promise.all([
    narrowed
      ? load(
          periods.current.from,
          periods.current.to,
          selectedRep?.id ?? null,
          scopedFilters.category,
        )
      : base,
    narrowed && periods.previous
      ? load(
          periods.previous.from,
          periods.previous.to,
          selectedRep?.id ?? null,
          scopedFilters.category,
        )
      : eagerPrevious,
  ]);

  // Interaction-level dimensions are applied after the read, to the same
  // population both periods are drawn from. A selection matching nothing stays
  // selected and returns zero rows rather than quietly widening.
  const current: PopulationSummary = {
    ...currentAll,
    rows: narrowByScope(currentAll.rows, scopedFilters),
  };
  const previous: PopulationSummary | null = previousAll
    ? { ...previousAll, rows: narrowByScope(previousAll.rows, scopedFilters) }
    : null;

  return {
    organizationId: organization.id,
    membershipId: membership.id,
    /** Set where a supporting read failed, so the page can say so rather than under-report. */
    directoryError: directory.ok ? null : directory.message,
    filters: scopedFilters,
    periods,
    current,
    previous,
    stores,
    representatives,
    // From the unnarrowed slice, so choosing a category never removes the others.
    categories: base.availableCategories,
    intents: [
      ...new Set(base.rows.flatMap((row) => (row.arrivalIntent ? [row.arrivalIntent] : []))),
    ].sort(),
    languages: observedLanguages(base.rows),
    selectedStoreName: selectedStore?.name ?? null,
    storeCount: new Set(current.rows.flatMap((row) => (row.locationId ? [row.locationId] : [])))
      .size,
  };
}
