import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AudioCapturePanel } from "@/components/conversations/audio-capture-panel";
import { ConversationEvidence } from "@/components/conversations/conversation-evidence";
import { CustomerConsentPanel } from "@/components/conversations/customer-consent-panel";
import { CoachingPanel } from "@/components/conversations/coaching-panel";
import { InteractionUnderstanding } from "@/components/conversations/interaction-understanding";
import { InteractionMetrics } from "@/components/conversations/interaction-metrics";
import { InteractionRecordPanel } from "@/components/conversations/interaction-record-panel";
import { deriveCoachingMoments } from "@/modules/interaction-record/coaching";
import { InteractionReview } from "@/components/conversations/interaction-review";
import { getInteractionRecord } from "@/modules/interaction-record/data";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { deriveConversationState, getConversationDetail } from "@/modules/conversations/data";
import { getApplicationContext } from "@/modules/identity/application-context";

type ConversationPageProps = {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<{ corrected?: string; error?: string }>;
};

export default async function ConversationPage({ params, searchParams }: ConversationPageProps) {
  const [context, route, message] = await Promise.all([
    getApplicationContext(),
    params,
    searchParams,
  ]);
  if (!context) redirect("/sign-in");
  if (!context.current) redirect("/setup");
  const [conversation, interactionRecord] = await Promise.all([
    getConversationDetail(route.conversationId),
    getInteractionRecord(route.conversationId),
  ]);
  if (!conversation) notFound();

  const { membership, organization } = context.current;
  const canProcessAudio =
    membership.role === "admin" || membership.id === conversation.representativeMembershipId;
  const consentAllowsRecording =
    conversation.consentStatus === "granted" || conversation.consentStatus === "not_required";
  // Red flags earn their own callout above the record — a manager should not
  // have to scroll a fact list to find a moment worth reviewing.
  const redFlags = (interactionRecord?.values ?? []).filter(
    (value) => value.fieldKey === "red_flags" && value.abstention === null && value.valueText,
  );
  // Coaching moments are derived from the record's own facts. Shown to the
  // people who coach — an admin, a manager, or the rep on their own interaction.
  const canCoach = canProcessAudio || membership.role === "manager";
  const coachingMoments =
    interactionRecord?.status === "completed"
      ? deriveCoachingMoments(interactionRecord.values)
      : [];
  const latestRecording =
    conversation.recordings.find((recording) => recording.status === "uploaded") ?? null;

  return (
    <>
      <Link className="back-link" href="/conversations">
        ← Conversations
      </Link>
      <div className="page-heading-row">
        <PageHeader eyebrow="Interaction" title={conversation.title ?? "Untitled interaction"} />
        <StatusBadge
          label={deriveConversationState(conversation)}
          tone={
            conversation.transcriptionStatus === "failed"
              ? "risk"
              : conversation.activeTranscriptionRunId
                ? "warning"
                : "neutral"
          }
        />
      </div>
      {message.error ? (
        <p className="auth-message auth-message-error" role="alert">
          {message.error}
        </p>
      ) : null}
      {message.corrected ? (
        <p className="auth-message" role="status">
          Correction saved — the original AI value is preserved in the record&apos;s history.
        </p>
      ) : null}
      <section className="interaction-context" aria-label="Interaction context">
        <dl className="metadata-grid">
          <div>
            <dt>Vertical</dt>
            <dd>{conversation.vertical}</dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>{conversation.locationName ?? "No location"}</dd>
          </div>
          <div>
            <dt>Team</dt>
            <dd>{conversation.teamName ?? "No team"}</dd>
          </div>
          <div>
            <dt>Customer recording consent</dt>
            <dd>{conversation.consentStatus?.replaceAll("_", " ") ?? "Not recorded"}</dd>
          </div>
        </dl>
        <p className="consent-note">
          This records product-level consent provenance. Legal requirements remain specific to{" "}
          {organization.name} and the applicable jurisdiction.
        </p>
      </section>
      <CustomerConsentPanel
        conversationId={conversation.id}
        history={conversation.consentHistory}
        canUpdate={canProcessAudio}
      />
      <AudioCapturePanel
        conversationId={conversation.id}
        consentAllowsRecording={consentAllowsRecording}
        canProcessAudio={canProcessAudio}
      />
      {conversation.transcriptionStatus === "pending" ||
      conversation.transcriptionStatus === "running" ? (
        <p className="processing-note" role="status">
          Transcription is continuing securely in the background. You can leave this page and return
          to review its status.
        </p>
      ) : null}
      <ConversationEvidence
        recordingId={latestRecording?.id ?? null}
        transcriptionRunId={conversation.activeTranscriptionRunId}
        segments={conversation.transcriptSegments}
        participants={conversation.participants}
        mappings={conversation.activeMappings}
        canProcessAudio={canProcessAudio}
      />
      <InteractionMetrics metrics={conversation.metrics} />
      {redFlags.length > 0 ? (
        <section className="red-flag-callout" role="alert" aria-label="Flagged for review">
          <p className="eyebrow">⚑ Flagged for manager review</p>
          <ul>
            {redFlags.map((flag, index) => (
              <li key={`${flag.valueId}-${index}`}>
                {flag.label ? (
                  <span className="red-flag-cat">{flag.label.replaceAll("_", " ")}</span>
                ) : null}
                {flag.valueText}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <InteractionRecordPanel
        record={interactionRecord}
        conversationId={conversation.id}
        canCorrect={membership.role === "admin" || membership.role === "manager"}
      />
      {canCoach && interactionRecord?.status === "completed" ? (
        <CoachingPanel moments={coachingMoments} />
      ) : null}
      <InteractionUnderstanding
        canCorrect={canProcessAudio}
        canReviewCorrections={membership.role === "admin" || membership.role === "manager"}
        canRequest={
          canProcessAudio &&
          Boolean(conversation.activeTranscriptionRunId) &&
          Boolean(conversation.activeSpeakerMappingVersionId)
        }
        conversationId={conversation.id}
        observations={conversation.observations}
      />
      <InteractionReview
        canRequest={Boolean(conversation.activeAnalysisRunId)}
        conversationId={conversation.id}
        observations={conversation.observations}
        review={conversation.latestReview}
      />
    </>
  );
}
