import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ recordingId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { recordingId } = await params;
  if (!z.string().uuid().safeParse(recordingId).success) {
    return NextResponse.json({ error: "The recording identifier is invalid." }, { status: 400 });
  }

  // The normal RLS client proves the caller may read this recording. The privileged client is
  // used only after that relationship check to mint a short-lived private Storage URL.
  const scopedClient = await createClient();
  const { data: recording, error } = await scopedClient
    .from("recordings")
    .select("id, storage_bucket, storage_object_path, status")
    .eq("id", recordingId)
    .eq("status", "uploaded")
    .maybeSingle();
  if (error || !recording)
    return NextResponse.json({ error: "Audio is unavailable." }, { status: 404 });

  const { data, error: signError } = await createAdminClient()
    .storage.from(recording.storage_bucket)
    .createSignedUrl(recording.storage_object_path, 60);
  if (signError || !data?.signedUrl) {
    return NextResponse.json({ error: "Private playback could not be prepared." }, { status: 500 });
  }
  return NextResponse.json({ signedUrl: data.signedUrl, expiresInSeconds: 60 });
}
