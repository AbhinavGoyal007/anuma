"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ConsentRecord = { status: string; capturedAt: string; captureMethod: string };
type CustomerConsentPanelProps = {
  conversationId: string;
  history: ConsentRecord[];
  canUpdate: boolean;
};

export function CustomerConsentPanel({
  conversationId,
  history,
  canUpdate,
}: CustomerConsentPanelProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function updateConsent(formData: FormData) {
    setSaving(true);
    const response = await fetch(`/api/conversations/${conversationId}/consent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: formData.get("status"),
        captureMethod: formData.get("captureMethod"),
      }),
    });
    const payload = (await response.json()) as { error?: string };
    setSaving(false);
    if (!response.ok) return setMessage(payload.error ?? "Consent could not be updated.");
    setMessage("Customer recording consent was added to its history.");
    router.refresh();
  }
  return (
    <section className="consent-history" aria-labelledby="consent-history-title">
      <div>
        <p className="eyebrow">Consent provenance</p>
        <h2 id="consent-history-title">Customer recording consent</h2>
        <p>Each update is retained. This is product-level provenance, not a legal conclusion.</p>
      </div>
      <ol>
        {history.map((record) => (
          <li key={`${record.capturedAt}-${record.status}`}>
            <strong>{record.status.replaceAll("_", " ")}</strong>
            <span>
              {new Date(record.capturedAt).toLocaleString()} · {record.captureMethod}
            </span>
          </li>
        ))}
      </ol>
      {canUpdate ? (
        <form action={updateConsent} className="consent-update">
          <label>
            <span>New customer consent status</span>
            <select name="status" defaultValue="granted">
              <option value="granted">Granted</option>
              <option value="declined">Declined</option>
              <option value="withdrawn">Withdrawn</option>
              <option value="not_required">Not required</option>
              <option value="unknown">Unknown</option>
            </select>
          </label>
          <label>
            <span>Capture method</span>
            <select name="captureMethod" defaultValue="verbal">
              <option value="verbal">Verbal</option>
              <option value="written">Written</option>
              <option value="digital">Digital</option>
              <option value="other">Other</option>
            </select>
          </label>
          <button type="submit" className="button button-secondary" disabled={saving}>
            {saving ? "Saving…" : "Add consent update"}
          </button>
        </form>
      ) : null}
      {message ? (
        <p className="auth-message" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
