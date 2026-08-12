"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Observation = {
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
};

export function InteractionUnderstanding({
  conversationId,
  canRequest,
  canCorrect,
  canReviewCorrections,
  observations,
}: {
  conversationId: string;
  canRequest: boolean;
  canCorrect: boolean;
  canReviewCorrections: boolean;
  observations: Observation[];
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [editingObservationId, setEditingObservationId] = useState<string | null>(null);
  async function request() {
    setState("working");
    setMessage(null);
    const response = await fetch(`/api/conversations/${conversationId}/understanding`, {
      method: "POST",
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setState("error");
      setMessage(payload.error ?? "Interaction understanding could not start.");
      return;
    }
    setMessage("Interaction understanding is being prepared from the confirmed transcript.");
    router.refresh();
    setState("idle");
  }
  async function proposeCorrection(observationId: string, form: FormData) {
    setState("working");
    setMessage(null);
    const response = await fetch(`/api/observations/${observationId}/corrections`, {
      body: JSON.stringify({
        reason: String(form.get("reason") ?? ""),
        valueText: String(form.get("valueText") ?? ""),
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setState("error");
      setMessage(payload.error ?? "The correction could not be saved.");
      return;
    }
    setEditingObservationId(null);
    setMessage("Correction proposed. It does not replace the original observation.");
    setState("idle");
    router.refresh();
  }
  async function reviewCorrection(correctionId: string, decision: "confirmed" | "rejected") {
    setState("working");
    setMessage(null);
    const response = await fetch(`/api/observation-corrections/${correctionId}`, {
      body: JSON.stringify({ state: decision }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setState("error");
      setMessage(payload.error ?? "The correction decision could not be saved.");
      return;
    }
    setMessage(decision === "confirmed" ? "Correction confirmed." : "Correction rejected.");
    setState("idle");
    router.refresh();
  }
  return (
    <section className="interaction-understanding" aria-labelledby="understanding-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Interaction understanding</p>
          <h2 id="understanding-title">What the interaction tells us</h2>
        </div>
        {canRequest && !observations.length ? (
          <button
            className="button button-primary"
            disabled={state === "working"}
            onClick={() => void request()}
            type="button"
          >
            {state === "working" ? "Preparing…" : "Prepare understanding"}
          </button>
        ) : null}
      </div>
      {observations.length ? (
        <ul className="observation-list">
          {observations.map((item) => (
            <li key={item.id}>
              <span>{item.type.replaceAll("_", " ")}</span>
              <strong>
                {item.text ??
                  (item.amountMinor !== null
                    ? `${item.currencyCode ?? ""} ${item.amountMinor}`
                    : item.key)}
              </strong>
              <a href="#source-transcript">Evidence</a>
              {item.corrections.map((correction) => (
                <div className="observation-correction" key={correction.id}>
                  <p>
                    {correction.state === "confirmed"
                      ? "Confirmed correction"
                      : correction.state === "rejected"
                        ? "Rejected correction"
                        : "Correction awaiting review"}
                    {correction.valueText ? `: ${correction.valueText}` : ""}
                  </p>
                  {correction.reason ? <p className="muted-copy">{correction.reason}</p> : null}
                  {canReviewCorrections && correction.state === "unreviewed" ? (
                    <p className="inline-actions">
                      <button
                        className="text-button"
                        disabled={state === "working"}
                        onClick={() => void reviewCorrection(correction.id, "confirmed")}
                        type="button"
                      >
                        Confirm
                      </button>
                      <button
                        className="text-button"
                        disabled={state === "working"}
                        onClick={() => void reviewCorrection(correction.id, "rejected")}
                        type="button"
                      >
                        Reject
                      </button>
                    </p>
                  ) : null}
                </div>
              ))}
              {canCorrect ? (
                editingObservationId === item.id ? (
                  <form
                    className="observation-correction-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void proposeCorrection(item.id, new FormData(event.currentTarget));
                    }}
                  >
                    <label>
                      Corrected value
                      <input
                        defaultValue={item.text ?? item.key}
                        disabled={state === "working"}
                        name="valueText"
                        required
                      />
                    </label>
                    <label>
                      Why is this correction needed? <span>(optional)</span>
                      <input disabled={state === "working"} name="reason" />
                    </label>
                    <p className="inline-actions">
                      <button
                        className="button button-secondary"
                        disabled={state === "working"}
                        type="submit"
                      >
                        Save correction
                      </button>
                      <button
                        className="text-button"
                        disabled={state === "working"}
                        onClick={() => setEditingObservationId(null)}
                        type="button"
                      >
                        Cancel
                      </button>
                    </p>
                  </form>
                ) : (
                  <button
                    className="text-button"
                    disabled={state === "working"}
                    onClick={() => setEditingObservationId(item.id)}
                    type="button"
                  >
                    Propose correction
                  </button>
                )
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-inline">
          {canRequest
            ? "Use the confirmed speaker mapping and transcript to create evidence-backed observations. This does not reprocess audio."
            : "A confirmed speaker mapping is required before ANUMA can structure this interaction."}
        </p>
      )}
      {message ? (
        <p className="auth-message" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
