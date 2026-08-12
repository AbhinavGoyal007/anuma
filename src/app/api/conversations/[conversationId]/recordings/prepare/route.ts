import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  mimeType: z.enum([
    "audio/webm",
    "audio/mp4",
    "audio/mpeg",
    "audio/wav",
    "audio/x-wav",
    "audio/ogg",
  ]),
  fileSizeBytes: z.number().int().min(1).max(104_857_600),
  durationMilliseconds: z.number().int().min(1).max(7_200_000),
  captureSource: z.enum(["browser_recording", "existing_upload"]),
  originalFilename: z.string().trim().max(160).optional(),
});

type RouteContext = { params: Promise<{ conversationId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const payload = requestSchema.safeParse(await request.json().catch(() => null));
  const { conversationId } = await params;
  if (!z.string().uuid().safeParse(conversationId).success || !payload.success) {
    return NextResponse.json({ error: "The audio details are invalid." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("prepare_recording_upload", {
    p_conversation_id: conversationId,
    p_mime_type: payload.data.mimeType,
    p_file_size_bytes: payload.data.fileSizeBytes,
    p_duration_milliseconds: payload.data.durationMilliseconds,
    p_capture_source: payload.data.captureSource,
    p_original_filename: payload.data.originalFilename ?? undefined,
  });
  if (error || !data?.[0]) {
    console.error("Recording preparation failed", { code: error?.code, message: error?.message });
    return NextResponse.json(
      { error: "Audio could not be prepared for this interaction." },
      { status: error?.code === "42501" ? 403 : 400 },
    );
  }
  return NextResponse.json(data[0]);
}
