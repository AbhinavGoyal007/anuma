import { describe, expect, it } from "vitest";

import {
  computeCoverage,
  currentRecordCandidate,
  formatRecordingHours,
  type CoverageInput,
} from "@/modules/intelligence/coverage";

/**
 * Coverage, to the letter of the contract.
 *
 * Each stage is defined against the *current* artefact rather than the best one
 * that ever existed, and these fixtures exist to hold that line. A conversation
 * whose active transcription failed is not transcribed because an older run
 * once succeeded; a record built from that older run is not this conversation's
 * analysis. Counting either would report a pipeline healthier than the one
 * running.
 */

const HOUR = 3_600_000;

type Options = {
  recordingStatus?: "pending" | "uploading" | "uploaded" | "failed" | "deleted";
  runStatus?: "pending" | "running" | "completed" | "failed" | "cancelled";
  recordStatus?: "pending" | "running" | "completed" | "failed" | "cancelled";
  outcome?: string | null;
  observed?: boolean;
  evidence?: "current" | "stale" | "none";
  requiresEvidenceField?: boolean;
};

/** One conversation carried all the way through, with the parts named. */
function chain(id: string, options: Options = {}) {
  const {
    recordingStatus = "uploaded",
    runStatus = "completed",
    recordStatus = "completed",
    outcome = "sale",
    observed = true,
    evidence = "current",
    requiresEvidenceField = true,
  } = options;
  const runId = `${id}-run`;
  const recordId = `${id}-rec`;
  const groupId = `${id}-grp`;
  return {
    conversation: { id, activeTranscriptionRunId: runId },
    recording: {
      conversationId: id,
      status: recordingStatus,
      durationMilliseconds: HOUR,
    },
    run: { id: runId, conversationId: id, status: runStatus },
    record: {
      id: recordId,
      conversationId: id,
      sourceTranscriptionRunId: runId,
      status: recordStatus,
      completedAt: "2026-08-01T10:00:00Z",
      createdAt: "2026-08-01T09:00:00Z",
    },
    values: [
      ...(observed
        ? [
            {
              interactionRecordId: recordId,
              fieldKey: requiresEvidenceField ? "customer_questions" : "purchase_category",
              valueText: "something",
              abstention: null,
              evidenceGroupId: evidence === "none" ? null : groupId,
              rejected: false,
            },
          ]
        : [
            {
              interactionRecordId: recordId,
              fieldKey: "customer_questions",
              valueText: null,
              abstention: "not_stated",
              evidenceGroupId: null,
              rejected: false,
            },
          ]),
      ...(outcome === null
        ? []
        : [
            {
              interactionRecordId: recordId,
              fieldKey: "confirmed_business_outcome",
              valueText: outcome,
              abstention: null,
              evidenceGroupId: null,
              rejected: false,
            },
          ]),
    ],
    evidenceReferences:
      evidence === "none"
        ? []
        : [
            {
              evidenceGroupId: groupId,
              transcriptionRunId: evidence === "current" ? runId : `${id}-old-run`,
            },
          ],
  };
}

const DEFINITIONS = [
  { key: "customer_questions", isSystem: true, isEnabled: true, requiresEvidence: true },
  { key: "purchase_category", isSystem: true, isEnabled: true, requiresEvidence: false },
  { key: "confirmed_business_outcome", isSystem: true, isEnabled: true, requiresEvidence: false },
];

function coverageOf(chains: ReturnType<typeof chain>[], overrides: Partial<CoverageInput> = {}) {
  return computeCoverage({
    conversations: chains.map((item) => item.conversation),
    recordings: chains.map((item) => item.recording),
    runs: chains.map((item) => item.run),
    records: chains.map((item) => item.record),
    fieldValues: chains.flatMap((item) => item.values),
    definitions: DEFINITIONS,
    evidenceReferences: chains.flatMap((item) => item.evidenceReferences),
    ...overrides,
  });
}

describe("the coverage chain, to the specified fixture", () => {
  it("reports 100 recorded, 95 transcribed, 90 analysed, 85 usable", () => {
    const chains = [
      // 70 complete all the way through: outcome known, evidence on the
      // current transcript.
      ...Array.from({ length: 70 }, (_, index) => chain(`ok-${index}`)),
      // 10 usable and evidence-ready, but no outcome was ever recorded.
      ...Array.from({ length: 10 }, (_, index) => chain(`no-outcome-${index}`, { outcome: null })),
      // 5 usable, but their only citation points at a superseded transcript.
      ...Array.from({ length: 5 }, (_, index) =>
        chain(`stale-evidence-${index}`, { outcome: null, evidence: "stale" }),
      ),
      // 5 analysed but every value abstained: nothing to count.
      ...Array.from({ length: 5 }, (_, index) =>
        chain(`empty-${index}`, { observed: false, outcome: null }),
      ),
      // 5 transcribed, analysis still running.
      ...Array.from({ length: 5 }, (_, index) =>
        chain(`analysing-${index}`, { recordStatus: "running" }),
      ),
      // 5 recorded, transcription failed.
      ...Array.from({ length: 5 }, (_, index) =>
        chain(`untranscribed-${index}`, { runStatus: "failed" }),
      ),
    ];
    const coverage = coverageOf(chains);

    expect(coverage.recordedInteractions).toBe(100);
    expect(coverage.transcribedInteractions).toBe(95);
    expect(coverage.analysedInteractions).toBe(90);
    expect(coverage.usableInteractions).toBe(85);
    expect(coverage.notUsableInteractions).toBe(5);

    // Outcome known is measured against the usable interactions that carry the
    // field at all, not against everything.
    expect(coverage.outcomeKnown.affected).toBe(70);
    expect(coverage.outcomeKnown.observed).toBe(70);
    expect(coverage.outcomeKnown.eligible).toBe(85);

    // Evidence ready: all 85 usable interactions carry a field that must cite
    // something; 80 of them cite the current run.
    expect(coverage.evidenceReady.affected).toBe(80);
    expect(coverage.evidenceReady.observed).toBe(85);
  });

  it("counts one interaction however many files it carries", () => {
    const one = chain("c1");
    const coverage = coverageOf([one], {
      recordings: [
        one.recording,
        { conversationId: "c1", status: "failed", durationMilliseconds: HOUR },
        { conversationId: "c1", status: "uploaded", durationMilliseconds: HOUR },
      ],
    });
    expect(coverage.recordedInteractions).toBe(1);
    expect(coverage.recordingFiles).toBe(2);
    expect(coverage.recordingHours).toBe(2);
  });

  it("does not count a conversation whose only recording failed", () => {
    expect(coverageOf([chain("c1", { recordingStatus: "failed" })]).recordedInteractions).toBe(0);
  });

  it("keeps a file with no duration in the count and out of the hours", () => {
    const one = chain("c1");
    const coverage = coverageOf([one], {
      recordings: [
        { conversationId: "c1", status: "uploaded", durationMilliseconds: null },
        one.recording,
      ],
    });
    expect(coverage.recordingFiles).toBe(2);
    expect(coverage.recordingHours).toBe(1);
    expect(coverage.recordingDurationUnavailableFiles).toBe(1);
  });

  it("does not call a conversation transcribed because an older run once finished", () => {
    // The active run is what the conversation is currently built from. Reaching
    // past it for a happier answer reports a pipeline that is not running.
    const one = chain("c1", { runStatus: "failed" });
    const coverage = coverageOf([one], {
      runs: [one.run, { id: "c1-old-run", conversationId: "c1", status: "completed" }],
    });
    expect(coverage.transcribedInteractions).toBe(0);
    expect(coverage.transcription.failed).toBe(1);
  });

  it("does not call a conversation analysed on a record built from an older transcript", () => {
    const one = chain("c1");
    const coverage = coverageOf([one], {
      records: [
        {
          id: "stale",
          conversationId: "c1",
          sourceTranscriptionRunId: "c1-old-run",
          status: "completed",
          completedAt: "2026-08-02T10:00:00Z",
          createdAt: "2026-08-02T10:00:00Z",
        },
      ],
    });
    expect(coverage.transcribedInteractions).toBe(1);
    expect(coverage.analysedInteractions).toBe(0);
    expect(coverage.analysis.notStarted).toBe(1);
  });

  it("does not call an interaction usable when every value is abstained or rejected", () => {
    const abstained = chain("c1", { observed: false, outcome: null });
    expect(coverageOf([abstained]).usableInteractions).toBe(0);

    const rejected = chain("c2");
    const coverage = coverageOf([rejected], {
      fieldValues: rejected.values.map((value) => ({ ...value, rejected: true })),
    });
    expect(coverage.analysedInteractions).toBe(1);
    expect(coverage.usableInteractions).toBe(0);
  });

  it("ignores a field the organization has disabled", () => {
    const one = chain("c1", { outcome: null });
    const coverage = coverageOf([one], {
      definitions: DEFINITIONS.map((definition) =>
        definition.key === "customer_questions" ? { ...definition, isEnabled: false } : definition,
      ),
    });
    expect(coverage.usableInteractions).toBe(0);
  });

  it("never turns an unknown outcome into a no-sale", () => {
    const unreadable = chain("c1", { outcome: "maybe" });
    const coverage = coverageOf([unreadable]);
    expect(coverage.outcomeKnown.eligible).toBe(1);
    expect(coverage.outcomeKnown.affected).toBe(0);
  });

  it("does not accept evidence attached to a superseded transcription run", () => {
    // The segment ids that evidence points at belong to a transcript this
    // record was not built from, so the quote would not match the audio.
    const stale = chain("c1", { evidence: "stale" });
    const coverage = coverageOf([stale]);
    expect(coverage.evidenceReady.observed).toBe(1);
    expect(coverage.evidenceReady.affected).toBe(0);
  });

  it("leaves an interaction out of the evidence denominator when nothing required a citation", () => {
    const noRequirement = chain("c1", { requiresEvidenceField: false, evidence: "none" });
    const coverage = coverageOf([noRequirement]);
    expect(coverage.usableInteractions).toBe(1);
    expect(coverage.evidenceReady.observed).toBe(0);
    expect(coverage.evidenceReady.value).toBeNull();
  });
});

describe("choosing the current record", () => {
  const at = (id: string, completedAt: string | null, createdAt: string) => ({
    id,
    conversationId: "c1",
    sourceTranscriptionRunId: "run",
    status: "completed" as const,
    completedAt,
    createdAt,
  });

  it("prefers a completed record over one that never finished", () => {
    expect(
      currentRecordCandidate(
        [
          at("unfinished", null, "2026-08-09T10:00:00Z"),
          at("done", "2026-08-01T10:00:00Z", "2026-08-01T09:00:00Z"),
        ],
        "run",
      )?.id,
    ).toBe("done");
  });

  it("breaks a tie deterministically rather than by row order", () => {
    const forwards = currentRecordCandidate(
      [
        at("a", "2026-08-01T10:00:00Z", "2026-08-01T09:00:00Z"),
        at("b", "2026-08-01T10:00:00Z", "2026-08-01T09:00:00Z"),
      ],
      "run",
    );
    const backwards = currentRecordCandidate(
      [
        at("b", "2026-08-01T10:00:00Z", "2026-08-01T09:00:00Z"),
        at("a", "2026-08-01T10:00:00Z", "2026-08-01T09:00:00Z"),
      ],
      "run",
    );
    expect(forwards?.id).toBe("b");
    expect(backwards?.id).toBe("b");
  });

  it("returns nothing when the conversation has no active transcription", () => {
    expect(currentRecordCandidate([at("a", null, "2026-08-01T09:00:00Z")], null)).toBeNull();
  });
});

describe("recording hours are rounded to the stated rule", () => {
  it("shows one decimal below a hundred and whole hours above", () => {
    expect(formatRecordingHours(12.34)).toBe("12.3");
    expect(formatRecordingHours(99.94)).toBe("99.9");
    expect(formatRecordingHours(140.6)).toBe("141");
  });
});
