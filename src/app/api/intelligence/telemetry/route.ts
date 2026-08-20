import { NextResponse } from "next/server";

import { getApplicationContext } from "@/modules/identity/application-context";
import { USAGE_EVENTS, type UsageEventName } from "@/modules/intelligence/pilot";
import { recordUsageEvent } from "@/modules/intelligence/pilot-store";
import { ensureSessionId, isUuid } from "@/modules/intelligence/session";

/**
 * Where a pilot event is actually written.
 *
 * The endpoint derives the organization, the membership and the session from
 * the authenticated server context and the session cookie. None of the three
 * may be supplied by the browser: a hidden field or a JSON body naming another
 * membership would let one manager attribute activity to a colleague, and every
 * adoption number in the pilot would become unfalsifiable.
 *
 * What the client may say is which control it activated. That is the one thing
 * the server cannot know, and it is deliberately the only thing accepted.
 */

const ALLOWED = new Set<string>(USAGE_EVENTS);

export async function POST(request: Request): Promise<NextResponse> {
  const context = await getApplicationContext();
  if (!context?.current) {
    return NextResponse.json({ accepted: false }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ accepted: false }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  const eventName = typeof payload.event === "string" ? payload.event : "";
  if (!ALLOWED.has(eventName)) {
    return NextResponse.json({ accepted: false }, { status: 400 });
  }

  const clientEventId = typeof payload.clientEventId === "string" ? payload.clientEventId : "";
  if (!isUuid(clientEventId)) {
    return NextResponse.json({ accepted: false }, { status: 400 });
  }

  const text = (key: string): string | null => {
    const value = payload[key];
    return typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : null;
  };
  const filters =
    payload.filters && typeof payload.filters === "object" && !Array.isArray(payload.filters)
      ? Object.fromEntries(
          Object.entries(payload.filters as Record<string, unknown>)
            .filter(([, value]) => typeof value === "string")
            .map(([key, value]) => [key.slice(0, 40), String(value).slice(0, 200)]),
        )
      : {};

  // Accepting the event refreshes the rolling session window.
  const sessionId = await ensureSessionId();

  await recordUsageEvent({
    organizationId: context.current.organization.id,
    membershipId: context.current.membership.id,
    sessionId,
    clientEventId,
    page: text("page") ?? "intelligence",
    eventName: eventName as UsageEventName,
    objectType: text("objectType"),
    objectKey: text("objectKey"),
    cohortKey: text("cohortKey"),
    conversationId: text("conversationId"),
    scopeFingerprint: text("scopeFingerprint"),
    filters,
  });

  // Always 202: a telemetry failure is never the browser's problem to solve,
  // and a retry with the same client_event_id is idempotent by construction.
  return NextResponse.json({ accepted: true }, { status: 202 });
}
