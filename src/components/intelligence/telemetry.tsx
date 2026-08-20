"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useMemo, useRef } from "react";

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
 *
 * Where the reader was — page, scope, filters — comes from context rather than
 * from a prop threaded through nine components. A control only has to say what
 * it is.
 */

export type ControlEvent = {
  event: UsageEventName;
  objectType?: string;
  objectKey?: string;
  cohortKey?: string;
  conversationId?: string;
};

type Scope = { page: string; scopeFingerprint: string; filters: Record<string, string> };

const ScopeContext = createContext<Scope>({
  page: "intelligence",
  scopeFingerprint: "",
  filters: {},
});

/** Fire-and-forget. Telemetry must never delay or block a navigation. */
export function emitTelemetry(payload: ControlEvent & Partial<Scope>): void {
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
 * What the reader is looking at, and one page view for it.
 *
 * The provider wraps server-rendered children, which stay server-rendered:
 * they arrive as an already-built prop, not as something this component
 * renders.
 */
export function TelemetryScope({
  page,
  scopeFingerprint,
  filters,
  drawerKey,
  children,
}: Scope & {
  /** The cohort visible in the URL, if any. */
  drawerKey: string | null;
  children: React.ReactNode;
}) {
  const scope = useMemo(
    () => ({ page, scopeFingerprint, filters }),
    [page, scopeFingerprint, filters],
  );
  return (
    <ScopeContext.Provider value={scope}>
      <PageView scope={scope} drawerKey={drawerKey} />
      {children}
    </ScopeContext.Provider>
  );
}

/**
 * One page view per committed page.
 *
 * Keyed on the identity of what is actually on screen, so a filter change that
 * genuinely produces a different page records a view, while a re-render does
 * not.
 */
function PageView({ scope, drawerKey }: { scope: Scope; drawerKey: string | null }) {
  const identity = `${scope.page}:${scope.scopeFingerprint}:${drawerKey ?? ""}`;
  const recorded = useRef<string | null>(null);

  useEffect(() => {
    if (recorded.current === identity) return;
    recorded.current = identity;
    emitTelemetry({ ...scope, event: "intelligence_page_viewed" });
    if (drawerKey) {
      // The drawer is visibly committed. What is deliberately *not* recorded is
      // the control that would normally have opened it — arriving by a shared
      // link is not a click on a priority action.
      emitTelemetry({
        ...scope,
        event: "evidence_drawer_opened",
        objectType: "cohort",
        objectKey: drawerKey,
        cohortKey: drawerKey,
      });
    }
  }, [identity, scope, drawerKey]);

  return null;
}

/**
 * A link that records the activation it caused.
 *
 * Still an ordinary `next/link`: it navigates without JavaScript, honours
 * modified clicks, and never waits for the telemetry request. A server
 * component may render it — everything it needs is serialisable.
 */
export function TelemetryLink({
  telemetry,
  children,
  onClick,
  ...props
}: React.ComponentProps<typeof Link> & { telemetry: ControlEvent }) {
  const scope = useContext(ScopeContext);
  return (
    <Link
      {...props}
      onClick={(event) => {
        onClick?.(event);
        // A modified click opens a tab rather than navigating here; the
        // destination will record its own page view.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        emitTelemetry({ ...scope, ...telemetry });
      }}
    >
      {children}
    </Link>
  );
}

/**
 * A GET form that records the selection it applied.
 *
 * Used by the dimensions with too many values to be chips. Still an ordinary
 * form: without JavaScript it submits exactly as before, and the handler never
 * delays the submission.
 */
export function TelemetryForm({
  telemetry,
  children,
  ...props
}: React.ComponentProps<"form"> & { telemetry: ControlEvent }) {
  const scope = useContext(ScopeContext);
  return (
    <form {...props} onSubmit={() => emitTelemetry({ ...scope, ...telemetry })}>
      {children}
    </form>
  );
}

/**
 * The same recording for a control that is not a link.
 *
 * Used by the local tab switches, which intercept their own clicks.
 */
export function useTelemetry(): (payload: ControlEvent) => void {
  const scope = useContext(ScopeContext);
  return (payload: ControlEvent) => emitTelemetry({ ...scope, ...payload });
}
