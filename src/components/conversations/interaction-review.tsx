"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  coachingFor,
  notesFor,
  type ReviewProjection as Review,
  type ReviewProjectionObservation as Observation,
} from "@/modules/review/projections";

function stateLabel(state: Review["checks"][number]["state"]) {
  return {
    met: "Met",
    not_met: "Not met",
    partial: "Partial",
    not_applicable: "Not applicable",
    insufficient_evidence: "Insufficient evidence",
  }[state];
}

export function InteractionReview({
  conversationId,
  observations,
  review,
  canRequest,
}: {
  conversationId: string;
  observations: Observation[];
  review: Review | null;
  canRequest: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const notes = notesFor(observations);
  const coaching = review ? coachingFor(review, observations) : null;
  const requestReview = async (trigger: "initial" | "manual") => {
    setState("working");
    setMessage(null);
    const response = await fetch(`/api/conversations/${conversationId}/review`, {
      body: JSON.stringify({ trigger }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setState("error");
      setMessage(payload.error ?? "Interaction review could not start.");
      return;
    }
    setState("idle");
    setMessage("Interaction review is being prepared from the confirmed evidence.");
    router.refresh();
  };

  return (
    <>
      <section className="interaction-notes" aria-labelledby="interaction-notes-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Understanding</p>
            <h2 id="interaction-notes-title">Interaction notes</h2>
          </div>
        </div>
        {notes.length ? (
          <dl className="notes-list">
            {notes.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="empty-inline">
            Notes will appear once interaction understanding has evidence-backed observations.
          </p>
        )}
      </section>

      <section className="interaction-review" aria-labelledby="review-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Review</p>
            <h2 id="review-title">Configured checks</h2>
          </div>
          {canRequest ? (
            <button
              className="button button-secondary"
              disabled={state === "working"}
              onClick={() => void requestReview(review ? "manual" : "initial")}
              type="button"
            >
              {state === "working"
                ? "Preparing…"
                : review
                  ? "Re-evaluate review"
                  : "Evaluate interaction"}
            </button>
          ) : null}
        </div>
        {review?.status === "pending" || review?.status === "running" ? (
          <p className="processing-note" role="status">
            Interaction review is being prepared from the confirmed evidence.
          </p>
        ) : review?.checks.length ? (
          <ul className="review-check-list">
            {review.checks.map((check) => (
              <li key={check.id}>
                <div className="review-check-header">
                  <div>
                    <p className="eyebrow">
                      {check.purpose === "scorecard" ? "Scorecard check" : "Monitoring check"}
                    </p>
                    <h3>{check.name}</h3>
                  </div>
                  <span className={`review-state review-state-${check.state}`}>
                    {stateLabel(check.state)}
                  </span>
                </div>
                {check.applicabilityReason ? (
                  <p className="review-relevance">{check.applicabilityReason}</p>
                ) : null}
                <p>{check.explanation}</p>
                {check.evidenceSegmentId ? (
                  <a className="evidence-link" href={`#segment-${check.evidenceSegmentId}`}>
                    View evidence
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-inline">
            {canRequest
              ? "Set up a starter check pack in Administration, then evaluate this interaction."
              : "A completed interaction understanding is required before review."}
          </p>
        )}
        {message ? (
          <p className="auth-message" role={state === "error" ? "alert" : "status"}>
            {message}
          </p>
        ) : null}
      </section>

      {review?.scorecards.length ? (
        <section className="scorecard-review" aria-labelledby="scorecard-title">
          <p className="eyebrow">Scorecard</p>
          <h2 id="scorecard-title">Organization evaluation</h2>
          <p className="section-copy">
            This is the organization’s configured evaluation, not an objective universal quality
            score.
          </p>
          {review.scorecards.map((scorecard) => (
            <div className="scorecard-row" key={scorecard.id}>
              <div>
                <h3>{scorecard.name}</h3>
                <p>
                  {scorecard.evaluatedCheckCount} of {scorecard.applicableCheckCount} applicable
                  checks evaluated
                  {scorecard.insufficientEvidenceCount
                    ? ` · ${scorecard.insufficientEvidenceCount} need more evidence`
                    : ""}
                </p>
              </div>
              <strong>
                {scorecard.scorePercent === null ? "—" : `${Math.round(scorecard.scorePercent)}%`}
              </strong>
            </div>
          ))}
        </section>
      ) : null}

      {coaching && (coaching.strengths.length || coaching.opportunities.length) ? (
        <section className="coaching-review" aria-labelledby="coaching-title">
          <p className="eyebrow">Next</p>
          <h2 id="coaching-title">Evidence-backed coaching</h2>
          {coaching.strengths.length ? (
            <div>
              <h3>What went well</h3>
              <ul>
                {coaching.strengths.map((check) => (
                  <li key={check.id}>
                    <strong>{check.name}.</strong> {check.explanation}
                    {check.evidenceSegmentId ? (
                      <a href={`#segment-${check.evidenceSegmentId}`}> Evidence</a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {coaching.opportunities.length ? (
            <div>
              <h3>Opportunities</h3>
              <ul>
                {coaching.opportunities.map((check) => (
                  <li key={check.id}>
                    <strong>{check.name}.</strong> {check.advice}
                    {check.evidenceSegmentId ? (
                      <a href={`#segment-${check.evidenceSegmentId}`}> Evidence</a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
