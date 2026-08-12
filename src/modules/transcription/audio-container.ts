/**
 * The filename an upload must carry for a transcription API to accept it.
 *
 * OpenAI infers the container from the filename extension, not from the MIME
 * type or the bytes. Recordings reach this product in more than one container —
 * browser captures are Ogg Opus, phone captures are AAC in MP4 — and sending an
 * Opus payload named `audio.m4a` is rejected outright as a corrupt file.
 *
 * Free of server-only imports so the mapping can be tested.
 */
export function audioFileNameFor(mimeType: string): string {
  const mime = mimeType.toLowerCase();
  if (mime.includes("ogg") || mime.includes("opus")) return "audio.ogg";
  if (mime.includes("webm")) return "audio.webm";
  if (mime.includes("wav")) return "audio.wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "audio.mp3";
  return "audio.m4a";
}
