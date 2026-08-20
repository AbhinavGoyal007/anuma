import Link from "next/link";

import { DrawerShell } from "@/components/intelligence/drawer-shell";
import { formatPercent } from "@/components/intelligence/metric-tile";
import {
  formatRecordingHours,
  type IntelligenceCoverage,
  type StatusGroups,
} from "@/modules/intelligence/coverage";

/**
 * The pipeline, stage by stage, in fixed rows.
 *
 * Every status row renders every time, including the zeros. A drawer that hides
 * "Failed: 0" and then shows it one morning is a drawer that has changed shape;
 * a reader who has learned where failures appear can check the same place every
 * day and see that there are none.
 *
 * Deliberately no transcript analytics — no word count, talk ratio, words per
 * minute, sentiment or silence score. Those measure the recording, not whether
 * the product can see the floor, and they are the easiest thing to mistake for
 * insight.
 */

const STATUS_ROWS: readonly { key: keyof StatusGroups; label: string }[] = [
  { key: "completed", label: "Completed" },
  { key: "inProgress", label: "In progress" },
  { key: "failed", label: "Failed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "notStarted", label: "Not started" },
];

function Row({
  label,
  count,
  of,
  note,
}: {
  label: string;
  count: number;
  of?: number | null;
  note?: string;
}) {
  return (
    <div className="ip-cov-row">
      <span>{label}</span>
      <span className="ip-cov-value">
        <strong>{count}</strong>
        {of !== undefined && of !== null && of > 0 ? (
          <span className="ip-meta">
            {" "}
            of {of} · {formatPercent(count / of)}
          </span>
        ) : null}
        {note ? <span className="ip-meta"> {note}</span> : null}
      </span>
    </div>
  );
}

function Group({ title, groups, of }: { title: string; groups: StatusGroups; of: number }) {
  return (
    <>
      <p className="ip-drawer-section">{title}</p>
      {STATUS_ROWS.map((row) => (
        <Row key={row.key} label={row.label} count={groups[row.key]} of={of} />
      ))}
    </>
  );
}

export function CoverageDrawer({
  coverage,
  closeHref,
}: {
  coverage: IntelligenceCoverage;
  closeHref: string;
}) {
  return (
    <DrawerShell closeHref={closeHref} triggerKey="coverage" label="Coverage breakdown">
      <Link className="ip-close" href={closeHref} aria-label="Close coverage">
        ×
      </Link>
      <p className="ip-eyebrow">Coverage</p>
      <h2>What ANUMA can see in this scope</h2>

      <p className="ip-drawer-section">Recording</p>
      <Row label="Recorded interactions" count={coverage.recordedInteractions} />
      <Row label="Uploaded recording files" count={coverage.recordingFiles} />
      <div className="ip-cov-row">
        <span>Recording hours</span>
        <span className="ip-cov-value">
          <strong>{formatRecordingHours(coverage.recordingHours)}</strong>
        </span>
      </div>
      <Row label="Duration unavailable" count={coverage.recordingDurationUnavailableFiles} />

      <Group
        title="Transcription"
        groups={coverage.transcription}
        of={coverage.recordedInteractions}
      />
      <Group title="Analysis" groups={coverage.analysis} of={coverage.transcribedInteractions} />

      <p className="ip-drawer-section">Intelligence</p>
      <Row label="Usable" count={coverage.usableInteractions} of={coverage.analysedInteractions} />
      <Row
        label="Not usable"
        count={coverage.notUsableInteractions}
        of={coverage.analysedInteractions}
      />

      <p className="ip-drawer-section">Trust</p>
      <Row
        label="Outcome known"
        count={coverage.outcomeKnown.affected ?? 0}
        of={coverage.outcomeKnown.observed}
      />
      <Row
        label="Evidence ready"
        count={coverage.evidenceReady.affected ?? 0}
        of={coverage.evidenceReady.observed}
      />

      <p className="ip-note">
        Not usable means the record completed and every value on it was abstained or rejected, so
        there is nothing to count — not that the conversation went badly.
      </p>
    </DrawerShell>
  );
}
