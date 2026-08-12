"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

const MAX_FILE_SIZE = 104_857_600;
const MAX_DURATION_MS = 7_200_000;
const acceptedAudioTypes = [
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
] as const;

type AcceptedAudioType = (typeof acceptedAudioTypes)[number];

type AudioCapturePanelProps = {
  conversationId: string;
  consentAllowsRecording: boolean;
  canProcessAudio: boolean;
};

type PendingAudio = {
  file: File;
  source: "browser_recording" | "existing_upload";
  url: string;
  durationMilliseconds: number;
};

function displayError(error: unknown): string {
  return error instanceof Error ? error.message : "The audio could not be processed.";
}

export function normalizeAudioMimeType(value: string): AcceptedAudioType | null {
  const normalized = value.split(";", 1)[0]?.trim().toLowerCase();
  return acceptedAudioTypes.find((candidate) => candidate === normalized) ?? null;
}

export function preferredRecordingConstraints(): MediaStreamConstraints {
  return {
    audio: {
      autoGainControl: { ideal: true },
      channelCount: { ideal: 1 },
      echoCancellation: { ideal: true },
      noiseSuppression: { ideal: true },
    },
  };
}

async function getDurationMilliseconds(file: Blob): Promise<number> {
  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise<number>((resolve, reject) => {
      const audio = document.createElement("audio");
      audio.preload = "metadata";
      audio.onloadedmetadata = () => {
        const duration = Math.round(audio.duration * 1000);
        Number.isFinite(duration) && duration > 0
          ? resolve(duration)
          : reject(new Error("Audio duration is unavailable."));
      };
      audio.onerror = () => reject(new Error("This browser could not read the selected audio."));
      audio.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function recorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
}

export function AudioCapturePanel({
  conversationId,
  consentAllowsRecording,
  canProcessAudio,
}: AudioCapturePanelProps) {
  const router = useRouter();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef<number | null>(null);
  const saveInFlightRef = useRef(false);
  const startInFlightRef = useRef(false);
  const [pending, setPending] = useState<PendingAudio | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingElapsedMilliseconds, setRecordingElapsedMilliseconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const supported =
    typeof window !== "undefined" &&
    "mediaDevices" in navigator &&
    Boolean(navigator.mediaDevices.getUserMedia) &&
    typeof MediaRecorder !== "undefined";
  const enabled = consentAllowsRecording && canProcessAudio;

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (pending) URL.revokeObjectURL(pending.url);
    },
    [pending],
  );

  useEffect(() => {
    if (!recording || recordingStartedAtRef.current === null) return;
    const updateElapsed = () =>
      setRecordingElapsedMilliseconds(
        Math.max(0, Date.now() - (recordingStartedAtRef.current ?? Date.now())),
      );
    updateElapsed();
    const interval = window.setInterval(updateElapsed, 1_000);
    return () => window.clearInterval(interval);
  }, [recording]);

  useEffect(() => {
    if (!recording) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [recording]);

  function replacePending(next: PendingAudio | null) {
    setPending((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return next;
    });
  }

  async function beginRecording() {
    setMessage(null);
    if (!enabled || !supported || startInFlightRef.current || recording) return;
    startInFlightRef.current = true;
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(preferredRecordingConstraints());
      } catch (error) {
        if (!(error instanceof DOMException) || error.name !== "OverconstrainedError") throw error;
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      streamRef.current = stream;
      chunksRef.current = [];
      const type = recorderMimeType();
      const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;
        streamRef.current = null;
        recordingStartedAtRef.current = null;
        setRecording(false);
        const mimeType = normalizeAudioMimeType(recorder.mimeType) ?? "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (!blob.size)
          return setMessage("No audio was captured. Check microphone access and try again.");
        try {
          const durationMilliseconds = await getDurationMilliseconds(blob);
          if (blob.size > MAX_FILE_SIZE || durationMilliseconds > MAX_DURATION_MS) {
            return setMessage("Audio must be no larger than 100 MB and no longer than two hours.");
          }
          const extension = mimeType === "audio/mp4" ? "m4a" : "webm";
          const file = new File([blob], `interaction.${extension}`, {
            type: mimeType,
          });
          replacePending({
            file,
            source: "browser_recording",
            url: URL.createObjectURL(file),
            durationMilliseconds,
          });
        } catch (error) {
          setMessage(displayError(error));
        }
      };
      recorder.start(1000);
      recordingStartedAtRef.current = Date.now();
      setRecordingElapsedMilliseconds(0);
      setRecording(true);
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      setMessage(
        name === "NotAllowedError"
          ? "Microphone permission was not granted. You can select an existing audio file instead."
          : "Microphone capture is unavailable. You can select an existing audio file instead.",
      );
    } finally {
      startInFlightRef.current = false;
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
  }

  async function selectFile(file: File | undefined) {
    setMessage(null);
    if (!file) return;
    const mimeType = normalizeAudioMimeType(file.type);
    if (!mimeType) {
      return setMessage("Choose WebM, MP4/M4A, MP3, WAV, or OGG audio.");
    }
    if (file.size > MAX_FILE_SIZE) return setMessage("Audio must be no larger than 100 MB.");
    try {
      const durationMilliseconds = await getDurationMilliseconds(file);
      if (durationMilliseconds > MAX_DURATION_MS)
        return setMessage("Audio must be no longer than two hours.");
      replacePending({
        file: new File([file], file.name, { type: mimeType }),
        source: "existing_upload",
        url: URL.createObjectURL(file),
        durationMilliseconds,
      });
    } catch (error) {
      setMessage(displayError(error));
    }
  }

  async function saveAndProcess() {
    if (!pending || !enabled || saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const preparedResponse = await fetch(
        `/api/conversations/${conversationId}/recordings/prepare`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mimeType: pending.file.type,
            fileSizeBytes: pending.file.size,
            durationMilliseconds: pending.durationMilliseconds,
            captureSource: pending.source,
            originalFilename: pending.source === "existing_upload" ? pending.file.name : undefined,
          }),
        },
      );
      const prepared = (await preparedResponse.json()) as {
        recording_id?: string;
        storage_bucket?: string;
        storage_object_path?: string;
        error?: string;
      };
      if (
        !preparedResponse.ok ||
        !prepared.recording_id ||
        !prepared.storage_bucket ||
        !prepared.storage_object_path
      ) {
        throw new Error(prepared.error ?? "Audio could not be prepared.");
      }

      const { error: uploadError } = await createClient()
        .storage.from(prepared.storage_bucket)
        .upload(prepared.storage_object_path, pending.file, {
          cacheControl: "3600",
          contentType: pending.file.type,
          upsert: false,
        });
      if (uploadError) throw new Error("Private audio upload was rejected. Please try again.");

      const finalized = await fetch(`/api/recordings/${prepared.recording_id}/finalize`, {
        method: "POST",
      });
      const finalPayload = (await finalized.json()) as { error?: string };
      if (!finalized.ok)
        throw new Error(finalPayload.error ?? "Audio upload could not be finalized.");

      const transcription = await fetch(`/api/recordings/${prepared.recording_id}/transcription`, {
        method: "POST",
      });
      const transcriptionPayload = (await transcription.json()) as { error?: string };
      if (!transcription.ok)
        throw new Error(
          transcriptionPayload.error ?? "Audio is secured, but transcription could not start.",
        );

      replacePending(null);
      setMessage("Audio secured. Transcription has started and continues if you leave this page.");
      router.refresh();
    } catch (error) {
      setMessage(displayError(error));
    } finally {
      saveInFlightRef.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="audio-capture-panel" aria-labelledby="audio-capture-title">
      <div>
        <p className="eyebrow">Audio evidence</p>
        <h2 id="audio-capture-title">Add the interaction audio</h2>
        <p>
          Audio stays private. It is verified against this interaction before transcription is
          requested.
        </p>
        <p className="audio-capture-guidance">
          Place the device where both customer and representative can be heard clearly. Keep the
          microphone uncovered and reduce nearby audio where possible.
        </p>
      </div>
      {!consentAllowsRecording ? (
        <p className="security-note" role="status">
          Customer recording consent must be granted or marked not required before audio can be
          added.
        </p>
      ) : !canProcessAudio ? (
        <p className="security-note" role="status">
          Only the responsible representative or an organization admin can add audio.
        </p>
      ) : (
        <div className="audio-capture-controls">
          {supported ? (
            <button
              className="button button-primary"
              type="button"
              onClick={recording ? stopRecording : beginRecording}
              disabled={busy}
              aria-pressed={recording}
            >
              {recording ? "Stop recording" : "Record audio"}
            </button>
          ) : (
            <p className="security-note">
              Microphone recording is not supported by this browser. Select an existing audio file
              instead.
            </p>
          )}
          <label className="button button-secondary file-button">
            Select audio file
            <input
              type="file"
              accept="audio/webm,audio/mp4,audio/mpeg,audio/wav,audio/x-wav,audio/ogg"
              onChange={(event) => void selectFile(event.target.files?.[0])}
              disabled={busy || recording}
            />
          </label>
        </div>
      )}
      {recording ? (
        <p className="recording-status" role="status">
          Recording {Math.floor(recordingElapsedMilliseconds / 60_000)}:
          {String(Math.floor((recordingElapsedMilliseconds % 60_000) / 1_000)).padStart(2, "0")}.
          Keep ANUMA open and the screen awake while recording.
        </p>
      ) : null}
      {pending ? (
        <div className="audio-preview">
          <div>
            <strong>
              {pending.source === "browser_recording" ? "Recorded audio" : pending.file.name}
            </strong>
            <span>{Math.ceil(pending.durationMilliseconds / 1000)} seconds · ready to secure</span>
          </div>
          <audio controls src={pending.url} preload="metadata">
            Audio preview is unavailable in this browser.
          </audio>
          <div className="audio-preview-actions">
            <button
              className="button button-quiet"
              type="button"
              onClick={() => replacePending(null)}
              disabled={busy}
            >
              Discard
            </button>
            <button
              className="button button-primary"
              type="button"
              onClick={() => void saveAndProcess()}
              disabled={busy}
            >
              {busy ? "Securing audio…" : "Save and process"}
            </button>
          </div>
        </div>
      ) : null}
      {message ? (
        <p className="auth-message" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
