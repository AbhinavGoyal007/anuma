import { TelemetryLink } from "@/components/intelligence/telemetry";

/**
 * A composition as a single 100% bar.
 *
 * The one case a stacked bar reads better than separate bars: the states are
 * mutually exclusive and there are few of them. Every segment carries a text
 * label in the key below, so colour is never the only thing distinguishing a
 * sale from an outcome nobody established.
 */

export type Segment = {
  key: string;
  label: string;
  count: number;
  /** Fixed semantic tone, never a per-category colour. */
  tone: "indigo" | "teal" | "coral" | "amber" | "slate";
  /**
   * Set only where a filter exactly represents this segment.
   *
   * A segment that narrowed the page to an approximation of itself would show
   * a different count than the one the reader just clicked.
   */
  href?: string | null;
  /** Which population dimension the href narrows, for the pilot record. */
  dimension?: string;
};

export function SegmentedBar({ segments, unit }: { segments: Segment[]; unit: string }) {
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);
  if (total === 0) return null;
  return (
    <>
      {/* No role="img" on the container. It would fold every segment into one
          label and hide the links inside from anyone using a screen reader —
          exactly the readers who most need the legend below to be reachable. */}
      <div className="ip-stack">
        {segments
          .filter((segment) => segment.count > 0)
          .map((segment) => {
            const share = segment.count / total;
            const tip = `${segment.label} · ${segment.count} of ${total} · ${Math.round(share * 100)}%`;
            const style = { width: `${share * 100}%` };
            return segment.href ? (
              <TelemetryLink
                key={segment.key}
                className={`ip-seg ip-seg--${segment.tone} ip-tip`}
                data-tip={tip}
                href={segment.href}
                style={style}
                aria-label={tip}
                telemetry={{
                  event: "filter_changed",
                  objectType: segment.dimension ?? "outcome",
                  objectKey: segment.key,
                }}
              />
            ) : (
              <span
                key={segment.key}
                className={`ip-seg ip-seg--${segment.tone} ip-tip`}
                data-tip={tip}
                style={style}
                tabIndex={0}
              />
            );
          })}
      </div>
      <ul className="ip-legend">
        {segments
          .filter((segment) => segment.count > 0)
          .map((segment) => (
            <li key={segment.key}>
              <b className={`ip-swatch ip-seg--${segment.tone}`} aria-hidden="true" />
              {segment.label} <strong>{segment.count}</strong>
              <span className="ip-legend-share">{Math.round((segment.count / total) * 100)}%</span>
            </li>
          ))}
      </ul>
      <p className="ip-note">
        {total} {unit}
      </p>
    </>
  );
}
