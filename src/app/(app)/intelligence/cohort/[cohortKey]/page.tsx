import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { getApplicationContext } from "@/modules/identity/application-context";
import {
  evidenceForField,
  timestamp,
  type EvidenceLine,
  type FieldEvidence,
} from "@/modules/intelligence/evidence";
import { filtersToQuery, parseFilters, resolvePeriods } from "@/modules/intelligence/filters";
import { resolveCohort } from "@/modules/intelligence/cohorts";
import { JOURNEY_COHORTS, type JourneyCohortKey } from "@/modules/intelligence/journey";
import { loadPopulation } from "@/modules/intelligence/population";
import { createClient } from "@/lib/supabase/server";

/** The distinct transcript lines behind an interaction, earliest first. */
function dedupeLines(quotes: readonly FieldEvidence[], limit = 3): EvidenceLine[] {
  const seen = new Map<string, EvidenceLine>();
  for (const quote of quotes) {
    for (const line of quote.lines) {
      const key = `${line.startMilliseconds}:${line.text}`;
      if (!seen.has(key)) seen.set(key, line);
    }
  }
  return [...seen.values()]
    .sort((a, b) => a.startMilliseconds - b.startMilliseconds)
    .slice(0, limit);
}

type PageProps = {
  params: Promise<{ cohortKey: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * The interactions behind one number, and the words behind each interaction.
 *
 * The cohort is recomputed here from the same population and the same pure
 * function the page used, rather than being passed a list of ids. That is what
 * makes this provably the set the number was counted from: a second query
 * written to resemble the first drifts the moment either definition changes, and
 * nothing would tell anyone it had.
 */
export default async function FrontlineCohortPage({ params, searchParams }: PageProps) {
  const [context, { cohortKey }, raw] = await Promise.all([
    getApplicationContext(),
    params,
    searchParams,
  ]);
  if (!context) redirect("/sign-in");
  if (!context.current) redirect("/setup");

  const { organization, membership, assignments, locations } = context.current;
  const filters = parseFilters(raw);
  const periods = resolvePeriods(filters);

  const assignedLocationIds = new Set(
    assignments.flatMap((item) => (item.locationId ? [item.locationId] : [])),
  );
  const stores =
    membership.role === "admin"
      ? locations
      : locations.filter((item) => assignedLocationIds.has(item.id));
  const selectedStore = stores.find((item) => item.id === filters.storeId) ?? null;

  const population = await loadPopulation({
    organizationId: organization.id,
    from: periods.current.from,
    to: periods.current.to,
    locationId: selectedStore?.id ?? null,
    purchaseCategory: filters.category,
  });

  // The journey groups are defined inside a selected cohort, so the same key
  // means a different set depending on which one the reader was looking at. It
  // travels in the URL, which is what lets a shared link open the same group.
  const requested = Array.isArray(raw.cohort) ? raw.cohort[0] : raw.cohort;
  const journeyCohort: JourneyCohortKey = JOURNEY_COHORTS.find((key) => key === requested) ?? "all";

  const cohort = resolveCohort(population.rows, cohortKey, journeyCohort);
  if (!cohort) notFound();

  const rows = population.rows.filter((row) => cohort.conversationIds.includes(row.conversationId));

  const [{ data: conversations }, evidence] = await Promise.all([
    createClient().then((supabase) =>
      supabase
        .from("conversations")
        .select("id, title, started_at, locations(name)")
        .eq("organization_id", organization.id)
        .in("id", cohort.conversationIds),
    ),
    evidenceForField(organization.id, cohort.conversationIds, cohort.evidenceFieldKeys),
  ]);
  const detail = new Map((conversations ?? []).map((row) => [row.id, row]));

  // Back to wherever this group is shown. Journey groups carry a cohort in the
  // URL; frontline ones do not.
  const back = requested
    ? `/intelligence/journey${filtersToQuery(filters)}${filtersToQuery(filters) ? "&" : "?"}cohort=${journeyCohort}`
    : `/intelligence/frontline${filtersToQuery(filters)}`;

  return (
    <>
      <PageHeader eyebrow="Frontline intelligence" title={`${rows.length} to review`} />
      <p className="fl-context">
        Interactions that {cohort.headline}
        {selectedStore ? ` at ${selectedStore.name}` : ""}. <Link href={back}>Back</Link>
      </p>

      <ul className="cohort-list">
        {rows.map((row) => {
          const conversation = detail.get(row.conversationId);
          const store = conversation?.locations as { name: string } | null;
          const quotes = evidence.get(row.conversationId) ?? [];
          return (
            <li key={row.conversationId} className="cohort-item">
              <div className="cohort-head">
                <Link className="cohort-title" href={`/conversations/${row.conversationId}`}>
                  {conversation?.title ?? "Untitled interaction"}
                </Link>
                <span className="cohort-meta">
                  {conversation?.started_at
                    ? new Date(conversation.started_at).toLocaleDateString()
                    : "—"}
                  {store?.name ? ` · ${store.name}` : ""}
                  {row.purchaseCategory ? ` · ${row.purchaseCategory}` : ""}
                </span>
              </div>
              <p className="cohort-reason">{cohort.reason}</p>

              {quotes.length > 0 ? (
                <ul className="cohort-evidence">
                  {
                    // Two fields often cite the same sentence — a commitment
                    // signal and the reason recorded beside it usually rest on
                    // one line. Printing it twice looks like a bug and wastes
                    // the space a second piece of evidence could have used.
                    dedupeLines(quotes).map((line, index) => (
                      <li key={`${line.startMilliseconds}-${index}`}>
                        <span className="cohort-stamp">{timestamp(line.startMilliseconds)}</span>
                        <span className="cohort-role">{line.role}</span>
                        <q>{line.text}</q>
                      </li>
                    ))
                  }
                </ul>
              ) : (
                // Said plainly rather than left blank. A cohort defined by an
                // absence often has nothing to quote, and an empty space would
                // read as a loading failure.
                <p className="cohort-noevidence">
                  No transcript line to show — this interaction matched on something that was not
                  said.
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {rows.length === 0 ? (
        <p className="fl-none">
          Nothing matches this cohort in the selected period. It may have been counted under a wider
          date range. <Link href={back}>Back</Link>
        </p>
      ) : null}
    </>
  );
}
