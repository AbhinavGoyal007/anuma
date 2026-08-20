"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

/**
 * The behaviour a side sheet needs before it counts as a dialog.
 *
 * The panel itself is server-rendered — the evidence in it comes from the same
 * population the number came from, and none of that should wait for
 * JavaScript. What has to be client-side is the part that makes it a real modal
 * rather than a box that happens to sit on top: focus moving in, Tab staying
 * in, Escape and the backdrop closing it, and focus returning to the control
 * that opened it.
 *
 * Without focus return, a keyboard reader who opens the third action card and
 * closes it is dropped back at the top of the document and has to tab through
 * the whole page to get where they were. That is the difference between a
 * drawer and an obstacle.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function DrawerShell({
  closeHref,
  /** The cohort key in the URL, used to find the control that opened this. */
  triggerKey,
  label,
  children,
}: {
  closeHref: string;
  triggerKey: string;
  label: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const panel = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    // Remembered as a selector rather than a node: the page re-renders on
    // navigation, so the original element is gone by the time focus returns.
    const selector = `a[href*="drawer=${encodeURIComponent(triggerKey).replaceAll('"', "")}"]`;
    router.push(closeHref, { scroll: false });
    // After the navigation settles, put the caret back where the reader left it.
    window.setTimeout(() => {
      const trigger = document.querySelector<HTMLElement>(selector);
      trigger?.focus();
    }, 120);
  }, [closeHref, router, triggerKey]);

  useEffect(() => {
    const node = panel.current;
    if (!node) return;

    const previous = document.activeElement as HTMLElement | null;
    node.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    // Everything behind the sheet leaves the tab order and the accessibility
    // tree while it is open.
    const siblings = [...(node.closest(".ip-drawer-bg")?.parentElement?.children ?? [])].filter(
      (element) => element !== node.closest(".ip-drawer-bg"),
    ) as HTMLElement[];
    for (const sibling of siblings) sibling.setAttribute("inert", "");

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      for (const sibling of siblings) sibling.removeAttribute("inert");
      if (previous?.isConnected) previous.focus();
    };
  }, [close]);

  return (
    <aside
      className="ip-drawer-bg"
      onClick={(event) => {
        // Only the backdrop itself, never a click that happened to bubble.
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="ip-drawer" role="dialog" aria-modal="true" aria-label={label} ref={panel}>
        {children}
      </div>
    </aside>
  );
}
