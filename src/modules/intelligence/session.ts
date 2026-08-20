import "server-only";

import { cookies } from "next/headers";

/**
 * The browsing session a pilot event belongs to.
 *
 * A real UUID in an HttpOnly cookie, issued by the server. The previous
 * implementation passed a scope-derived string where the column expects a UUID,
 * so every insert failed — and because telemetry is deliberately best-effort,
 * it failed silently. The product looked healthy while the pilot measured
 * nothing, which is the worst of both.
 *
 * Scope identity and session identity are separate things: two managers looking
 * at the same filters are one scope and two sessions, and one manager returning
 * after lunch is one session or two depending on the clock, not on the filters.
 */

export const SESSION_COOKIE = "anuma_intelligence_session";

/** Rolling: each accepted event pushes the expiry out again. */
const SESSION_MINUTES = 30;

export async function readSessionId(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(SESSION_COOKIE)?.value ?? null;
  return value && isUuid(value) ? value : null;
}

/**
 * The session for this request, minting one where none exists.
 *
 * Only ever called from a route handler or a server action — never while
 * rendering — because setting a cookie during render is not allowed and, more
 * importantly, a render can happen for a page nobody visited.
 */
export async function ensureSessionId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(SESSION_COOKIE)?.value;
  const sessionId = existing && isUuid(existing) ? existing : crypto.randomUUID();
  store.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MINUTES * 60,
  });
  return sessionId;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}
