import { measure, type Measure } from "@/modules/intelligence/guardrails";

/**
 * How much of the floor ANUMA can actually see.
 *
 * Coverage is the first thing on the Overview because every number after it is
 * a statement about a population, and a manager cannot read "38% asked about
 * finance" without knowing whether that is 38% of everything that happened or
 * 38% of the third of it we managed to process.
 *
 * The chain is Recorded → Transcribed → Analysed → Usable, and each stage is
 * defined against the *current* artefact rather than the best one that ever
 * existed. That distinction is the whole point: a conversation whose active
 * transcription failed is not Transcribed just because an older run once
 * succeeded, and a record attached to that older run is not the analysis of
 * this conversation as it stands today. Counting either would report a
 * pipeline healthier than the one actually running.
 *
 * Pure. Every rule below is testable on fixtures without a database.
 */

export type RecordingStatus = "pending" | "uploading" | "uploaded" | "failed" | "deleted";
export type RunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export type CoverageConversation = {
  id: string;
  activeTranscriptionRunId: string | null;
};

export type CoverageRecording = {
  conversationId: string;
  status: RecordingStatus;
  durationMilliseconds: number | null;
};

export type CoverageRun = {
  id: string;
  conversationId: string;
  status: RunStatus;
};

export type CoverageRecord = {
  id: string;
  conversationId: string;
  sourceTranscriptionRunId: string;
  status: RunStatus;
  completedAt: string | null;
  createdAt: string;
};

export type CoverageFieldValue = {
  interactionRecordId: string;
  fieldKey: string;
  /** The effective text — a human correction has already been applied. */
  valueText: string | null;
  /** Non-null means the value was deliberately withheld; never an observation. */
  abstention: string | null;
  evidenceGroupId: string | null;
  /** True where the latest human correction rejected the value outright. */
  rejected: boolean;
};

export type CoverageFieldDefinition = {
  key: string;
  isSystem: boolean;
  isEnabled: boolean;
  requiresEvidence: boolean;
};

export type CoverageEvidenceReference = {
  evidenceGroupId: string;
  transcriptionRunId: string;
};

/** The five fixed rows every status group renders, in this order. */
export type StatusGroups = {
  completed: number;
  inProgress: number;
  failed: number;
  cancelled: number;
  notStarted: number;
};

export type IntelligenceCoverage = {
  recordedInteractions: number;
  recordingFiles: number;
  /** Summed from uploaded files only; nulls contribute nothing. */
  recordingHours: number;
  recordingDurationUnavailableFiles: number;
  transcription: StatusGroups;
  transcribedInteractions: number;
  analysis: StatusGroups;
  analysedInteractions: number;
  usableInteractions: number;
  notUsableInteractions: number;
  outcomeKnown: Measure;
  evidenceReady: Measure;
  /** The conversations that survived to the usable population, in order. */
  usableConversationIds: string[];
  /** The current record per usable conversation, for everything downstream. */
  currentRecordIdByConversation: Map<string, string>;
};

const UPLOADED: RecordingStatus = "uploaded";

/**
 * The current analytical record for a conversation.
 *
 * Tied to the active transcription run, so re-transcribing a conversation
 * retires every record built from the previous audio rather than leaving the
 * newest-completed one in place. Ordering is completed first (nulls last), then
 * newest created, then id — deterministic, so two readers of the same data see
 * the same record.
 */
export function currentRecordCandidate(
  records: readonly CoverageRecord[],
  activeTranscriptionRunId: string | null,
): CoverageRecord | null {
  if (!activeTranscriptionRunId) return null;
  const candidates = records.filter(
    (record) => record.sourceTranscriptionRunId === activeTranscriptionRunId,
  );
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    if (a.completedAt !== b.completedAt) {
      if (a.completedAt === null) return 1;
      if (b.completedAt === null) return -1;
      return a.completedAt > b.completedAt ? -1 : 1;
    }
    if (a.createdAt !== b.createdAt) return a.createdAt > b.createdAt ? -1 : 1;
    return a.id > b.id ? -1 : 1;
  })[0]!;
}

function groupsFrom(statuses: readonly (RunStatus | null)[]): StatusGroups {
  const groups: StatusGroups = {
    completed: 0,
    inProgress: 0,
    failed: 0,
    cancelled: 0,
    notStarted: 0,
  };
  for (const status of statuses) {
    if (status === "completed") groups.completed += 1;
    else if (status === "pending" || status === "running") groups.inProgress += 1;
    else if (status === "failed") groups.failed += 1;
    else if (status === "cancelled") groups.cancelled += 1;
    else groups.notStarted += 1;
  }
  return groups;
}

export type CoverageInput = {
  conversations: readonly CoverageConversation[];
  recordings: readonly CoverageRecording[];
  runs: readonly CoverageRun[];
  records: readonly CoverageRecord[];
  fieldValues: readonly CoverageFieldValue[];
  definitions: readonly CoverageFieldDefinition[];
  evidenceReferences: readonly CoverageEvidenceReference[];
};

export function computeCoverage(input: CoverageInput): IntelligenceCoverage {
  const recordingsByConversation = new Map<string, CoverageRecording[]>();
  for (const recording of input.recordings) {
    const list = recordingsByConversation.get(recording.conversationId) ?? [];
    list.push(recording);
    recordingsByConversation.set(recording.conversationId, list);
  }

  // 5.1 — one interaction, however many files it carries. A conversation with
  // an uploaded file and a failed file is still recorded.
  const recorded = input.conversations.filter((conversation) =>
    (recordingsByConversation.get(conversation.id) ?? []).some(
      (recording) => recording.status === UPLOADED,
    ),
  );
  const recordedIds = new Set(recorded.map((conversation) => conversation.id));

  const uploadedFiles = input.recordings.filter(
    (recording) => recording.status === UPLOADED && recordedIds.has(recording.conversationId),
  );
  const durationMs = uploadedFiles.reduce(
    (total, recording) => total + (recording.durationMilliseconds ?? 0),
    0,
  );

  const runById = new Map(input.runs.map((run) => [run.id, run]));
  const transcriptionStatuses = recorded.map((conversation) => {
    if (!conversation.activeTranscriptionRunId) return null;
    const run = runById.get(conversation.activeTranscriptionRunId);
    // A run pointed at but absent from the read is not a completed run.
    return run && run.conversationId === conversation.id ? run.status : null;
  });
  const transcription = groupsFrom(transcriptionStatuses);
  const transcribed = recorded.filter((_, index) => transcriptionStatuses[index] === "completed");

  const recordsByConversation = new Map<string, CoverageRecord[]>();
  for (const record of input.records) {
    const list = recordsByConversation.get(record.conversationId) ?? [];
    list.push(record);
    recordsByConversation.set(record.conversationId, list);
  }

  const candidates = transcribed.map((conversation) =>
    currentRecordCandidate(
      recordsByConversation.get(conversation.id) ?? [],
      conversation.activeTranscriptionRunId,
    ),
  );
  const analysis = groupsFrom(candidates.map((candidate) => candidate?.status ?? null));
  const analysed = transcribed.flatMap((conversation, index) => {
    const candidate = candidates[index]!;
    return candidate && candidate.status === "completed" ? [{ conversation, candidate }] : [];
  });

  const enabled = new Map(
    input.definitions
      .filter((definition) => definition.isSystem && definition.isEnabled)
      .map((definition) => [definition.key, definition]),
  );

  const valuesByRecord = new Map<string, CoverageFieldValue[]>();
  for (const value of input.fieldValues) {
    const list = valuesByRecord.get(value.interactionRecordId) ?? [];
    list.push(value);
    valuesByRecord.set(value.interactionRecordId, list);
  }

  /** The values that count as observations: enabled, stated, not rejected. */
  const observedValues = (recordId: string): CoverageFieldValue[] =>
    (valuesByRecord.get(recordId) ?? []).filter(
      (value) => enabled.has(value.fieldKey) && value.abstention === null && !value.rejected,
    );

  // 5.11 — the complete usability gate. Deliberately low: one observed fact on
  // an enabled field. Requiring a known outcome or a speaker mapping here would
  // silently drop interactions the rest of the product can still say true
  // things about.
  const usable = analysed.filter(({ candidate }) => observedValues(candidate.id).length > 0);

  const referencesByGroup = new Map<string, CoverageEvidenceReference[]>();
  for (const reference of input.evidenceReferences) {
    const list = referencesByGroup.get(reference.evidenceGroupId) ?? [];
    list.push(reference);
    referencesByGroup.set(reference.evidenceGroupId, list);
  }

  let outcomeEligible = 0;
  let outcomeAffected = 0;
  let evidenceEligible = 0;
  let evidenceAffected = 0;

  for (const { candidate } of usable) {
    const all = valuesByRecord.get(candidate.id) ?? [];
    const observed = observedValues(candidate.id);

    // 5.12 — eligible means the field is on the record at all, however it was
    // answered. Unknown never becomes no-sale.
    if (all.some((value) => value.fieldKey === "confirmed_business_outcome")) {
      outcomeEligible += 1;
      const outcome = observed.find(
        (value) => value.fieldKey === "confirmed_business_outcome",
      )?.valueText;
      // Exactly these two. Anything else — including a value we cannot read —
      // leaves the outcome unknown, and unknown never becomes a no-sale.
      if (outcome === "sale" || outcome === "no_sale") outcomeAffected += 1;
    }

    // 5.13 — an interaction is evidence ready when at least one fact that is
    // required to cite something actually cites something from the current
    // transcription run. Evidence from a superseded run does not count: the
    // segment ids it points at belong to a transcript this record was not
    // built from.
    const requiresEvidence = observed.filter(
      (value) => enabled.get(value.fieldKey)?.requiresEvidence === true,
    );
    if (requiresEvidence.length > 0) {
      evidenceEligible += 1;
      const linked = requiresEvidence.some(
        (value) =>
          value.evidenceGroupId !== null &&
          (referencesByGroup.get(value.evidenceGroupId) ?? []).some(
            (reference) => reference.transcriptionRunId === candidate.sourceTranscriptionRunId,
          ),
      );
      if (linked) evidenceAffected += 1;
    }
  }

  return {
    recordedInteractions: recorded.length,
    recordingFiles: uploadedFiles.length,
    recordingHours: durationMs / 3_600_000,
    recordingDurationUnavailableFiles: uploadedFiles.filter(
      (recording) => recording.durationMilliseconds === null,
    ).length,
    transcription,
    transcribedInteractions: transcribed.length,
    analysis,
    analysedInteractions: analysed.length,
    usableInteractions: usable.length,
    notUsableInteractions: analysed.length - usable.length,
    outcomeKnown: measure(outcomeAffected, usable.length, outcomeEligible),
    evidenceReady: measure(evidenceAffected, usable.length, evidenceEligible),
    usableConversationIds: usable.map(({ conversation }) => conversation.id),
    currentRecordIdByConversation: new Map(
      usable.map(({ conversation, candidate }) => [conversation.id, candidate.id]),
    ),
  };
}

/** Recording hours, formatted to the fixed rule. */
export function formatRecordingHours(hours: number): string {
  return hours >= 100 ? String(Math.round(hours)) : hours.toFixed(1);
}
