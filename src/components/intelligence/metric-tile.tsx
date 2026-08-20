import Link from "next/link";

import {
  TelemetryLink,
  type ControlEvent,
} from "@/components/intelligence/telemetry";

import { change, DEFAULT_GUARDRAILS, type Measure } from "@/modules/intelligence/guardrails";

/**
 * One number, with everything needed to judge it attached.
 *
 * The denominator travels with the figure rather than sitting in a tooltip
 * alone, because a percentage without its denominator is the easiest way for a
 * dashboard to mislead. The tooltip carries the rest — coverage, the previous
 * period, the delta — so the tile stays readable and the detail is one hover or
 * one tab-stop away.
 */

export function formatPercent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

export function formatMoney(minor: number | null, currency: string | null): string {
  if (minor === null) return "—";
  const major = minor / 100;
  const symbol = currency === "INR" ? "₹" : currency ? `${currency} ` : "";
  if (major >= 100000) return `${symbol}${(major / 100000).toFixed(1).replace(/\.0$/, "")} lakh`;
  if (major >= 1000) return `${symbol}${Math.round(major / 1000)}K`;
  return `${symbol}${Math.round(major)}`;
}

/**
 * The fixed tooltip line: label, value, affected, denominator, coverage, delta.
 *
 * Built in one place so every mark on all four pages says the same things in
 * the same order, and a reader learns the grammar once.
 */
export function tipText({
  label,
  value,
  measure: m,
  previous,
}: {
  label: string;
  value: string;
  measure?: Measure | null;
  previous?: Measure | null;
}): string {
  const parts = [`${label} · ${value}`];
  if (m) {
    parts.push(`${m.affected ?? 0} of ${m.observed} observed`);
    if (m.coverage !== null && m.coverage < 1) {
      parts.push(`coverage ${Math.round(m.coverage * 100)}% of ${m.eligible}`);
    }
    if (previous) {
      const delta = change(m, previous);
      parts.push(
        delta.comparable && delta.deltaPoints !== null
          ? `${delta.deltaPoints > 0 ? "+" : ""}${Math.round(delta.deltaPoints)}pp vs previous`
          : "no comparable previous period",
      );
    }
    if (m.observed > 0 && m.observed < DEFAULT_GUARDRAILS.minimumForConfidentDisplay) {
      parts.push("small sample");
    }
  }
  return parts.join(" · ");
}

export function Delta({ measure: m, previous }: { measure: Measure; previous: Measure | null }) {
  if (!previous) return null;
  const delta = change(m, previous);
  // Shown only when both periods independently clear the bar. A solid month
  // measured against six conversations is not a trend, and printing the arrow
  // anyway is how a dashboard teaches people to distrust it.
  if (!delta.comparable || delta.deltaPoints === null) return null;
  return (
    <span className={`ip-delta ip-delta--${delta.deltaPoints > 0 ? "up" : "down"}`}>
      {delta.deltaPoints > 0 ? "+" : ""}
      {Math.round(delta.deltaPoints)}pp
    </span>
  );
}

export function MetricTile({
  label,
  value,
  measure: m,
  previous = null,
  attention = false,
  href = null,
  telemetry,
  meta,
}: {
  label: string;
  value: string;
  measure?: Measure | null;
  previous?: Measure | null;
  attention?: boolean;
  href?: string | null;
  /** What the pilot records when this tile is activated, where it is a control. */
  telemetry?: ControlEvent;
  /** Overrides the default denominator line. */
  meta?: string;
}) {
  const denominator = meta ?? (m ? `${m.affected ?? 0} of ${m.observed}` : "—");
  const body = (
    <>
      <span className="ip-label">{label}</span>
      <span className="ip-metric">
        {value}
        {m ? <Delta measure={m} previous={previous} /> : null}
      </span>
      <span className="ip-meta">{denominator}</span>
    </>
  );
  const tip = tipText({ label, value, measure: m, previous });
  const className = `ip-signal${attention ? " ip-signal--attention" : ""}`;
  return href && telemetry ? (
    <TelemetryLink
      className={`${className} ip-tip`}
      data-tip={tip}
      href={href}
      telemetry={telemetry}
    >
      {body}
    </TelemetryLink>
  ) : href ? (
    <Link className={`${className} ip-tip`} data-tip={tip} href={href}>
      {body}
    </Link>
  ) : (
    <div className={`${className} ip-tip`} data-tip={tip} tabIndex={0}>
      {body}
    </div>
  );
}
