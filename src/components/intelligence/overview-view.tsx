import Link from "next/link";

import { DataState, stateFor, type SlotState } from "@/components/intelligence/data-state";
import {
  Delta,
  formatMoney,
  formatPercent,
  MetricTile,
  tipText,
} from "@/components/intelligence/metric-tile";
import { SectionTabs } from "@/components/intelligence/section-tabs";
import { TrackingChart } from "@/components/intelligence/tracking-chart";
import { actionLabel, type ActionCohort } from "@/modules/intelligence/frontline";
import { DEFAULT_GUARDRAILS, type Measure } from "@/modules/intelligence/guardrails";
import type { HotspotRow, OverviewSignal, PulseItem } from "@/modules/intelligence/overview";
import type { TrendMetric, TrendSeries } from "@/modules/intelligence/trend";

/**
 * Overview — four signals, three actions, six figures, a line and a table.
 *
 * The slots are fixed. A signal with nothing behind it shows that inside its own
 * tile rather than vanishing, because a page whose shape changes with the data
 * teaches a reader to distrust what is missing — and what is missing is often
 * the finding.
 *
 * No prose. Everything a manager needs to judge a number travels with it: the
 * denominator on the tile, the rest in the tooltip.
 */

function Action({ cohort, href }: { cohort: ActionCohort | null; href: string | null }) {
  if (!cohort || !href) {
    return (
      <div className="ip-action ip-action--empty">
        <DataState state="NO_OBSERVATIONS" compact />
      </div>
    );
  }
  const affected = cohort.conversationIds.length;
  return (
    <Link
      className="ip-action ip-tip"
      href={href}
      data-tip={`${actionLabel(cohort.key)} · ${affected}${cohort.measurable ? ` of ${cohort.measurable} measurable` : ""} · ${cohort.reason}`}
    >
      <span className="ip-action-n">{affected}</span>
      <span className="ip-action-label">
        {actionLabel(cohort.key)}
        {cohort.measurable && cohort.measurable > 0 ? (
          <em className="ip-meta"> of {cohort.measurable}</em>
        ) : null}
      </span>
      <span className="ip-arrow" aria-hidden="true">
        →
      </span>
      <span className="ip-visually-hidden">Review</span>
    </Link>
  );
}

function pulseDisplay(item: PulseItem): string {
  if (item.format === "count") return String(item.amount ?? 0);
  if (item.format === "money") return formatMoney(item.amount, item.currency);
  return formatPercent(item.measure?.value ?? null);
}

function HotspotCell({ measure: m }: { measure: Measure }) {
  if (m.value === null || m.observed === 0) {
    return (
      <td className="ip-cell-thin" title="Not measurable in this group">
        —
      </td>
    );
  }
  // Below the comparison bar a percentage is 0 or 100 and reads as a difference
  // between stores that it cannot support, so the raw count is shown instead.
  if (m.observed < DEFAULT_GUARDRAILS.minimumForComparison) {
    return (
      <td className="ip-cell-thin" title={`Only ${m.observed} measurable — too few to compare`}>
        {m.affected ?? 0}/{m.observed}
      </td>
    );
  }
  return (
    <td>
      {formatPercent(m.value)}
      <span className="ip-cell-n"> {m.observed}</span>
    </td>
  );
}

export function OverviewView({
  signals,
  actions,
  actionHref,
  pulse,
  trend,
  trendMetrics,
  trendHref,
  hotspots,
  hotspotLabel,
  hotspotHref,
  analysed,
}: {
  signals: OverviewSignal[];
  actions: ActionCohort[];
  actionHref: (cohortKey: string) => string;
  pulse: PulseItem[];
  trend: TrendSeries | null;
  trendMetrics: TrendMetric[];
  trendHref: (key: string) => string;
  hotspots: HotspotRow[];
  hotspotLabel: string;
  hotspotHref: (key: string) => string | null;
  analysed: number;
}) {
  const trendState: SlotState = trend === null ? "NOT_SUPPORTED" : "POPULATED";
  const hotspotState: SlotState =
    analysed === 0 ? "NO_OBSERVATIONS" : hotspots.length === 0 ? "NOT_SUPPORTED" : "POPULATED";

  return (
    <div className="ip-grid12">
      <section className="ip-panel ip-col-8" aria-labelledby="ov-signals">
        <div className="ip-section-title">
          <h2 id="ov-signals">Signals</h2>
          <span className="ip-meta">{analysed} analysed</span>
        </div>
        <div className="ip-signal-grid">
          {signals.map((signal) => {
            const state = stateFor(signal.measure);
            return state === "POPULATED" ? (
              <MetricTile
                key={signal.key}
                label={signal.label}
                value={formatPercent(signal.measure.value)}
                measure={signal.measure}
                previous={signal.previous}
                attention={signal.attention}
                href={signal.cohortKey ? actionHref(signal.cohortKey) : undefined}
              />
            ) : (
              <div className="ip-signal" key={signal.key}>
                <span className="ip-label">{signal.label}</span>
                <DataState state={state} compact />
              </div>
            );
          })}
        </div>
      </section>

      <section className="ip-panel ip-col-4" aria-labelledby="ov-actions">
        <div className="ip-section-title">
          <h2 id="ov-actions">Actions</h2>
          <span className="ip-meta">Top 3</span>
        </div>
        {[0, 1, 2].map((index) => (
          <Action
            key={index}
            cohort={actions[index] ?? null}
            href={actions[index] ? actionHref(actions[index]!.key) : null}
          />
        ))}
      </section>

      <section className="ip-panel ip-pulse ip-col-12" aria-label="Pulse">
        {pulse.map((item) => {
          const state = item.format === "count" ? "POPULATED" : stateFor(item.measure);
          return (
            <div
              className="ip-pitem ip-tip"
              key={item.key}
              tabIndex={0}
              data-tip={tipText({
                label: item.label,
                value: pulseDisplay(item),
                measure: item.measure,
                previous: item.previous,
              })}
            >
              <span className="ip-label">{item.label}</span>
              {state === "POPULATED" ? (
                <>
                  <strong>{pulseDisplay(item)}</strong>
                  {item.measure ? (
                    <>
                      <Delta measure={item.measure} previous={item.previous} />
                      <span className="ip-meta">
                        {item.measure.affected ?? 0} of {item.measure.observed}
                      </span>
                    </>
                  ) : null}
                </>
              ) : (
                <DataState state={state} compact />
              )}
            </div>
          );
        })}
      </section>

      <section className="ip-panel ip-col-7" aria-labelledby="ov-trend">
        <div className="ip-section-title">
          <h2 id="ov-trend">Trend</h2>
          {trendMetrics.length > 1 && trend ? (
            <SectionTabs
              tabs={trendMetrics.map((option) => ({ key: option.key, label: option.label }))}
              active={trend.metric.key}
              hrefFor={trendHref}
              label="Tracked signal"
            />
          ) : null}
        </div>
        {trendState === "POPULATED" && trend ? (
          <TrackingChart series={trend} />
        ) : (
          <DataState state={trendState} />
        )}
      </section>

      <section className="ip-panel ip-col-5" aria-labelledby="ov-hotspots">
        <div className="ip-section-title">
          <h2 id="ov-hotspots">Hotspots</h2>
          <span className="ip-meta">By {hotspotLabel.toLowerCase()}</span>
        </div>
        {hotspotState === "POPULATED" ? (
          <div className="ip-table-scroll">
            <table className="ip-table">
              <thead>
                <tr>
                  <th scope="col">Scope</th>
                  <th scope="col">n</th>
                  <th scope="col">Finance demand</th>
                  <th scope="col">Clarity improved</th>
                  <th scope="col">Close after commitment</th>
                </tr>
              </thead>
              <tbody>
                {hotspots.map((row) => {
                  const href = hotspotHref(row.key);
                  return (
                    <tr key={row.key}>
                      <th scope="row">
                        {href ? (
                          <Link className="ip-link" href={href}>
                            {row.label}
                          </Link>
                        ) : (
                          row.label
                        )}
                      </th>
                      <td>{row.size}</td>
                      <HotspotCell measure={row.financeDemand} />
                      <HotspotCell measure={row.clarityImproved} />
                      <HotspotCell measure={row.closeAfterCommitment} />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <DataState state={hotspotState} />
        )}
      </section>
    </div>
  );
}
