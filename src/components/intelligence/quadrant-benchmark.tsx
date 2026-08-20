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
 *
 * While no source is connected there are no tabs. Three controls that all lead
 * to the same "not connected" panel are three chances to believe something is
 * behind one of them.
 */

export function QuadrantBenchmark({ source = quadrantSource() }: { source?: QuadrantSource }) {
  if (source.connected) {
    // The v7 design activates here once a business-owned assignment exists.
    // Until then this branch is unreachable by construction, and deliberately
    // so — there is nothing to render that would not be invented.
    return null;
  }

  return (
    <section className="ip-panel ip-col-12" aria-labelledby="q1-title">
      <div className="ip-section-title">
        <h2 id="q1-title">Learn from Q1</h2>
      </div>

      <div className="ip-state" role="status">
        <strong>Quadrant benchmark not connected</strong>
        <span>A business-owned Q1/Q2/Q3/Q4 assignment is required for this analysis.</span>
        <span className="ip-meta">
          Required: employee · store · quadrant · effective period · source and version
        </span>
      </div>

      <p className="ip-note">
        Once connected, the benchmark compares{" "}
        {QUADRANT_BENCHMARK_ROWS.map((behaviour) => behaviour.label.toLowerCase()).join(", ")}{" "}
        across {QUADRANTS.join(" · ")} within the same store, period and category — pooling affected
        over eligible per quadrant, never averaging per-representative percentages. Quadrants are
        never derived from ANUMA conversation metrics.
      </p>
    </section>
  );
}
