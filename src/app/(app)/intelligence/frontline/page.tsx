import { redirect } from "next/navigation";

import { FrontlineIntelligenceView } from "@/components/intelligence/frontline-intelligence-view";
import { PageHeader } from "@/components/ui/page-header";
import { getApplicationContext } from "@/modules/identity/application-context";
import {
  computeFrontline,
  frontlineActionCohorts,
  outcomeAssociations,
} from "@/modules/intelligence/frontline";
import { loadPopulation } from "@/modules/intelligence/population";

type PageProps = { searchParams: Promise<{ days?: string; store?: string }> };

/** Windows a reader can pick. Anything else falls back to 30 days. */
const WINDOWS = [7, 30, 90] as const;

export default async function FrontlineIntelligencePage({ searchParams }: PageProps) {
  const [context, params] = await Promise.all([getApplicationContext(), searchParams]);
  if (!context) redirect("/sign-in");
  if (!context.current) redirect("/setup");

  const { organization, membership, assignments, locations } = context.current;

  const days = WINDOWS.find((option) => option === Number(params.days)) ?? 30;
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

  // A rep sees only the stores they are assigned to. Filtering the options here
  // rather than in the query keeps an unassigned store from being selectable at
  // all, so a hand-typed id cannot widen what someone sees.
  const assignedLocationIds = new Set(
    assignments.flatMap((item) => (item.locationId ? [item.locationId] : [])),
  );
  const stores =
    membership.role === "admin"
      ? locations
      : locations.filter((item) => assignedLocationIds.has(item.id));
  const selectedStore = stores.find((item) => item.id === params.store) ?? null;

  const population = await loadPopulation({
    organizationId: organization.id,
    from: from.toISOString(),
    to: to.toISOString(),
    locationId: selectedStore?.id ?? null,
  });

  const metrics = computeFrontline(population.rows);
  const cohorts = frontlineActionCohorts(population.rows);
  const associations = outcomeAssociations(population.rows);

  return (
    <>
      <PageHeader
        eyebrow="Frontline intelligence"
        title="Where frontline execution needs attention"
      />
      <p className="fl-context">
        {population.rows.length} analysed interaction
        {population.rows.length === 1 ? "" : "s"} in the last {days} days
        {selectedStore ? ` at ${selectedStore.name}` : ""}.
      </p>
      <FrontlineIntelligenceView
        metrics={metrics}
        cohorts={cohorts}
        associations={associations}
        analysed={population.rows.length}
        withoutMetrics={population.withoutMetrics}
        periodLabel={`the last ${days} days`}
      />
    </>
  );
}
