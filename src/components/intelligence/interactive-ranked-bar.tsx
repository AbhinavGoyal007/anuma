import Link from "next/link";

import type { RankedShare } from "@/modules/intelligence/demand";
import { displayValue, readableLabel } from "@/modules/intelligence/display";

/**
 * The one comparison shape these pages use for lists.
 *
 * Length from a common baseline is the comparison people read most accurately,
 * and using a single grammar throughout means a reader learns the page once
 * instead of decoding each panel. Nothing here is a pie.
 *
 * A bar is clickable exactly when clicking it means something — a category
 * narrows the whole page, a free-text requirement does not. A mark that looks
 * clickable and is not is worse than a plain one.
 */

function readable(token: string): string {
  const spaced = token.replaceAll("_", " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function RankedBars({
  entries,
  /** The true number of distinct values, before any calculation cap. */
  distinct,
  eligible,
  unit,
  /** Values come from a fixed vocabulary and may be relabelled for reading. */
  controlled = false,
  /** Builds the filter link for a value, where clicking it narrows the page. */
  hrefFor,
  limit,
  expandHref,
  /** Opens the evidence behind a value. */
  evidenceHrefFor,
}: {
  entries: RankedShare[];
  distinct?: number;
  eligible: number;
  unit: string;
  controlled?: boolean;
  hrefFor?: (value: string) => string;
  limit?: number;
  expandHref?: string | null;
  /** Opens the evidence behind this value, separately from any filter. */
  evidenceHrefFor?: (value: string) => string;
}) {
  const widest = entries[0]?.interactions || 1;
  // Truncation is about the panel's shape, not about whether an expansion link
  // happens to exist. A twelve-row list beside a four-row one reads as a
  // finding rather than as two lists of different lengths.
  // Counted against the real total. "Show all 40" was a promise the page could
  // not keep when the calculation had already been capped at forty and the
  // honest answer was seventy-three.
  const total = distinct ?? entries.length;
  const hidden = limit ? Math.max(0, total - limit) : Math.max(0, total - entries.length);
  const shown = limit ? entries.slice(0, limit) : entries;

  return (
    <>
      <ul className="ip-bars">
        {shown.map((entry) => {
          const text = controlled
            ? readable(entry.value)
            : displayValue(entry.label, entry.value).text;
          const tip = `${text} · ${entry.interactions} of ${eligible} · ${Math.round(entry.share * 100)}%`;
          const inner = (
            <>
              <span className="ip-bar-name" title={entry.value}>
                {entry.label ? <em>{readableLabel(entry.label)}</em> : null}
                {text || entry.value}
              </span>
              <span className="ip-track" aria-hidden="true">
                <span
                  className="ip-fill"
                  style={{ width: `${Math.max(2, (entry.interactions / widest) * 100)}%` }}
                />
              </span>
              <span className="ip-value">
                {entry.interactions} · {Math.round(entry.share * 100)}%
              </span>
            </>
          );
          const filterHref = hrefFor?.(entry.value) ?? null;
          const reviewHref = evidenceHrefFor?.(entry.value) ?? null;
          return (
            <li key={`${entry.label ?? ""}-${entry.value}`}>
              {filterHref ? (
                <Link className="ip-bar ip-bar--action ip-tip" data-tip={tip} href={filterHref}>
                  {inner}
                </Link>
              ) : reviewHref ? (
                <Link className="ip-bar ip-bar--action ip-tip" data-tip={tip} href={reviewHref}>
                  {inner}
                </Link>
              ) : (
                <span className="ip-bar ip-tip" data-tip={tip} tabIndex={0}>
                  {inner}
                </span>
              )}
              {/* A second, smaller affordance. One click must not both narrow
                  the page and open evidence — a reader cannot predict which
                  they are about to get. */}
              {filterHref && reviewHref ? (
                <Link className="ip-review" href={reviewHref} aria-label={`Review ${entry.value}`}>
                  Review
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="ip-note">
        {unit}
        {hidden > 0 ? (
          <>
            {" · "}
            {expandHref ? (
              <Link className="ip-link" href={expandHref}>
                Show all {total}
              </Link>
            ) : (
              `${hidden} more not shown`
            )}
          </>
        ) : null}
      </p>
    </>
  );
}
