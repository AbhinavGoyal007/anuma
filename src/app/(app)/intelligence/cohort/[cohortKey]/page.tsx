import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { IntelligenceHead } from "@/components/intelligence/filter-bar";
import { createClient } from "@/lib/supabase/server";
import { resolveCohort } from "@/modules/intelligence/cohorts";
import {
  evidenceForField,
  timestamp,
  type EvidenceLine,
  type FieldEvidence,
} from "@/modules/intelligence/evidence";
import { intelligenceHref, single, windowLabel } from "@/modules/intelligence/filters";
import { JOURNEY_COHORTS, type JourneyCohortKey } from "@/modules/intelligence/journey";
import { resolveIntelligencePage } from "@/modules/intelligence/page-context";

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
 *
 * The drawer shows the first few. This is the whole list.
 */
export default async function FrontlineCohortPage({ params, searchParams }: PageProps) {
  const [{ cohortKey }, raw] = await Promise.all([params, searchParams]);

  // The same resolver the four pages use, so the drill-down inherits the exact
  // authorization and filter contract. Building the population separately here
  // meant a page narrowed to one salesperson opened a cohort across all of
  // them: the count on the page and the list behind it were computed from
  // different populations, which is the one thing a drill-down must never do.
  const page = await resolveIntelligencePage(raw);
  if ("redirect" in page) redirect(page.redirect);
  const { organizationId, filters, current: population, selectedStoreName, storeCount } = page;

  // The journey groups are defined inside a selected cohort, so the same key
  // means a different set depending on which one the reader was looking at. It
  // travels in the URL, which is what lets a shared link open the same group.
  const requested = single(raw, "cohort");
  const journeyCohort: JourneyCohortKey = JOURNEY_COHORTS.find((key) => key === requested) ?? "all";

  const cohort = resolveCohort(population.rows, decodeURIComponent(cohortKey), journeyCohort);
  if (!cohort) notFound();

  const matched = new Set(cohort.conversationIds);
  const rows = population.rows.filter((row) => matched.has(row.conversationId));

  const [{ data: conversations }, evidence] = await Promise.all([
    createClient().then((supabase) =>
      supabase
        .from("conversations")
        .select("id, title, started_at, locations(name)")
        .eq("organization_id", organizationId)
        .in("id", cohort.conversationIds),
    ),
    // Evidence is asked for by record, not by conversation, so a reprocessed
    // conversation cannot show a quote from an analysis the number did not
    // come from.
    evidenceForField(
      organizationId,
      rows.map((row) => ({
        conversationId: row.conversationId,
        interactionRecordId: row.recordId,
      })),
      cohort.evidenceFieldKeys,
    ),
  ]);
  const detail = new Map((conversations ?? []).map((row) => [row.id, row]));

  // Back to wherever this group is shown. Journey groups carry a cohort in the
  // URL; frontline ones do not.
  const back = requested
    ? intelligenceHref("/intelligence/journey", filters, { cohort: journeyCohort })
    : intelligenceHref("/intelligence/frontline", filters);

  return (
    <>
      <IntelligenceHead title="Evidence" />
      <div className="ip-grid12">
        <section className="ip-panel ip-col-12">
          <div className="ip-section-title">
            <h2>Interactions that {cohort.headline}</h2>
            <Link className="ip-link" href={back}>
              Back
            </Link>
          </div>
          <ul className="ip-scope-chips">
            <li>{windowLabel(filters.days)}</li>
            <li>{selectedStoreName ?? `${storeCount} store${storeCount === 1 ? "" : "s"}`}</li>
            <li>{filters.category ?? "All categories"}</li>
          </ul>
          <p className="ip-drawer-value">
            <strong>{rows.length}</strong>
            {cohort.measurable && cohort.measurable > 0 ? (
              <span> of {cohort.measurable} measurable</span>
            ) : (
              <span> interactions</span>
            )}
          </p>
          <p className="ip-note">{cohort.reason}.</p>
        </section>

        {rows.map((row) => {
          const conversation = detail.get(row.conversationId);
          const store = conversation?.locations as { name: string } | null;
          const quotes = evidence.get(row.conversationId) ?? [];
          return (
            <section className="ip-panel ip-col-12" key={row.conversationId}>
              <div className="ip-section-title">
                <h2>
                  <Link className="ip-link" href={`/conversations/${row.conversationId}`}>
                    {conversation?.title ?? "Untitled interaction"}
                  </Link>
                </h2>
                <span className="ip-meta">
                  {conversation?.started_at
                    ? new Date(conversation.started_at).toLocaleDateString()
                    : "—"}
                  {store?.name ? ` · ${store.name}` : ""}
                  {row.purchaseCategory ? ` · ${row.purchaseCategory}` : ""}
                </span>
              </div>
              {quotes.length > 0 ? (
                // Two fields often cite the same sentence — a commitment signal
                // and the reason recorded beside it usually rest on one line.
                // Printing it twice looks like a bug and wastes the space a
                // second piece of evidence could have used.
                dedupeLines(quotes).map((line, index) => (
                  <p className="ip-quote" key={`${line.startMilliseconds}-${index}`}>
                    <span className="ip-meta">
                      {line.role} · {timestamp(line.startMilliseconds)}
                    </span>
                    {line.text}
                  </p>
                ))
              ) : (
                // Said plainly rather than left blank. A cohort defined by an
                // absence often has nothing to quote, and empty space would read
                // as a failed load.
                <p className="ip-note">
                  No transcript line to show — this interaction matched on something that was not
                  said.
                </p>
              )}
            </section>
          );
        })}

        {rows.length === 0 ? (
          <section className="ip-panel ip-col-12">
            <div className="ip-state" role="status">
              <strong>No observations in this scope</strong>
              <span>
                Nothing matches this group in the selected period. It may have been counted under a
                wider date range.
              </span>
            </div>
            <Link className="ip-link" href={back}>
              Back
            </Link>
          </section>
        ) : null}
      </div>
    </>
  );
}
