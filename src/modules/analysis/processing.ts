import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getOpenAIEnvironment } from "@/lib/env";
import type { Json } from "@/lib/supabase/database.generated";
import { hasPersistedAnalysisResult } from "@/modules/analysis/idempotency";
import { metricRows, type MetricSegment } from "@/modules/analysis/metrics";
import { OpenAIAnalysisProvider } from "@/modules/analysis/openai-provider";
import { amountToMinor } from "@/modules/analysis/amount-scale";

type TranscriptSegment = {
  end_milliseconds: number;
  id: string;
  original_text: string;
  provider_speaker_identifier: string | null;
  start_milliseconds: number;
};

type MappedSegment = TranscriptSegment & MetricSegment;

const METRIC_ALGORITHM_VERSION = "phase5.1.v1";

export async function processAnalysisRun(runId: string) {
  "use step";

  const db = createAdminClient();
  const { data: run, error: runError } = await db
    .from("analysis_runs")
    .select(
      "id,organization_id,conversation_id,source_transcription_run_id,speaker_mapping_version_id,metric_run_id",
    )
    .eq("id", runId)
    .single();
  if (runError || !run) throw new Error("Analysis run not found.");
  if (!run.speaker_mapping_version_id) throw new Error("A confirmed speaker mapping is required.");

  const [{ data: conversation }, { data: segments }, { data: mappings }, { data: organization }] =
    await Promise.all([
      db.from("conversations").select("vertical").eq("id", run.conversation_id).single(),
      db
        .from("transcript_segments")
        .select("id,start_milliseconds,end_milliseconds,original_text,provider_speaker_identifier")
        .eq("transcription_run_id", run.source_transcription_run_id)
        .order("sequence_number"),
      db
        .from("speaker_mapping_entries")
        .select("provider_speaker_identifier,participant_role")
        .eq("speaker_mapping_version_id", run.speaker_mapping_version_id),
      db
        .from("organizations")
        .select("country_code,default_currency")
        .eq("id", run.organization_id)
        .single(),
    ]);
  if (!conversation || !organization || !segments?.length || !mappings?.length) {
    throw new Error("Interaction is not eligible for understanding.");
  }

  const roles = new Map(
    mappings.flatMap((mapping) =>
      mapping.provider_speaker_identifier
        ? [[mapping.provider_speaker_identifier, mapping.participant_role] as const]
        : [],
    ),
  );
  if (
    segments.some(
      (segment) =>
        !segment.provider_speaker_identifier || !roles.has(segment.provider_speaker_identifier),
    )
  ) {
    throw new Error("Every transcript segment needs an active human speaker mapping.");
  }
  const mappedSegments = segments.map((segment) => ({
    ...segment,
    role: roles.get(segment.provider_speaker_identifier!)!,
  }));

  const runtimeModel = getOpenAIEnvironment().ANUMA_ANALYSIS_MODEL;
  await db
    .from("analysis_runs")
    .update({ model: runtimeModel, status: "running", started_at: new Date().toISOString() })
    .eq("id", runId);
  if (hasPersistedAnalysisResult(run.metric_run_id)) {
    await db
      .from("analysis_runs")
      .update({ completed_at: new Date().toISOString(), status: "completed" })
      .eq("id", runId);
    await db
      .from("conversations")
      .update({ active_analysis_run_id: runId, lifecycle_status: "ready" })
      .eq("id", run.conversation_id);
    return;
  }

  const result = await new OpenAIAnalysisProvider().extract({
    vertical: conversation.vertical,
    country: organization.country_code,
    currency: organization.default_currency,
    segments: mappedSegments.map((segment) => ({
      endMilliseconds: Number(segment.end_milliseconds),
      id: segment.id,
      speaker: segment.role,
      startMilliseconds: Number(segment.start_milliseconds),
      text: segment.original_text,
    })),
  });
  const ids = new Set(segments.map((segment) => segment.id));
  if (
    result.observations.some((observation) =>
      observation.evidenceSegmentIds.some((id) => !ids.has(id)),
    )
  ) {
    throw new Error("Model returned invalid evidence references.");
  }

  const { error: persistenceError } = await db.rpc("persist_analysis_result", {
    p_analysis_run_id: runId,
    p_metric_values: metricRows(mappedSegments) as Json,
    p_observations: result.observations.map((observation) => ({
      ...observation,
      amountMinor: amountToMinor(
        observation.amountMajor,
        observation.amountScale,
        observation.currency,
      ),
    })) as unknown as Json,
  });
  if (persistenceError) throw new Error("Analysis results could not be saved atomically.");

  await db
    .from("analysis_runs")
    .update({
      completed_at: new Date().toISOString(),
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      provider_request_id: result.requestId,
      status: "completed",
    })
    .eq("id", runId);
  await db
    .from("conversations")
    .update({ active_analysis_run_id: runId, lifecycle_status: "ready" })
    .eq("id", run.conversation_id);
}

export { METRIC_ALGORITHM_VERSION };
