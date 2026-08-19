import "server-only";

import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { resolveCohort } from "@/modules/intelligence/cohorts";
import { evidenceForField, timestamp, type EvidenceLine } from "@/modules/intelligence/evidence";
import type { JourneyCohortKey } from "@/modules/intelligence/journey";
import type { PopulationRow } from "@/modules/intelligence/population";

/**
 * The panel between a number and the words behind it.
 *
 * The cohort is recomputed here from the same population and the same pure
 * function the page counted with, rather than being handed a list of ids. That
 * is what makes this provably the set the number came from: a second query
 * written to resemble the first drifts the moment either definition changes, and
 * nothing would tell anyone it had.
 *
 * Rendered from the URL rather than from client state, so an open drawer is an
 * address a manager can send to someone, and the whole thing works before any
 * JavaScript arrives. Evidence is read against the exact interaction record the
 * population selected as current — reading by conversation alone let a
 * reprocessed conversation show a number from the latest analysis beside a
 * quote from an older one, and the quote is the more convincing of the pair.
 */

/** The distinct transcript lines behind an interaction, earliest first. */
function dedupeLines(quotes: readonly { lines: EvidenceLine[] }[], limit = 2): EvidenceLine[] {
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

/** How many interactions the drawer lists before pointing at the full page. */
const DRAWER_ROWS = 8;

export async function IntelligenceDrawer({
  organizationId,
  rows,
  cohortKey,
  journeyCohort,
  scopeChips,
  closeHref,
  fullHref,
}: {
  organizationId: string;
  rows: readonly PopulationRow[];
  cohortKey: string;
  journeyCohort: JourneyCohortKey;
  /** The selection this cohort was counted under, shown so scope is never implicit. */
  scopeChips: string[];
  closeHref: string;
  /** The full, unpaginated list of the same interactions. */
  fullHref: string;
}) {
  const cohort = resolveCohort(rows, cohortKey, journeyCohort);

  if (!cohort) {
    return (
      <aside className="ip-drawer-bg">
        <div className="ip-drawer" role="dialog" aria-label="Evidence">
          <Link className="ip-close" href={closeHref} aria-label="Close evidence">
            ×
          </Link>
          <p className="ip-eyebrow">Evidence</p>
          <h2>Nothing to show</h2>
          <p className="ip-note">
            This group is not defined for the current selection. It may exist under a wider period.
          </p>
        </div>
      </aside>
    );
  }

  const matched = new Set(cohort.conversationIds);
  const matchedRows = rows.filter((row) => matched.has(row.conversationId));
  const shown = matchedRows.slice(0, DRAWER_ROWS);

  const [{ data: conversations }, evidence] = await Promise.all([
    createClient().then((supabase) =>
      supabase
        .from("conversations")
        .select("id, title, started_at, locations(name)")
        .eq("organization_id", organizationId)
        .in(
          "id",
          shown.map((row) => row.conversationId),
        ),
    ),
    evidenceForField(
      organizationId,
      shown.map((row) => ({
        conversationId: row.conversationId,
        interactionRecordId: row.recordId,
      })),
      cohort.evidenceFieldKeys,
    ),
  ]);
  const detail = new Map((conversations ?? []).map((row) => [row.id, row]));

  const affected = cohort.conversationIds.length;
  const eligible = cohort.measurable;
  const coverage = eligible && eligible > 0 ? affected / eligible : null;

  return (
    <aside className="ip-drawer-bg">
      <div className="ip-drawer" role="dialog" aria-label="Evidence">
        <Link className="ip-close" href={closeHref} aria-label="Close evidence">
          ×
        </Link>
        <p className="ip-eyebrow">Cohort</p>
        <h2>Interactions that {cohort.headline}</h2>
        <ul className="ip-scope-chips">
          {scopeChips.map((chip) => (
            <li key={chip}>{chip}</li>
          ))}
        </ul>

        <p className="ip-drawer-section">Value</p>
        <p className="ip-drawer-value">
          <strong>{affected}</strong>
          {eligible && eligible > 0 ? (
            <span>
              {" "}
              of {eligible} measurable · {Math.round((coverage ?? 0) * 100)}%
            </span>
          ) : (
            <span> interactions</span>
          )}
        </p>
        <p className="ip-note">{cohort.reason}.</p>

        <p className="ip-drawer-section">
          Interactions{matchedRows.length > shown.length ? ` · showing ${shown.length}` : ""}
        </p>
        {shown.length === 0 ? (
          <p className="ip-note">No interaction matches this group in the current selection.</p>
        ) : null}
        {shown.map((row) => {
          const conversation = detail.get(row.conversationId);
          const store = conversation?.locations as { name: string } | null;
          const lines = dedupeLines(evidence.get(row.conversationId) ?? []);
          return (
            <div key={row.conversationId} className="ip-evrow">
              <Link className="ip-ev-title" href={`/conversations/${row.conversationId}`}>
                {conversation?.title ?? "Untitled interaction"}
              </Link>
              <p className="ip-meta">
                {conversation?.started_at
                  ? new Date(conversation.started_at).toLocaleDateString()
                  : "—"}
                {store?.name ? ` · ${store.name}` : ""}
                {row.purchaseCategory ? ` · ${row.purchaseCategory}` : ""}
              </p>
              {lines.length > 0 ? (
                lines.map((line, index) => (
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
                  No transcript line — this interaction matched on something that was not said.
                </p>
              )}
              <Link className="ip-link" href={`/conversations/${row.conversationId}`}>
                Open full conversation →
              </Link>
            </div>
          );
        })}

        {matchedRows.length > shown.length ? (
          <p className="ip-drawer-foot">
            <Link className="ip-link" href={fullHref}>
              Review all {matchedRows.length} interactions →
            </Link>
          </p>
        ) : null}
      </div>
    </aside>
  );
}
