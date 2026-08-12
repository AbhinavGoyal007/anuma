import Link from "next/link";

import type { DemandTrend } from "@/modules/interaction-metrics/trends";
import type { TrendMetric } from "@/modules/interaction-metrics/trend-math";

/**
 * A period against the one before it.
 *
 * The current figures always show; the movement only shows when the earlier
 * period is thick enough to compare against. A delta drawn from three
 * interactions would read as insight and be noise, so it is withheld and the
 * reason is stated.
 *
 * A change in a percentage is reported in points, not percent — "up 12 points"
 * is a different claim from "up 12 percent", and conflating them is how a
 * dashboard starts lying quietly.
 */

export type PeriodLink = { days: number; href: string; active: boolean };

function formatValue(metric: TrendMetric, currency: string | null): string {
  if (metric.current === null) return "—";
  if (metric.format === "percent") return `${Math.round(metric.current * 100)}%`;
  if (metric.format === "money") {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency ?? "INR",
      maximumFractionDigits: 0,
      notation: "compact",
    }).format(metric.current / 100);
  }
  return String(metric.current);
}

function formatDelta(metric: TrendMetric, currency: string | null): string | null {
  if (metric.delta === null || metric.direction === "flat") return null;
  const sign = metric.delta > 0 ? "+" : "−";
  const size = Math.abs(metric.delta);
  if (metric.format === "percent") return `${sign}${Math.round(size * 100)} pts`;
  if (metric.format === "money") {
    const amount = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency ?? "INR",
      maximumFractionDigits: 0,
      notation: "compact",
    }).format(size / 100);
    return `${sign}${amount}`;
  }
  return `${sign}${size}`;
}

/** Whether this movement is good news, for colour only. */
function tone(metric: TrendMetric): "good" | "bad" | "flat" {
  if (metric.direction === "flat" || metric.delta === null) return "flat";
  const improving = metric.direction === "up" ? metric.higherIsBetter : !metric.higherIsBetter;
  return improving ? "good" : "bad";
}

export function TrendPanel({
  trend,
  periods,
}: {
  trend: DemandTrend;
  periods: PeriodLink[];
}) {
  return (
    <section className="demand-block" aria-labelledby="trend-title">
      <div className="demand-block-head demand-block-head--row">
        <div>
          <p className="eyebrow">Movement</p>
          <h2 id="trend-title">
            Last {trend.periodDays} days vs the {trend.periodDays} before
          </h2>
        </div>
        <nav className="period-filter" aria-label="Comparison period">
          {periods.map((period) => (
            <Link
              key={period.days}
              href={period.href}
              className={`store-chip${period.active ? " store-chip--active" : ""}`}
            >
              {period.days}d
            </Link>
          ))}
        </nav>
      </div>

      {!trend.comparable ? (
        <p className="trend-note" role="status">
          Not enough history to compare yet — the earlier {trend.periodDays} days hold{" "}
          <strong>{trend.previousInteractions}</strong> interaction
          {trend.previousInteractions === 1 ? "" : "s"} and at least{" "}
          <strong>{trend.minComparable}</strong> are needed before a change means anything. The
          current figures below are live; movement appears as history accumulates.
        </p>
      ) : null}

      <dl className="trend-grid">
        {trend.metrics.map((metric) => {
          const delta = trend.comparable ? formatDelta(metric, trend.currency) : null;
          return (
            <div key={metric.key} className="trend-cell">
              <dt>{metric.label}</dt>
              <dd>
                <span className="trend-value">{formatValue(metric, trend.currency)}</span>
                {delta ? (
                  <span className={`trend-delta trend-delta--${tone(metric)}`}>
                    {metric.direction === "up" ? "▲" : "▼"} {delta}
                  </span>
                ) : null}
              </dd>
            </div>
          );
        })}
      </dl>

      {trend.comparable && (trend.risingFriction.length > 0 || trend.easingFriction.length > 0) ? (
        <div className="trend-movers">
          {trend.risingFriction.length > 0 ? (
            <div>
              <p className="eyebrow">Friction rising</p>
              <ul>
                {trend.risingFriction.slice(0, 4).map((mover) => (
                  <li key={mover.key}>
                    <span className="trend-mover-delta trend-delta--bad">+{mover.delta}</span>{" "}
                    {mover.key}
                    <span className="trend-mover-detail">
                      {" "}
                      ({mover.previous} → {mover.current} interactions)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {trend.easingFriction.length > 0 ? (
            <div>
              <p className="eyebrow">Friction easing</p>
              <ul>
                {trend.easingFriction.slice(0, 4).map((mover) => (
                  <li key={mover.key}>
                    <span className="trend-mover-delta trend-delta--good">
                      −{Math.abs(mover.delta)}
                    </span>{" "}
                    {mover.key}
                    <span className="trend-mover-detail">
                      {" "}
                      ({mover.previous} → {mover.current} interactions)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
