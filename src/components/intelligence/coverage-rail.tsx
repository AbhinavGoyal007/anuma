import Link from "next/link";

import { formatPercent } from "@/components/intelligence/metric-tile";
import { formatRecordingHours, type IntelligenceCoverage } from "@/modules/intelligence/coverage";

/**
 * How much of the floor ANUMA can see, before any of it is interpreted.
 *
 * First on the page because every number below it is a claim about a
 * population. "38% asked about finance" means one thing over everything that
 * happened and something else entirely over the third of it we managed to
 * process, and a manager cannot tell those apart unless the page says so.
 *
 * No performance colour anywhere here. Coverage below 100% is a fact about the
 * pipeline, not a failure by anybody on the floor, and painting it coral would
 * spend the one colour reserved for things that need doing.
 */

const STAGE_LABELS = ["Recorded", "Transcribed", "Analysed", "Usable"] as const;

export function CoverageRail({
  coverage,
  drawerHref,
}: {
  coverage: IntelligenceCoverage;
  drawerHref: string;
}) {
  const stages = [
    { label: STAGE_LABELS[0], count: coverage.recordedInteractions, of: null as number | null },
    {
      label: STAGE_LABELS[1],
      count: coverage.transcribedInteractions,
      of: coverage.recordedInteractions,
    },
    {
      label: STAGE_LABELS[2],
      count: coverage.analysedInteractions,
      of: coverage.transcribedInteractions,
    },
    {
      label: STAGE_LABELS[3],
      count: coverage.usableInteractions,
      of: coverage.analysedInteractions,
    },
  ];

  return (
    <section className="ip-panel ip-col-12" aria-labelledby="ov-coverage">
      <div className="ip-section-title">
        <h2 id="ov-coverage">Coverage</h2>
        <Link className="ip-link" href={drawerHref}>
          Full breakdown →
        </Link>
      </div>

      <Link className="ip-coverage-rail" href={drawerHref} aria-label="Open the coverage breakdown">
        {stages.map((stage) => (
          <span className="ip-coverage-stage" key={stage.label}>
            <span className="ip-label">{stage.label}</span>
            <strong>{stage.count}</strong>
            <span className="ip-meta">
              {stage.of === null
                ? "interactions"
                : stage.of === 0
                  ? "—"
                  : `${formatPercent(stage.count / stage.of)} of ${stage.of}`}
            </span>
          </span>
        ))}
      </Link>

      <div className="ip-figure-row">
        <div className="ip-pitem">
          <span className="ip-label">Outcome known</span>
          <strong>{formatPercent(coverage.outcomeKnown.value)}</strong>
          <span className="ip-meta">
            {coverage.outcomeKnown.affected ?? 0} of {coverage.outcomeKnown.observed}
          </span>
        </div>
        <div className="ip-pitem">
          <span className="ip-label">Evidence ready</span>
          <strong>{formatPercent(coverage.evidenceReady.value)}</strong>
          <span className="ip-meta">
            {coverage.evidenceReady.affected ?? 0} of {coverage.evidenceReady.observed}
          </span>
        </div>
        <div className="ip-pitem">
          <span className="ip-label">Recording hours</span>
          <strong>{formatRecordingHours(coverage.recordingHours)}</strong>
          <span className="ip-meta">
            {coverage.recordingFiles} uploaded file{coverage.recordingFiles === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      <p className="ip-note">
        Interactions, not files, each measured against the current transcription and the record
        built from it. Evidence ready means at least one fact that must cite something does — not
        that every fact is evidenced.
      </p>
    </section>
  );
}
