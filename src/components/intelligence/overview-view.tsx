import Link from "next/link";

import { CoverageRail } from "@/components/intelligence/coverage-rail";
import { DataState, stateFor, type SlotState } from "@/components/intelligence/data-state";
import { LocalSwitch } from "@/components/intelligence/local-switch";
import {
  Delta,
  formatMoney,
  formatPercent,
  MetricTile,
  tipText,
} from "@/components/intelligence/metric-tile";
import { SectionTabs } from "@/components/intelligence/section-tabs";
import { TrackingChart } from "@/components/intelligence/tracking-chart";
import type { IntelligenceCoverage } from "@/modules/intelligence/coverage";
import { actionLabel, type ActionCohort } from "@/modules/intelligence/frontline";
import { DEFAULT_GUARDRAILS, type Measure } from "@/modules/intelligence/guardrails";
import type {
  BreakdownDimension,
  BreakdownRow,
  OverviewSignal,
  PulseItem,
} from "@/modules/intelligence/overview";
import type { TrendMetric, TrendSeries } from "@/modules/intelligence/trend";

/**
 * Overview — how much can ANUMA see, and what deserves attention.
 *
 * The sections are in a fixed order and so is everything inside them. The data
 * changes the answer; it does not change where the answer is. A manager who
 * opens this at eight every morning should be able to look at the same four
 * places without reading the page first.
 */

export const BREAKDOWN_TABS = [
  { key: "stores", label: "Stores" },
  { key: "categories", label: "Categories" },
] as const;

function Action({ cohort, href }: { cohort: ActionCohort | null; href: string | null }) {
  if (!cohort || !href) {
    return (
      <div className="ip-action ip-action--empty">
        <span className="ip-meta">No additional priority action in this scope</span>
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
    </Link>
  );
}

function pulseDisplay(item: PulseItem): string {
  // Two currencies do not average into one median. Saying so is the answer.
  if (item.format === "mixed_currency") return "Multiple currencies";
  if (item.format === "money") return formatMoney(item.amount, item.currency);
  return formatPercent(item.measure?.value ?? null);
}

/**
 * One breakdown cell.
 *
 * Below the comparison bar a percentage is 0 or 100 and reads as a difference
 * between stores that it cannot support, so the raw counts are shown instead.
 */
function Cell({ measure: m, href }: { measure: Measure; href: string | null }) {
  if (m.value === null || m.observed === 0) {
    return (
      <td className="ip-cell-thin" title="Not measurable in this group">
        —
      </td>
    );
  }
  if (m.observed < DEFAULT_GUARDRAILS.minimumForComparison) {
    return (
      <td className="ip-cell-thin" title={`Only ${m.observed} measurable — too few to compare`}>
        {m.affected ?? 0}/{m.observed}
      </td>
    );
  }
  const body = (
    <>
      {formatPercent(m.value)}
      <span className="ip-cell-n"> {m.observed}</span>
    </>
  );
  return (
    <td>
      {href ? (
        <Link
          className="ip-cell-link ip-tip"
          href={href}
          data-tip={`${m.affected ?? 0} of ${m.observed} measurable · ${formatPercent(m.value)}`}
        >
          {body}
        </Link>
      ) : (
        body
      )}
    </td>
  );
}

const BREAKDOWN_COLUMNS = [
  { key: "highIntent", label: "High-intent arrivals", cohort: "arrived_decided" },
  { key: "clarityImproved", label: "Clarity improved", cohort: "clarity_improved" },
  { key: "preferenceFormed", label: "Preference formed", cohort: "preference_formed" },
  {
    key: "closeAfterCommitment",
    label: "Close after commitment",
    cohort: "close_after_commitment",
  },
] as const;

export function OverviewView({
  coverage,
  coverageHref,
  analyticalFiltersActive,
  signals,
  actions,
  actionHref,
  numeratorHref,
  pulse,
  trend,
  trendMetrics,
  trendMetricKey,
  trendHref,
  breakdowns,
  breakdownDimension,
  breakdownHref,
  breakdownRowHref,
  breakdownCellHref,
  usable,
}: {
  coverage: IntelligenceCoverage;
  coverageHref: string;
  analyticalFiltersActive: boolean;
  signals: OverviewSignal[];
  actions: (ActionCohort | null)[];
  actionHref: (cohortKey: string) => string;
  numeratorHref: (measureKey: string) => string;
  pulse: PulseItem[];
  /** Null where the selected series cannot be trended. The slot stays. */
  trend: TrendSeries | null;
  trendMetrics: readonly TrendMetric[];
  trendMetricKey: string;
  trendHref: (key: string) => string;
  /** Both dimensions, computed from the same loaded rows. */
  breakdowns: Record<BreakdownDimension, BreakdownRow[]>;
  breakdownDimension: BreakdownDimension;
  breakdownHref: (dimension: BreakdownDimension) => string;
  breakdownRowHref: (dimension: BreakdownDimension, key: string) => string;
  breakdownCellHref: (dimension: BreakdownDimension, key: string, measureKey: string) => string;
  usable: number;
}) {
  return (
    <div className="ip-grid12">
      <CoverageRail
        coverage={coverage}
        drawerHref={coverageHref}
        analyticalFiltersActive={analyticalFiltersActive}
      />

      <section className="ip-panel ip-col-8" aria-labelledby="ov-signals">
        <div className="ip-section-title">
          <h2 id="ov-signals">Core signals</h2>
          <span className="ip-meta">{usable} usable</span>
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
                // The click opens the tile's own numerator, never the inverse
                // gap: a descriptive metric that offered the failures beside it
                // showed one number and handed over a different set.
                href={numeratorHref(signal.cohortKey)}
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
          <h2 id="ov-actions">Priority actions</h2>
        </div>
        {actions.map((cohort, index) => (
          <Action
            key={cohort?.key ?? `empty-${index}`}
            cohort={cohort}
            href={cohort ? actionHref(cohort.key) : null}
          />
        ))}
      </section>

      <section className="ip-panel ip-pulse ip-col-12" aria-label="Business pulse">
        {pulse.map((item) => {
          const state = item.format === "mixed_currency" ? "POPULATED" : stateFor(item.measure);
          const tip = tipText({
            label: item.label,
            value: pulseDisplay(item),
            measure: item.measure,
            previous: item.previous,
          });
          const body = (
            <>
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
            </>
          );
          return item.cohortKey && state === "POPULATED" ? (
            <Link
              className="ip-pitem ip-pitem--action ip-tip"
              key={item.key}
              href={numeratorHref(item.cohortKey)}
              data-tip={tip}
            >
              {body}
            </Link>
          ) : (
            <div className="ip-pitem ip-tip" key={item.key} tabIndex={0} data-tip={tip}>
              {body}
            </div>
          );
        })}
      </section>

      <section className="ip-panel ip-col-7" aria-labelledby="ov-trend">
        <div className="ip-section-title">
          <h2 id="ov-trend">Trend</h2>
          {/* All six tabs, every day. The chart never picks its own subject:
              a page that promotes whichever metric moved most is a page that
              answers a different question each morning. */}
          <SectionTabs
            tabs={trendMetrics.map((option) => ({ key: option.key, label: option.label }))}
            active={trendMetricKey}
            hrefFor={trendHref}
            label="Tracked signal"
          />
        </div>
        {trend ? (
          <TrackingChart series={trend} pointHref={() => null} />
        ) : (
          <div className="ip-state" role="status">
            <strong>Not enough data to trend this metric</strong>
            <span>
              The selected metric needs more interactions per period before a line would mean
              anything. Nothing else has been selected in its place.
            </span>
          </div>
        )}
      </section>

      <section className="ip-panel ip-col-5" aria-labelledby="ov-breakdown">
        <LocalSwitch param="dimension" initial={breakdownDimension}>
          <div className="ip-section-title">
            <h2 id="ov-breakdown">Breakdown</h2>
            <SectionTabs
              tabs={BREAKDOWN_TABS}
              active={breakdownDimension}
              hrefFor={(key) => breakdownHref(key as BreakdownDimension)}
              label="Breakdown dimension"
            />
          </div>
          {/* Both tables are rendered. LocalSwitch only changes which is
              visible — a tab that updated the URL and left the same table on
              screen was a control that did nothing. */}
          {BREAKDOWN_TABS.map((tab) => {
            const rows = breakdowns[tab.key];
            const state: SlotState =
              usable === 0 ? "NO_OBSERVATIONS" : rows.length === 0 ? "NOT_SUPPORTED" : "POPULATED";
            return (
              <div data-local-panel={tab.key} hidden={tab.key !== breakdownDimension} key={tab.key}>
                {state === "POPULATED" ? (
                  <div className="ip-table-scroll">
                    <table className="ip-table">
                      <thead>
                        <tr>
                          <th scope="col">Scope</th>
                          <th scope="col">n</th>
                          {BREAKDOWN_COLUMNS.map((column) => (
                            <th key={column.key} scope="col">
                              {column.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.key}>
                            <th scope="row">
                              <Link className="ip-link" href={breakdownRowHref(tab.key, row.key)}>
                                {row.label}
                              </Link>
                            </th>
                            <td>{row.size}</td>
                            {BREAKDOWN_COLUMNS.map((column) => (
                              <Cell
                                key={column.key}
                                measure={row[column.key]}
                                href={breakdownCellHref(tab.key, row.key, column.cohort)}
                              />
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <DataState state={state} />
                )}
              </div>
            );
          })}
        </LocalSwitch>
      </section>
    </div>
  );
}
