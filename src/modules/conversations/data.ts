import { createClient } from "@/lib/supabase/server";

export type ConversationListItem = {
  id: string;
  title: string | null;
  vertical: "electronics" | "automotive";
  startedAt: string;
  lifecycleStatus: string;
  locationId: string | null;
  teamId: string | null;
  recordingCount: number;
  consentStatus: string | null;
  transcriptionStatus: string | null;
  hasActiveMapping: boolean;
};

export type ConversationDetail = ConversationListItem & {
  representativeMembershipId: string;
  locationName: string | null;
  teamName: string | null;
  participants: Array<{ id: string; role: string; displayLabel: string | null }>;
  recordings: Array<{
    id: string;
    status: string;
    mimeType: string;
    durationMilliseconds: number | null;
    createdAt: string;
  }>;
  activeTranscriptionRunId: string | null;
  activeSpeakerMappingVersionId: string | null;
  activeAnalysisRunId: string | null;
  metrics: Array<{ key: string; value: number; unit: string }>;
  observations: Array<{
    id: string;
    type: string;
    key: string;
    text: string | null;
    amountMinor: number | null;
    currencyCode: string | null;
    evidenceGroupId: string;
    corrections: Array<{
      id: string;
      valueText: string | null;
      reason: string | null;
      state: "unreviewed" | "confirmed" | "rejected";
    }>;
  }>;
  latestReview: {
    id: string;
    status: string;
    semanticRequestCount: number;
    checks: Array<{
      id: string;
      name: string;
      description: string;
      purpose: "monitor" | "scorecard";
      state: ReviewResultState;
      explanation: string;
      applicabilityReason: string | null;
      evidenceGroupId: string | null;
      evidenceSegmentId: string | null;
    }>;
    scorecards: Array<{
      id: string;
      name: string;
      scorePercent: number | null;
      applicableCheckCount: number;
      evaluatedCheckCount: number;
      insufficientEvidenceCount: number;
    }>;
  } | null;
  transcriptSegments: Array<{
    id: string;
    sequenceNumber: number;
    providerSpeakerIdentifier: string | null;
    startMilliseconds: number;
    endMilliseconds: number;
    originalText: string;
  }>;
  activeMappings: Array<{
    providerSpeakerIdentifier: string;
    participantRole: string;
    participantId: string | null;
  }>;
  consentHistory: Array<{ status: string; capturedAt: string; captureMethod: string }>;
};

type ReviewResultState = "met" | "not_met" | "partial" | "not_applicable" | "insufficient_evidence";

export function deriveConversationState(
  item: Pick<
    ConversationListItem,
    "consentStatus" | "recordingCount" | "transcriptionStatus" | "hasActiveMapping"
  >,
): string {
  if (item.transcriptionStatus === "failed") return "Failed";
  if (item.transcriptionStatus === "pending" || item.transcriptionStatus === "running") {
    return "Transcribing";
  }
  if (item.transcriptionStatus === "completed") {
    return item.hasActiveMapping ? "Ready" : "Needs speaker mapping";
  }
  if (item.recordingCount > 0) return "Audio secured";
  return item.consentStatus === "granted" || item.consentStatus === "not_required"
    ? "Ready to record"
    : "Consent required";
}

export async function listConversations(organizationId: string): Promise<ConversationListItem[]> {
  const supabase = await createClient();
  const { data: conversations, error } = await supabase
    .from("conversations")
    .select(
      "id, title, vertical, started_at, lifecycle_status, location_id, team_id, active_speaker_mapping_version_id",
    )
    .eq("organization_id", organizationId)
    .order("started_at", { ascending: false });

  if (error) throw new Error("Could not load conversations.");
  if (conversations.length === 0) return [];

  const ids = conversations.map((conversation) => conversation.id);
  const [recordingsResult, consentResult, runsResult] = await Promise.all([
    supabase.from("recordings").select("conversation_id, status").in("conversation_id", ids),
    supabase
      .from("consent_records")
      .select("conversation_id, status, captured_at")
      .in("conversation_id", ids)
      .order("captured_at", { ascending: false }),
    supabase
      .from("transcription_runs")
      .select("conversation_id, status, created_at")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false }),
  ]);

  if (recordingsResult.error || consentResult.error || runsResult.error) {
    throw new Error("Could not load conversation foundation metadata.");
  }

  const recordingCount = new Map<string, number>();
  for (const recording of recordingsResult.data) {
    recordingCount.set(
      recording.conversation_id,
      (recordingCount.get(recording.conversation_id) ?? 0) + 1,
    );
  }
  const consentByConversation = new Map<string, string>();
  const runByConversation = new Map<string, string>();
  for (const consent of consentResult.data) {
    if (!consentByConversation.has(consent.conversation_id)) {
      consentByConversation.set(consent.conversation_id, consent.status);
    }
  }
  for (const run of runsResult.data) {
    if (!runByConversation.has(run.conversation_id)) {
      runByConversation.set(run.conversation_id, run.status);
    }
  }

  return conversations.map((conversation) => ({
    id: conversation.id,
    title: conversation.title,
    vertical: conversation.vertical,
    startedAt: conversation.started_at,
    lifecycleStatus: conversation.lifecycle_status,
    locationId: conversation.location_id,
    teamId: conversation.team_id,
    recordingCount: recordingCount.get(conversation.id) ?? 0,
    consentStatus: consentByConversation.get(conversation.id) ?? null,
    transcriptionStatus: runByConversation.get(conversation.id) ?? null,
    hasActiveMapping: Boolean(conversation.active_speaker_mapping_version_id),
  }));
}

export async function getConversationDetail(
  conversationId: string,
): Promise<ConversationDetail | null> {
  const supabase = await createClient();
  const { data: conversation, error } = await supabase
    .from("conversations")
    .select(
      "id, title, vertical, started_at, lifecycle_status, location_id, team_id, representative_membership_id, active_transcription_run_id, active_speaker_mapping_version_id, active_analysis_run_id",
    )
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw new Error("Could not load this interaction.");
  if (!conversation) return null;

  const [
    consentResult,
    recordingsResult,
    participantsResult,
    locationResult,
    teamResult,
    segmentsResult,
    mappingsResult,
    runResult,
    observationsResult,
    reviewRunsResult,
  ] = await Promise.all([
    supabase
      .from("consent_records")
      .select("status, captured_at, capture_method")
      .eq("conversation_id", conversationId)
      .order("captured_at", { ascending: false }),
    supabase
      .from("recordings")
      .select("id, status, mime_type, duration_milliseconds, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("conversation_participants")
      .select("id, role, display_label")
      .eq("conversation_id", conversationId)
      .order("created_at"),
    conversation.location_id
      ? supabase.from("locations").select("name").eq("id", conversation.location_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    conversation.team_id
      ? supabase.from("teams").select("name").eq("id", conversation.team_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    conversation.active_transcription_run_id
      ? supabase
          .from("transcript_segments")
          .select(
            "id, sequence_number, provider_speaker_identifier, start_milliseconds, end_milliseconds, original_text",
          )
          .eq("transcription_run_id", conversation.active_transcription_run_id)
          .order("sequence_number")
      : Promise.resolve({ data: [], error: null }),
    conversation.active_speaker_mapping_version_id
      ? supabase
          .from("speaker_mapping_entries")
          .select("provider_speaker_identifier, participant_role, participant_id")
          .eq("speaker_mapping_version_id", conversation.active_speaker_mapping_version_id)
      : Promise.resolve({ data: [], error: null }),
    conversation.active_transcription_run_id
      ? supabase
          .from("transcription_runs")
          .select("status")
          .eq("id", conversation.active_transcription_run_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    conversation.active_analysis_run_id
      ? supabase
          .from("structured_observations")
          .select(
            "id,observation_type,normalized_key,value_text,value_amount_minor,currency_code,evidence_group_id",
          )
          .eq("analysis_run_id", conversation.active_analysis_run_id)
          .order("created_at")
      : Promise.resolve({ data: [], error: null }),
    conversation.active_analysis_run_id
      ? supabase
          .from("review_runs")
          .select("id,status,semantic_request_count,created_at")
          .eq("conversation_id", conversationId)
          .eq("analysis_run_id", conversation.active_analysis_run_id)
          .order("created_at", { ascending: false })
          .limit(1)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (
    [
      consentResult,
      recordingsResult,
      participantsResult,
      locationResult,
      teamResult,
      segmentsResult,
      mappingsResult,
      runResult,
      observationsResult,
      reviewRunsResult,
    ].some((result) => result.error)
  ) {
    throw new Error("Could not load interaction evidence.");
  }

  const recordings = recordingsResult.data ?? [];
  const participants = participantsResult.data ?? [];
  const segments = segmentsResult.data ?? [];
  const mappings = mappingsResult.data ?? [];
  const consent = consentResult.data ?? [];
  const observations = observationsResult.data ?? [];
  const { data: observationCorrections, error: observationCorrectionsError } = observations.length
    ? await supabase
        .from("observation_corrections")
        .select("id,observation_id,proposed_value,reason,review_state,created_at")
        .in(
          "observation_id",
          observations.map((observation) => observation.id),
        )
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (observationCorrectionsError) throw new Error("Could not load interaction corrections.");
  const correctionsByObservation = new Map<
    string,
    Array<{
      id: string;
      valueText: string | null;
      reason: string | null;
      state: "unreviewed" | "confirmed" | "rejected";
    }>
  >();
  for (const correction of observationCorrections ?? []) {
    const proposed =
      correction.proposed_value && typeof correction.proposed_value === "object"
        ? (correction.proposed_value as Record<string, unknown>)
        : {};
    const item = {
      id: correction.id,
      reason: correction.reason,
      state: correction.review_state as "unreviewed" | "confirmed" | "rejected",
      valueText:
        typeof proposed.valueText === "string"
          ? proposed.valueText
          : typeof proposed.value_text === "string"
            ? proposed.value_text
            : null,
    };
    correctionsByObservation.set(correction.observation_id, [
      ...(correctionsByObservation.get(correction.observation_id) ?? []),
      item,
    ]);
  }
  const latestReviewRun = reviewRunsResult.data?.[0] ?? null;
  const { data: analysisMetricLineage, error: analysisMetricLineageError } =
    conversation.active_analysis_run_id
      ? await supabase
          .from("analysis_runs")
          .select("metric_run_id")
          .eq("id", conversation.active_analysis_run_id)
          .maybeSingle()
      : { data: null, error: null };
  if (analysisMetricLineageError) throw new Error("Could not load interaction metric lineage.");
  const { data: metricValues, error: metricValuesError } = analysisMetricLineage?.metric_run_id
    ? await supabase
        .from("metric_values")
        .select("metric_key,numeric_value,unit")
        .eq("metric_run_id", analysisMetricLineage.metric_run_id)
        .order("created_at")
    : { data: [], error: null };
  if (metricValuesError) throw new Error("Could not load interaction metrics.");
  const [reviewChecksResult, reviewScoresResult] = latestReviewRun
    ? await Promise.all([
        supabase
          .from("check_evaluations")
          .select(
            "id,check_definition_id,result_state,explanation,applicability_reason,evidence_group_id",
          )
          .eq("review_run_id", latestReviewRun.id)
          .order("created_at"),
        supabase
          .from("scorecard_evaluations")
          .select(
            "id,scorecard_definition_id,score_percent,applicable_check_count,evaluated_check_count,insufficient_evidence_count",
          )
          .eq("review_run_id", latestReviewRun.id)
          .order("created_at"),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];
  if (reviewChecksResult.error || reviewScoresResult.error) {
    throw new Error("Could not load interaction review.");
  }
  const reviewChecks = reviewChecksResult.data ?? [];
  const reviewScores = reviewScoresResult.data ?? [];
  const reviewCheckDefinitionIds = reviewChecks.map((item) => item.check_definition_id);
  const reviewScorecardIds = reviewScores.map((item) => item.scorecard_definition_id);
  const evidenceGroupIds = reviewChecks.flatMap((item) =>
    item.evidence_group_id ? [item.evidence_group_id] : [],
  );
  const [reviewDefinitionsResult, scorecardDefinitionsResult, evidenceReferencesResult] =
    await Promise.all([
      reviewCheckDefinitionIds.length
        ? supabase
            .from("check_definitions")
            .select("id,name,description,purpose")
            .in("id", reviewCheckDefinitionIds)
        : Promise.resolve({ data: [], error: null }),
      reviewScorecardIds.length
        ? supabase.from("scorecard_definitions").select("id,name").in("id", reviewScorecardIds)
        : Promise.resolve({ data: [], error: null }),
      evidenceGroupIds.length
        ? supabase
            .from("evidence_references")
            .select("evidence_group_id,transcript_segment_id,sequence_number")
            .in("evidence_group_id", evidenceGroupIds)
            .order("sequence_number")
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (
    reviewDefinitionsResult.error ||
    scorecardDefinitionsResult.error ||
    evidenceReferencesResult.error
  ) {
    throw new Error("Could not load review configuration evidence.");
  }
  const reviewDefinitions = new Map(
    (reviewDefinitionsResult.data ?? []).map((item) => [item.id, item]),
  );
  const scorecardDefinitions = new Map(
    (scorecardDefinitionsResult.data ?? []).map((item) => [item.id, item]),
  );
  const firstEvidenceSegment = new Map(
    (evidenceReferencesResult.data ?? []).map((item) => [
      item.evidence_group_id,
      item.transcript_segment_id,
    ]),
  );

  return {
    id: conversation.id,
    title: conversation.title,
    vertical: conversation.vertical,
    startedAt: conversation.started_at,
    lifecycleStatus: conversation.lifecycle_status,
    locationId: conversation.location_id,
    teamId: conversation.team_id,
    recordingCount: recordings.length,
    consentStatus: consent[0]?.status ?? null,
    transcriptionStatus: runResult.data?.status ?? null,
    hasActiveMapping: Boolean(conversation.active_speaker_mapping_version_id),
    representativeMembershipId: conversation.representative_membership_id,
    locationName: locationResult.data?.name ?? null,
    teamName: teamResult.data?.name ?? null,
    participants: participants.map((participant) => ({
      id: participant.id,
      role: participant.role,
      displayLabel: participant.display_label,
    })),
    recordings: recordings.map((recording) => ({
      id: recording.id,
      status: recording.status,
      mimeType: recording.mime_type,
      durationMilliseconds: recording.duration_milliseconds,
      createdAt: recording.created_at,
    })),
    activeTranscriptionRunId: conversation.active_transcription_run_id,
    activeSpeakerMappingVersionId: conversation.active_speaker_mapping_version_id,
    activeAnalysisRunId: conversation.active_analysis_run_id,
    metrics: (metricValues ?? []).map((metric) => ({
      key: metric.metric_key,
      value: metric.numeric_value,
      unit: metric.unit,
    })),
    observations: observations.map((observation) => ({
      id: observation.id,
      type: observation.observation_type,
      key: observation.normalized_key,
      text: observation.value_text,
      amountMinor: observation.value_amount_minor,
      currencyCode: observation.currency_code,
      evidenceGroupId: observation.evidence_group_id,
      corrections: correctionsByObservation.get(observation.id) ?? [],
    })),
    latestReview: latestReviewRun
      ? {
          id: latestReviewRun.id,
          status: latestReviewRun.status,
          semanticRequestCount: latestReviewRun.semantic_request_count,
          checks: reviewChecks.flatMap((item) => {
            const definition = reviewDefinitions.get(item.check_definition_id);
            if (!definition) return [];
            return [
              {
                id: item.id,
                name: definition.name,
                description: definition.description,
                purpose: definition.purpose as "monitor" | "scorecard",
                state: item.result_state as ReviewResultState,
                explanation: item.explanation,
                applicabilityReason: item.applicability_reason,
                evidenceGroupId: item.evidence_group_id,
                evidenceSegmentId: item.evidence_group_id
                  ? (firstEvidenceSegment.get(item.evidence_group_id) ?? null)
                  : null,
              },
            ];
          }),
          scorecards: reviewScores.flatMap((item) => {
            const definition = scorecardDefinitions.get(item.scorecard_definition_id);
            return definition
              ? [
                  {
                    id: item.id,
                    name: definition.name,
                    scorePercent: item.score_percent,
                    applicableCheckCount: item.applicable_check_count,
                    evaluatedCheckCount: item.evaluated_check_count,
                    insufficientEvidenceCount: item.insufficient_evidence_count,
                  },
                ]
              : [];
          }),
        }
      : null,
    transcriptSegments: segments.map((segment) => ({
      id: segment.id,
      sequenceNumber: segment.sequence_number,
      providerSpeakerIdentifier: segment.provider_speaker_identifier,
      startMilliseconds: segment.start_milliseconds,
      endMilliseconds: segment.end_milliseconds,
      originalText: segment.original_text,
    })),
    activeMappings: mappings.map((mapping) => ({
      providerSpeakerIdentifier: mapping.provider_speaker_identifier,
      participantRole: mapping.participant_role,
      participantId: mapping.participant_id,
    })),
    consentHistory: consent.map((record) => ({
      status: record.status,
      capturedAt: record.captured_at,
      captureMethod: record.capture_method,
    })),
  };
}
