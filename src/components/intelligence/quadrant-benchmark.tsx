import { SectionTabs, type Tab } from "@/components/intelligence/section-tabs";
import {
  QUADRANTS,
  QUADRANT_BENCHMARK_ROWS,
  quadrantSource,
  type QuadrantSource,
} from "@/modules/intelligence/quadrant";

/**
 * Learn from Q1 — a fixed slot, and a fixed refusal.
 *
 * Q1 to Q4 is the organization's own classification of its people. The database
 * audit found no canonical source for it, so the slot renders its connection
 * state rather than disappearing or inventing one.
 *
 * Inventing one would be easy and would be the worst thing on the page. Ranking
 * representatives by any behaviour rate here and calling the top quarter Q1
 * produces something that looks exactly like a peer benchmark and is really a
 * circular argument: the metric being coached is the metric that decided who is
 * worth learning from. A manager would act on it, and nobody could tell them
 * where the grouping came from.
 */

export const QUADRANT_TABS: readonly Tab[] = [
  { key: "benchmark", label: "Store benchmark" },
  { key: "compare", label: "You vs Q1" },
  { key: "coaching", label: "Coaching" },
];

export function QuadrantBenchmark({
  tab,
  hrefFor,
  source = quadrantSource(),
}: {
  tab: string;
  hrefFor: (key: string) => string;
  source?: QuadrantSource;
}) {
  return (
    <section className="ip-panel ip-col-12" aria-labelledby="q1-title">
      <div className="ip-section-title">
        <h2 id="q1-title">Learn from Q1</h2>
        <SectionTabs
          tabs={QUADRANT_TABS}
          active={tab}
          hrefFor={hrefFor}
          label="Q1 benchmark view"
        />
      </div>

      {source.connected ? null : (
        <div className="ip-state" role="status">
          <strong>Quadrant benchmark not connected</strong>
          <span>Connect a business-owned Q1/Q2/Q3/Q4 assignment to activate this analysis.</span>
        </div>
      )}

      {/* The shape stays visible while the source is missing, so it is obvious
          what connecting one would switch on — and obvious that nothing here is
          currently being computed from conversation behaviour. */}
      <table className="ip-table ip-table--ghost">
        <caption className="ip-note">
          Rows are fixed. Each cell would be a pooled sum of affected over eligible for that
          quadrant — never an average of per-representative percentages, which weights a
          representative with four conversations the same as one with forty. Q1 is a reference
          group, not a winner.
        </caption>
        <thead>
          <tr>
            <th scope="col">Behaviour</th>
            {QUADRANTS.map((quadrant) => (
              <th key={quadrant} scope="col">
                {quadrant}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {QUADRANT_BENCHMARK_ROWS.map((row) => (
            <tr key={row.key}>
              <th scope="row">{row.label}</th>
              {QUADRANTS.map((quadrant) => (
                <td key={quadrant}>—</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="ip-note">
        Required source: organization · representative membership · quadrant · effective period ·
        store scope where applicable · source and version. Benchmark scope is then fixed to the same
        organization, same store, selected period and selected category — never a silent fallback to
        a regional or company-wide peer group.
      </p>
    </section>
  );
}
