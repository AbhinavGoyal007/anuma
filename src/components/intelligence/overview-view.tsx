import Link from "next/link";

import type { IntelligenceCandidate } from "@/modules/intelligence/candidates";
import { change, DEFAULT_GUARDRAILS, type Measure } from "@/modules/intelligence/guardrails";

/**
 * What changed, and what needs doing.
 *
 * Deliberately short. An overview that lists everything is a report, and a
 * manager opening it at eight in the morning has to do the ranking themselves —
 * which is the work the page exists to save. At most four findings and four
 * pieces of work, then the pulse.
 *
 * When nothing clears the bar the page says which bar, because "no insights"
 * reads as a fault and "the previous period holds two interactions" reads as an
 * answer.
 */

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function money(minor: number | null, currency: string | null): string {
  if (minor === null) return "—";
  const major = minor / 100;
  const symbol = currency === "INR" ? "₹" : currency ? `${currency} ` : "";
  if (major >= 100000) return `${symbol}${(major / 100000).toFixed(1).replace(/\.0$/, "")} lakh`;
  if (major >= 1000) return `${symbol}${Math.round(major / 1000)}K`;
  return `${symbol}${Math.round(major)}`;
}

export type PulseItem = {
  key: string;
  label: string;
  display: string;
  measure: Measure | null;
  previous?: Measure | null;
};

function Candidate({ candidate }: { candidate: IntelligenceCandidate }) {
  return (
    <li className={`ov-item ov-item--${candidate.priority}`}>
      <p className="ov-headline">{candidate.headline}</p>
      <p className="ov-sowhat">{candidate.soWhat}</p>
      {candidate.href ? (
        <Link className="fl-action-link" href={candidate.href}>
          {candidate.kind === "gap"
            ? `Review ${candidate.affected} interaction${candidate.affected === 1 ? "" : "s"} →`
            : "See the breakdown →"}
        </Link>
      ) : null}
    </li>
  );
}

export type CurrentFact = { key: string; sentence: string; detail?: string };

export function OverviewView({
  changes,
  currentPicture,
  gaps,
  pulse,
  analysed,
  previousAnalysed,
  suppression,
  periodLabel,
  comparisonLabel,
}: {
  changes: IntelligenceCandidate[];
  /** Shown in place of changes when no comparison clears the bar. */
  currentPicture: CurrentFact[];
  gaps: IntelligenceCandidate[];
  pulse: PulseItem[];
  analysed: number;
  previousAnalysed: number | null;
  suppression: string | null;
  periodLabel: string;
  comparisonLabel: string;
}) {
  if (analysed === 0) {
    return (
      <section className="fl-empty">
        <p>No analysed interactions in {periodLabel}.</p>
        <p className="fl-empty-note">
          Conversations appear here once they have been transcribed, speaker-mapped and analysed.
        </p>
      </section>
    );
  }

  return (
    <>
      {changes.length > 0 ? (
        <section className="fl-section" aria-labelledby="ov-changed">
          <h2 id="ov-changed">What changed</h2>
          <ul className="ov-list">
            {changes.slice(0, 4).map((candidate) => (
              <Candidate key={candidate.id} candidate={candidate} />
            ))}
          </ul>
        </section>
      ) : (
        // No comparison to make, so the page states where things stand instead
        // of opening with an empty heading. A blank "What changed" reads as a
        // broken product; a current picture reads as an answer, and on a young
        // organization it is the only honest thing the page can lead with.
        <section className="fl-section" aria-labelledby="ov-now">
          <h2 id="ov-now">Current picture</h2>
          <ul className="ov-list">
            {currentPicture.slice(0, 4).map((fact) => (
              <li key={fact.key} className="ov-item ov-item--medium">
                <p className="ov-headline">{fact.sentence}</p>
                {fact.detail ? <p className="ov-sowhat">{fact.detail}</p> : null}
              </li>
            ))}
          </ul>
          <p className="fl-note">
            {suppression ??
              `Nothing moved by enough to report between ${periodLabel} and ${comparisonLabel}.`}
          </p>
        </section>
      )}

      <section className="fl-section" aria-labelledby="ov-action">
        <h2 id="ov-action">What needs doing</h2>
        {gaps.length === 0 ? (
          <p className="fl-none">
            No execution gap affected enough interactions to raise here. With {analysed} analysed
            that is worth reading as “none surfaced”, not “none exist”.
          </p>
        ) : (
          <ul className="ov-list">
            {gaps.slice(0, 4).map((candidate) => (
              <Candidate key={candidate.id} candidate={candidate} />
            ))}
          </ul>
        )}
      </section>

      <section className="fl-section" aria-labelledby="ov-pulse">
        <h2 id="ov-pulse">Where the business stands</h2>
        <dl className="fl-rates">
          {pulse.map((item) => {
            const delta =
              item.measure && item.previous ? change(item.measure, item.previous) : null;
            const thin =
              item.measure !== null &&
              item.measure.observed > 0 &&
              item.measure.observed < DEFAULT_GUARDRAILS.minimumForConfidentDisplay;
            return (
              <div key={item.key} className="fl-rate">
                <dt>{item.label}</dt>
                <dd>
                  <strong>{item.display}</strong>
                  {delta?.comparable && delta.deltaPoints !== null ? (
                    <span className="fl-delta">
                      {delta.deltaPoints > 0 ? "+" : ""}
                      {Math.round(delta.deltaPoints)}pp
                    </span>
                  ) : null}
                  {item.measure ? (
                    <p className={`fl-sample${thin ? " fl-sample--thin" : ""}`}>
                      {item.measure.affected ?? 0} of {item.measure.observed}
                      {thin ? " · directional only" : ""}
                    </p>
                  ) : null}
                </dd>
              </div>
            );
          })}
        </dl>
        {previousAnalysed !== null ? (
          <p className="fl-note">
            {analysed} analysed in {periodLabel}, against {previousAnalysed} in {comparisonLabel}. A
            change is only shown where both periods hold enough interactions to compare.
          </p>
        ) : null}
      </section>
    </>
  );
}

export { percent as overviewPercent, money as overviewMoney };
