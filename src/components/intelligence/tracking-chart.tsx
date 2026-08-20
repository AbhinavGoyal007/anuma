import Link from "next/link";

import type { TrendMetric, TrendSeries } from "@/modules/intelligence/trend";

/**
 * One tracked signal over conversation time.
 *
 * Hand-drawn SVG rather than a charting dependency, because the whole visual is
 * a polyline, some dots and a baseline — and a library would bring its own type
 * scale and palette that would then have to be argued back into ANUMA's.
 *
 * The important behaviour is what it refuses to draw. A bin that could not carry
 * the metric leaves a break in the line rather than dropping to the floor, and
 * the marker underneath says the period existed but was too thin to plot. A
 * continuous line across a quiet fortnight would be the single most misleading
 * thing this page could show.
 */

const W = 720;
const H = 178;
const PAD = { top: 16, right: 14, bottom: 26, left: 36 };

function formatValue(value: number, format: TrendMetric["format"]): string {
  return format === "percent" ? `${Math.round(value * 100)}%` : String(value);
}

export function TrackingChart({
  series,
  /** Focuses the period a point stands for, where that is a safe thing to do. */
  pointHref,
}: {
  series: TrendSeries;
  pointHref?: (point: TrendSeries["points"][number]) => string | null;
}) {
  const { points, metric } = series;
  const plotted = points.filter((point) => point.value !== null);
  const highest =
    metric.format === "percent" ? 1 : Math.max(...plotted.map((point) => point.value!), 1);

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (index: number) =>
    PAD.left + (points.length <= 1 ? innerW / 2 : (index / (points.length - 1)) * innerW);
  const y = (value: number) => PAD.top + innerH - (value / highest) * innerH;

  // Broken into runs so a gap stays a gap. One polyline through every plotted
  // point would silently bridge the periods nobody walked in.
  const runs: { index: number; value: number }[][] = [];
  let run: { index: number; value: number }[] = [];
  points.forEach((point, index) => {
    if (point.value === null) {
      if (run.length) runs.push(run);
      run = [];
      return;
    }
    run.push({ index, value: point.value });
  });
  if (run.length) runs.push(run);

  const last = plotted[plotted.length - 1];
  const summary = `${metric.label}, ${plotted.length} of ${points.length} periods plotted${
    series.movement
      ? `. Largest change ${Math.round(series.movement.points)} points between ${series.movement.fromLabel} and ${series.movement.toLabel}`
      : ""
  }.`;

  return (
    <div className="ip-chart">
      <p className="ip-chart-move">
        {series.movement ? (
          <>
            <strong>
              {series.movement.points > 0 ? "+" : ""}
              {Math.round(series.movement.points)}pp
            </strong>{" "}
            {series.movement.fromLabel} → {series.movement.toLabel}
          </>
        ) : metric.format === "percent" ? (
          "No movement large enough to call out"
        ) : (
          // Movement is only assessed for rates. Saying "no movement" about a
          // count would report a conclusion we never tested.
          "Volume over time"
        )}
      </p>
      <svg className="ip-chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}>
        {[0.25, 0.5, 0.75].map((fraction) => (
          <line
            className="ip-chart-grid"
            key={fraction}
            x1={PAD.left}
            x2={W - PAD.right}
            y1={PAD.top + innerH * fraction}
            y2={PAD.top + innerH * fraction}
          />
        ))}
        <line
          className="ip-chart-axis"
          x1={PAD.left}
          x2={W - PAD.right}
          y1={PAD.top + innerH}
          y2={PAD.top + innerH}
        />
        {runs.map((segment, index) => (
          <polyline
            key={index}
            className="ip-chart-line"
            points={segment.map((point) => `${x(point.index)},${y(point.value)}`).join(" ")}
          />
        ))}
        {points.map((point, index) =>
          point.value === null ? (
            // The period happened; it just could not carry the metric. Marked on
            // the baseline so the reader sees the hole rather than inferring a
            // smooth run of data.
            point.eligible > 0 ? (
              <circle
                key={point.from}
                className="ip-chart-thin"
                cx={x(index)}
                cy={PAD.top + innerH}
                r={2.4}
              />
            ) : null
          ) : (
            // A plotted point is a real period with a real denominator, so it
            // can be described and — where the page can honestly narrow to it —
            // opened. A thin point is never clickable: there is nothing behind
            // it that would survive being looked at.
            (() => {
              const description = `${point.label} · ${formatValue(point.value, metric.format)} · ${point.matched} of ${point.eligible}`;
              const href = pointHref?.(point) ?? null;
              const dot = (
                <circle
                  className={`ip-chart-dot${point === last ? " ip-chart-dot--last" : ""}`}
                  cx={x(index)}
                  cy={y(point.value)}
                  r={point === last ? 4.5 : 3}
                >
                  <title>{description}</title>
                </circle>
              );
              return href ? (
                <Link
                  key={point.from}
                  className="ip-chart-point"
                  href={href}
                  aria-label={description}
                >
                  {dot}
                </Link>
              ) : (
                <g key={point.from} tabIndex={0} role="img" aria-label={description}>
                  {dot}
                </g>
              );
            })()
          ),
        )}
        {last ? (
          <text className="ip-chart-end" x={x(points.indexOf(last)) - 8} y={y(last.value!) - 10}>
            {formatValue(last.value!, metric.format)}
          </text>
        ) : null}
        {points.map((point, index) =>
          index === 0 || index === points.length - 1 ? (
            <text
              key={`t-${point.from}`}
              className="ip-chart-tick"
              x={x(index)}
              y={H - 8}
              textAnchor={index === 0 ? "start" : "end"}
            >
              {point.label}
            </text>
          ) : null,
        )}
      </svg>
      <p className="ip-note">
        {plotted.length} of {points.length} periods had enough interactions to plot
        {points.some((point) => point.value === null && point.eligible > 0)
          ? "; baseline marks are periods that were too thin"
          : ""}
        .
      </p>
    </div>
  );
}
