import { NextResponse, type NextRequest } from "next/server";

import { purgeExpiredAudio } from "@/modules/transcription/retention";

/**
 * Scheduled deletion of expired source audio.
 *
 * Invoked by Vercel Cron, which sends `Authorization: Bearer $CRON_SECRET`. The
 * check is not optional: without it this is an unauthenticated endpoint that
 * deletes customer recordings.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("Audio retention was invoked without CRON_SECRET configured.");
    return NextResponse.json({ error: "Not configured." }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  try {
    const result = await purgeExpiredAudio();
    console.info("Audio retention sweep", result);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("Audio retention sweep failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "The retention sweep failed." }, { status: 500 });
  }
}
