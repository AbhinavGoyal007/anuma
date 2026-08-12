"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Segment = {
  id: string;
  sequenceNumber: number;
  providerSpeakerIdentifier: string | null;
  startMilliseconds: number;
  endMilliseconds: number;
  originalText: string;
};
type Participant = { id: string; role: string; displayLabel: string | null };
type Mapping = {
  providerSpeakerIdentifier: string;
  participantRole: string;
  participantId: string | null;
};

type ConversationEvidenceProps = {
  recordingId: string | null;
  transcriptionRunId: string | null;
  segments: Segment[];
  participants: Participant[];
  mappings: Mapping[];
  canProcessAudio: boolean;
};

function timestamp(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function ConversationEvidence({
  recordingId,
  transcriptionRunId,
  segments,
  participants,
  mappings,
  canProcessAudio,
}: ConversationEvidenceProps) {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const speakers = useMemo(
    () => [
      ...new Set(
        segments.flatMap((segment) =>
          segment.providerSpeakerIdentifier ? [segment.providerSpeakerIdentifier] : [],
        ),
      ),
    ],
    [segments],
  );
  const mappingBySpeaker = new Map(
    mappings.map((mapping) => [mapping.providerSpeakerIdentifier, mapping]),
  );

  async function preparePlayback() {
    if (!recordingId) return;
    const response = await fetch(`/api/recordings/${recordingId}/playback`);
    const payload = (await response.json()) as { signedUrl?: string; error?: string };
    if (!response.ok || !payload.signedUrl)
      return setMessage(payload.error ?? "Private playback is unavailable.");
    setSignedUrl(payload.signedUrl);
  }

  function seek(milliseconds: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = milliseconds / 1000;
    void audio.play().catch(() => undefined);
  }

  async function saveMapping(formData: FormData) {
    if (!transcriptionRunId) return;
    const entries = speakers.map((speaker) => {
      const value = String(formData.get(`speaker:${speaker}`) ?? "");
      const [participantRole, participantId] = value.split("|");
      return {
        providerSpeakerIdentifier: speaker,
        participantRole,
        participantId: participantId || null,
      };
    });
    if (entries.some((entry) => !entry.participantRole))
      return setMessage("Map each detected provider speaker before saving.");
    setSaving(true);
    setMessage(null);
    const response = await fetch(`/api/transcription-runs/${transcriptionRunId}/speaker-mapping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    });
    const payload = (await response.json()) as { error?: string };
    setSaving(false);
    if (!response.ok) return setMessage(payload.error ?? "Speaker mapping could not be saved.");
    setMessage("Speaker mapping saved as a new version.");
    router.refresh();
  }

  return (
    <>
      {recordingId ? (
        <section className="evidence-audio" aria-labelledby="source-audio-title">
          <div>
            <p className="eyebrow">Private source</p>
            <h2 id="source-audio-title">Interaction audio</h2>
          </div>
          {signedUrl ? (
            <audio ref={audioRef} controls src={signedUrl}>
              Audio playback is unavailable in this browser.
            </audio>
          ) : (
            <button
              className="button button-secondary"
              type="button"
              onClick={() => void preparePlayback()}
            >
              Prepare private playback
            </button>
          )}
        </section>
      ) : null}
      {segments.length ? (
        <section
          className="transcript-document"
          aria-labelledby="transcript-title"
          id="source-transcript"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">Source transcript</p>
              <h2 id="transcript-title">What was said</h2>
            </div>
            <span className="count-label">{segments.length} turns</span>
          </div>
          <ol className="transcript-turns">
            {segments.map((segment) => {
              const mapping = segment.providerSpeakerIdentifier
                ? mappingBySpeaker.get(segment.providerSpeakerIdentifier)
                : null;
              const speaker =
                mapping?.participantRole?.replaceAll("_", " ") ??
                segment.providerSpeakerIdentifier ??
                "Unattributed speaker";
              return (
                <li id={`segment-${segment.id}`} key={segment.id}>
                  <button
                    className="evidence-marker"
                    type="button"
                    onClick={() => seek(segment.startMilliseconds)}
                    disabled={!signedUrl}
                    aria-label={`Play source audio from ${timestamp(segment.startMilliseconds)}`}
                  >
                    {timestamp(segment.startMilliseconds)}
                  </button>
                  <div>
                    <p className="transcript-speaker">{speaker}</p>
                    <p>{segment.originalText}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}
      {speakers.length && transcriptionRunId ? (
        <section className="speaker-mapping-panel" aria-labelledby="speaker-mapping-title">
          <div>
            <p className="eyebrow">Interpretation boundary</p>
            <h2 id="speaker-mapping-title">Confirm speaker roles</h2>
            <p>
              Provider labels are not business identities. Saving creates a new mapping version; it
              does not alter source transcript evidence.
            </p>
          </div>
          {canProcessAudio ? (
            <form action={saveMapping} className="product-form">
              {speakers.map((speaker) => (
                <label key={speaker} className="form-field">
                  <span>{speaker}</span>
                  <select
                    name={`speaker:${speaker}`}
                    defaultValue={
                      mappingBySpeaker.get(speaker)
                        ? `${mappingBySpeaker.get(speaker)?.participantRole}|${mappingBySpeaker.get(speaker)?.participantId ?? ""}`
                        : ""
                    }
                  >
                    <option value="">Choose a role</option>
                    {participants.map((participant) => (
                      <option key={participant.id} value={`${participant.role}|${participant.id}`}>
                        {participant.displayLabel ?? participant.role.replaceAll("_", " ")}
                      </option>
                    ))}
                    <option value="unknown|">Unknown speaker</option>
                  </select>
                </label>
              ))}
              <button
                className="button button-primary form-field-wide"
                type="submit"
                disabled={saving}
              >
                {saving ? "Saving mapping…" : "Save speaker mapping"}
              </button>
            </form>
          ) : (
            <p className="security-note">
              Only the responsible representative or an organization admin can confirm speaker
              roles.
            </p>
          )}
        </section>
      ) : null}
      {message ? (
        <p className="auth-message" role="status">
          {message}
        </p>
      ) : null}
    </>
  );
}
