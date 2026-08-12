import { NextResponse } from "next/server";
import { z } from "zod";

import { startTranscriptionRun } from "@/lib/recordings/start-transcription-run";
import { createBearerClient, readBearerToken } from "@/lib/supabase/bearer";

type RouteContext = { params: Promise<{ recordingId: string }> };

/**
 * Starts transcription for a caller authenticated by bearer token.
 *
 * The capture app performs `prepare_recording_upload`, the storage upload and
 * `finalize_recording_upload` directly against Supabase, because RLS already
 * authorizes those. It cannot perform this last step: starting the durable
 * workflow only happens inside this application. So this route exists purely to
 * accept a token where the browser route accepts a cookie — the run it requests
 * and the workflow it starts are the same ones.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const { recordingId } = await params;
  if (!z.string().uuid().safeParse(recordingId).success) {
    return NextResponse.json({ error: "The recording identifier is invalid." }, { status: 400 });
  }

  const accessToken = readBearerToken(request);
  if (!accessToken) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  const supabase = createBearerClient(accessToken);

  // getClaims verifies the token. Do not trust getSession for protection decisions.
  const { data: claims, error: claimsError } = await supabase.auth.getClaims(accessToken);
  if (claimsError || !claims) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  const result = await startTranscriptionRun(supabase, recordingId);
  if (!result.ok) {
    // A run that already exists is the ordinary shape of a retry from a phone
    // whose first request succeeded but whose reply was lost. 409 lets the
    // upload queue treat it as done instead of as a permanent failure and
    // showing the rep "upload failed" for a recording that is being processed.
    const status = result.alreadyRunning ? 409 : result.status;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json(
    { transcriptionRunId: result.runId, status: "pending" },
    { status: 202 },
  );
}
