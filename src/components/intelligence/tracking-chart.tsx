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
 * the marker underneath says the week existed but was too thin to plot. A
 * continuous line across a quiet fortnight would be the single most misleading
 * thing this page could show.
 */

const W = 720;
const H = 168;
const PAD = { top: 14, right: 12, bottom: 26, left: 34 };

function formatValue(value: number, format: TrendMetric["format"]): string {
  return format === "percent" ? `${Math.round(value * 100)}%` : String(value);
}

export function TrackingChart({
  series,
  available,
  metricHref,
}: {
  series: TrendSeries;
  available: readonly TrendMetric[];
  /** Builds the link that switches the plotted signal, preserving filters. */
  metricHref: (key: string) => string;
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
  // point would silently bridge the weeks nobody walked in.
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
    <div className="tc">
      <div className="tc-head">
        <div>
          <p className="tc-metric">{metric.label}</p>
          {series.movement ? (
            <p className="tc-move">
              {series.movement.points > 0 ? "+" : ""}
              {Math.round(series.movement.points)}pp between {series.movement.fromLabel} and{" "}
              {series.movement.toLabel}
            </p>
          ) : metric.format === "percent" ? (
            <p className="tc-move tc-move--flat">No movement large enough to call out</p>
          ) : (
            // Movement is only assessed for rates. Saying "no movement" about a
            // count would report a conclusion we never tested.
            <p className="tc-move tc-move--flat">Volume over time</p>
          )}
        </div>
        {available.length > 1 ? (
          <div className="tc-picker" role="group" aria-label="Tracked signal">
            {available.map((option) => (
              <Link
                key={option.key}
                className={`ifb-chip${option.key === metric.key ? " ifb-chip--active" : ""}`}
                href={metricHref(option.key)}
                aria-current={option.key === metric.key ? "true" : undefined}
              >
                {option.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      <svg className="tc-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}>
        <line
          className="tc-axis"
          x1={PAD.left}
          x2={W - PAD.right}
          y1={PAD.top + innerH}
          y2={PAD.top + innerH}
        />
        {runs.map((segment, index) => (
          <polyline
            key={index}
            className="tc-line"
            points={segment.map((point) => `${x(point.index)},${y(point.value)}`).join(" ")}
          />
        ))}
        {points.map((point, index) =>
          point.value === null ? (
            // The week happened; it just could not carry the metric. Marked on
            // the baseline so the reader sees the hole rather than inferring a
            // smooth run of data.
            point.eligible > 0 ? (
              <circle
                key={point.from}
                className="tc-thin"
                cx={x(index)}
                cy={PAD.top + innerH}
                r={2}
              />
            ) : null
          ) : (
            <circle
              key={point.from}
              className={`tc-dot${point === last ? " tc-dot--last" : ""}`}
              cx={x(index)}
              cy={y(point.value)}
              r={point === last ? 4 : 2.6}
            />
          ),
        )}
        {last ? (
          <text className="tc-endlabel" x={x(points.indexOf(last)) - 8} y={y(last.value!) - 10}>
            {formatValue(last.value!, metric.format)}
          </text>
        ) : null}
        {points.map((point, index) =>
          index === 0 || index === points.length - 1 ? (
            <text
              key={`t-${point.from}`}
              className="tc-tick"
              x={x(index)}
              y={H - 8}
              textAnchor={index === 0 ? "start" : "end"}
            >
              {point.label}
            </text>
          ) : null,
        )}
      </svg>

      <p className="fl-sample">
        {plotted.length} of {points.length} periods had enough interactions to plot
        {points.some((point) => point.value === null && point.eligible > 0)
          ? "; the marks on the baseline are periods that were too thin"
          : ""}
        .
      </p>
    </div>
  );
}
