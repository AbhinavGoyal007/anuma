import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ recordingId: string }> };

export async function POST(_request: Request, { params }: RouteContext) {
  const { recordingId } = await params;
  if (!z.string().uuid().safeParse(recordingId).success) {
    return NextResponse.json({ error: "The recording identifier is invalid." }, { status: 400 });
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("finalize_recording_upload", {
    p_recording_id: recordingId,
  });
  if (error) {
    console.error("Recording finalization failed", { code: error.code, message: error.message });
    return NextResponse.json(
      { error: "The private audio upload could not be finalized." },
      { status: error.code === "42501" ? 403 : 400 },
    );
  }
  return NextResponse.json({ status: "uploaded" });
}
