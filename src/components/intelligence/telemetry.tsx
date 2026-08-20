"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import type { UsageEventName } from "@/modules/intelligence/pilot";

/**
 * Pilot events, recorded only for things that actually happened.
 *
 * The previous implementation wrote events while rendering the page on the
 * server. Next prefetches linked routes, so a page nobody visited could record
 * a view, and a drawer nobody opened could record an evidence open — the pilot
 * would have been measuring the router.
 *
 * So: a page view is emitted after the page has committed in a real browser,
 * and a control's event is emitted when somebody activates that control. A
 * shared link therefore records a page view and, if a drawer is in the URL, an
 * evidence open — but never the click that would have produced it, because that
 * click never happened.
 */

export type TelemetryPayload = {
  event: UsageEventName;
  page: string;
  objectType?: string;
  objectKey?: string;
  cohortKey?: string;
  conversationId?: string;
  scopeFingerprint?: string;
  filters?: Record<string, string>;
};

/** Fire-and-forget. Telemetry must never delay or block a navigation. */
export function emitTelemetry(payload: TelemetryPayload): void {
  const body = JSON.stringify({ ...payload, clientEventId: crypto.randomUUID() });
  try {
    // keepalive so an event survives the navigation that caused it.
    void fetch("/api/intelligence/telemetry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // A pilot measurement failing is never the reader's problem.
  }
}

/**
 * One page view per committed page.
 *
 * Keyed on the identity of what is actually on screen, so a filter change that
 * genuinely produces a different page records a view, while a re-render does
 * not.
 */
export function IntelligencePageTracker({
  page,
  scopeFingerprint,
  filters,
  drawerKey,
}: {
  page: string;
  scopeFingerprint: string;
  filters: Record<string, string>;
  /** The cohort visible in the URL, if any. */
  drawerKey: string | null;
}) {
  const identity = `${page}:${scopeFingerprint}:${drawerKey ?? ""}`;
  const recorded = useRef<string | null>(null);

  useEffect(() => {
    if (recorded.current === identity) return;
    recorded.current = identity;
    emitTelemetry({ event: "intelligence_page_viewed", page, scopeFingerprint, filters });
    if (drawerKey) {
      // The drawer is visibly committed. What is deliberately *not* recorded is
      // the control that would normally have opened it — arriving by a shared
      // link is not a click on a priority action.
      emitTelemetry({
        event: "evidence_drawer_opened",
        page,
        scopeFingerprint,
        filters,
        objectType: "cohort",
        objectKey: drawerKey,
        cohortKey: drawerKey,
      });
    }
  }, [identity, page, scopeFingerprint, filters, drawerKey]);

  return null;
}

/**
 * A link that records the activation it caused.
 *
 * Still an ordinary `next/link`: it navigates without JavaScript, honours
 * modified clicks, and never waits for the telemetry request.
 */
export function TelemetryLink({
  telemetry,
  children,
  onClick,
  ...props
}: React.ComponentProps<typeof Link> & { telemetry: TelemetryPayload }) {
  return (
    <Link
      {...props}
      onClick={(event) => {
        onClick?.(event);
        // A modified click opens a tab rather than navigating here; the
        // destination will record its own page view.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        emitTelemetry(telemetry);
      }}
    >
      {children}
    </Link>
  );
}
