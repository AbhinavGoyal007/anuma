import type { StoreComparison } from "@/modules/interaction-metrics/stores";
import type { MetricSummary } from "@/modules/interaction-metrics/summarize";

/**
 * Store against store, with the organisation's own figure as the reference row.
 *
 * A chain acts on the outlier, not the average, so the point of this table is to
 * make one floor's number look wrong next to its siblings. Stores with too few
 * interactions to support a rate are shown — hiding a store is worse — but
 * marked as a thin sample so nobody reads noise as a finding.
 */

function pct(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

const COLUMNS: { key: keyof MetricSummary; label: string; render: (s: MetricSummary) => string }[] =
  [
    { key: "interactions", label: "Interactions", render: (s) => String(s.interactions) },
    { key: "purchaseRate", label: "Purchased", render: (s) => pct(s.purchaseRate) },
    { key: "clarityLiftRate", label: "Clarified need", render: (s) => pct(s.clarityLiftRate) },
    {
      key: "objectionCoverage",
      label: "Obj. coverage",
      render: (s) => pct(s.objectionCoverage),
    },
    { key: "crossSellRate", label: "Cross-sell", render: (s) => pct(s.crossSellRate) },
    { key: "redFlagRate", label: "Flagged", render: (s) => pct(s.redFlagRate) },
  ];

export function StoreComparisonTable({
  comparison,
  storeNames,
}: {
  comparison: StoreComparison;
  storeNames: Map<string, string>;
}) {
  if (comparison.stores.length === 0) return null;

  return (
    <section className="demand-block" aria-labelledby="store-comparison-title">
      <div className="demand-block-head">
        <p className="eyebrow">Comparison</p>
        <h2 id="store-comparison-title">Store against store</h2>
      </div>

      <div className="store-table-wrap">
        <table className="store-table">
          <thead>
            <tr>
              <th scope="col">Store</th>
              {COLUMNS.map((column) => (
                <th key={column.key} scope="col">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comparison.stores.map((store) => {
              const thin = store.summary.interactions < comparison.minRankable;
              const name =
                store.locationId === null
                  ? "No store assigned"
                  : (storeNames.get(store.locationId) ?? "Scoped store");
              return (
                <tr
                  key={store.locationId ?? "unassigned"}
                  className={thin ? "store-row--thin" : ""}
                >
                  <th scope="row">
                    {name}
                    {thin ? <span className="store-thin-tag">thin sample</span> : null}
                  </th>
                  {COLUMNS.map((column) => (
                    <td key={column.key}>{column.render(store.summary)}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">All stores</th>
              {COLUMNS.map((column) => (
                <td key={column.key}>{column.render(comparison.organization)}</td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="store-table-note">
        The all-stores row is computed from every interaction, not averaged across the rows above,
        so a small store cannot swing it.
      </p>
    </section>
  );
}
