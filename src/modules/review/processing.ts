import "server-only";

import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  calculateScorecard,
  evaluateDeterministicCheck,
  type CheckState,
  type ReviewCheck,
  type ReviewObservation,
  type ReviewResult,
  type ReviewSegment,
} from "@/modules/review/evaluator";
import { OpenAIReviewProvider } from "@/modules/review/openai-provider";

const checkSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  purpose: z.enum(["monitor", "scorecard"]),
  applicability: z.enum(["every_interaction", "when_relevant"]),
  evaluationStrategy: z.enum(["observation", "phrase", "semantic"]),
  observationTypes: z.array(z.string()),
  phrase: z.string().nullable(),
  weight: z.coerce.number().nullable(),
});
const snapshotSchema = z.object({
  checks: z.array(checkSchema),
  scorecards: z.array(
    z.object({ id: z.string().uuid(), name: z.string(), checkIds: z.array(z.string().uuid()) }),
  ),
});

type PersistedCheck = ReviewResult & { checkDefinitionId: string };

function effectiveValue(
  observation: { value_text: string | null },
  correction: { proposed_value: unknown } | undefined,
) {
  if (!correction?.proposed_value || typeof correction.proposed_value !== "object") {
    return observation.value_text;
  }
  const proposed = correction.proposed_value as Record<string, unknown>;
  return typeof proposed.valueText === "string"
    ? proposed.valueText
    : typeof proposed.value_text === "string"
      ? proposed.value_text
      : observation.value_text;
}

function insufficientResult(explanation: string): ReviewResult {
  return {
    applicabilityReason: null,
    evidenceGroupId: null,
    evidenceSegmentIds: [],
    explanation,
    state: "insufficient_evidence",
  };
}

export async function processInteractionReview(reviewRunId: string) {
  "use step";
  const db = createAdminClient();
  const { data: reviewRun, error: reviewError } = await db
    .from("review_runs")
    .select("id,organization_id,conversation_id,analysis_run_id,configuration_snapshot,status")
    .eq("id", reviewRunId)
    .single();
  if (reviewError || !reviewRun) throw new Error("Review run not found.");
  if (reviewRun.status === "completed") return;

  await db
    .from("review_runs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", reviewRunId);

  const snapshot = snapshotSchema.parse(reviewRun.configuration_snapshot);
  const [{ data: analysis }, { data: observations }, { data: corrections }] = await Promise.all([
    db
      .from("analysis_runs")
      .select("source_transcription_run_id,speaker_mapping_version_id")
      .eq("id", reviewRun.analysis_run_id)
      .single(),
    db
      .from("structured_observations")
      .select("id,observation_type,value_text,evidence_group_id")
      .eq("analysis_run_id", reviewRun.analysis_run_id)
      .order("created_at"),
    db
      .from("observation_corrections")
      .select("observation_id,proposed_value,reviewed_at")
      .eq("conversation_id", reviewRun.conversation_id)
      .eq("review_state", "confirmed")
      .order("reviewed_at", { ascending: false }),
  ]);
  if (!analysis || !observations) throw new Error("Review input could not be loaded.");

  const [{ data: segments }, { data: mappings }] = await Promise.all([
    db
      .from("transcript_segments")
      .select("id,provider_speaker_identifier,original_text")
      .eq("transcription_run_id", analysis.source_transcription_run_id)
      .order("sequence_number"),
    db
      .from("speaker_mapping_entries")
      .select("provider_speaker_identifier,participant_role")
      .eq(
        "speaker_mapping_version_id",
        analysis.speaker_mapping_version_id ?? "00000000-0000-0000-0000-000000000000",
      ),
  ]);
  if (!segments?.length || !mappings?.length) {
    throw new Error("A confirmed speaker-mapped transcript is required for review.");
  }

  const correctionByObservation = new Map<
    string,
    { observation_id: string; proposed_value: unknown }
  >();
  for (const correction of corrections ?? []) {
    if (!correctionByObservation.has(correction.observation_id)) {
      correctionByObservation.set(correction.observation_id, correction);
    }
  }
  const effectiveObservations: ReviewObservation[] = observations.map((observation) => ({
    evidenceGroupId: observation.evidence_group_id,
    type: observation.observation_type,
    valueText: effectiveValue(observation, correctionByObservation.get(observation.id)),
  }));
  const roleByProvider = new Map(
    mappings.map((mapping) => [mapping.provider_speaker_identifier, mapping.participant_role]),
  );
  const reviewSegments: ReviewSegment[] = segments.map((segment) => ({
    id: segment.id,
    role: roleByProvider.get(segment.provider_speaker_identifier ?? "") ?? "unknown",
    text: segment.original_text,
  }));

  const resolved = new Map<string, ReviewResult>();
  const semanticChecks: ReviewCheck[] = [];
  for (const check of snapshot.checks) {
    const deterministic = evaluateDeterministicCheck(check, effectiveObservations, reviewSegments);
    if (deterministic) resolved.set(check.id, deterministic);
    else semanticChecks.push(check);
  }

  let semanticRequestCount = 0;
  if (semanticChecks.length) {
    try {
      semanticRequestCount = 1;
      const semanticResults = await new OpenAIReviewProvider().evaluate({
        checks: semanticChecks,
        observations: effectiveObservations,
        segments: reviewSegments,
      });
      const validSegmentIds = new Set(reviewSegments.map((segment) => segment.id));
      for (const check of semanticChecks) {
        const result = semanticResults.get(check.id);
        if (!result) {
          resolved.set(
            check.id,
            insufficientResult("No review result was returned for this check."),
          );
          continue;
        }
        const evidenceSegmentIds = result.evidenceSegmentIds.filter((id) =>
          validSegmentIds.has(id),
        );
        if (
          (result.result === "met" || result.result === "partial") &&
          evidenceSegmentIds.length === 0
        ) {
          resolved.set(
            check.id,
            insufficientResult("The review result did not include valid source evidence."),
          );
          continue;
        }
        resolved.set(check.id, {
          applicabilityReason: result.applicabilityReason,
          evidenceGroupId: null,
          evidenceSegmentIds,
          explanation: result.explanation,
          state: result.result,
        });
      }
    } catch {
      for (const check of semanticChecks) {
        resolved.set(
          check.id,
          insufficientResult(
            "Semantic review is temporarily unavailable; deterministic results remain available.",
          ),
        );
      }
    }
  }

  const persistedChecks: PersistedCheck[] = snapshot.checks.map((check) => ({
    checkDefinitionId: check.id,
    ...(resolved.get(check.id) ?? insufficientResult("This check could not be evaluated.")),
  }));
  const byCheckId = new Map(persistedChecks.map((result) => [result.checkDefinitionId, result]));
  const byDefinitionId = new Map(snapshot.checks.map((check) => [check.id, check]));
  const scorecards = snapshot.scorecards.map((scorecard) => {
    const weighted = scorecard.checkIds.flatMap((checkId) => {
      const check = byDefinitionId.get(checkId);
      const result = byCheckId.get(checkId);
      return check && result && check.purpose === "scorecard" && check.weight !== null
        ? [{ state: result.state, weight: check.weight }]
        : [];
    });
    return { scorecardDefinitionId: scorecard.id, ...calculateScorecard(weighted) };
  });

  const { error: persistError } = await db.rpc("persist_interaction_review", {
    p_check_evaluations: persistedChecks.map((result) => ({
      applicabilityReason: result.applicabilityReason,
      checkDefinitionId: result.checkDefinitionId,
      evidenceGroupId: result.evidenceGroupId,
      evidenceSegmentIds: result.evidenceSegmentIds,
      explanation: result.explanation,
      resultState: result.state,
    })),
    p_review_run_id: reviewRunId,
    p_scorecard_evaluations: scorecards.map((scorecard) => ({
      applicableCheckCount: scorecard.applicableCheckCount,
      evaluatedCheckCount: scorecard.evaluatedCheckCount,
      insufficientEvidenceCount: scorecard.insufficientEvidenceCount,
      scorePercent: scorecard.scorePercent,
      scorecardDefinitionId: scorecard.scorecardDefinitionId,
    })),
    p_semantic_request_count: semanticRequestCount,
  });
  if (persistError) throw new Error("Review results could not be saved.");
}

export function reviewStatesForScore(states: Array<{ state: CheckState; weight: number }>) {
  return calculateScorecard(states);
}
