"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A selection that changes what is shown, not what is loaded.
 *
 * Choosing a Needs tab or an execution stage does not change the population —
 * every panel was computed from rows already in memory. Routing that click
 * through the server made a purely local choice cost a full round trip and a
 * blank flash, which teaches a reader that the product is slow and that the tab
 * is doing something significant. It is not.
 *
 * The controls and the panels are both server-rendered and handed in as
 * children: this component only decides which panel is visible and keeps the
 * address bar in step, so the view stays shareable. Without JavaScript the
 * controls are ordinary links to the same page and everything still works —
 * which is why they are links rather than buttons.
 */

export function LocalSwitch({
  param,
  initial,
  children,
}: {
  /** The query parameter this selection lives in, for shareable URLs. */
  param: string;
  initial: string;
  children: React.ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(initial);

  useEffect(() => {
    const node = root.current;
    if (!node) return;

    for (const panel of node.querySelectorAll<HTMLElement>("[data-local-panel]")) {
      panel.hidden = panel.dataset.localPanel !== active;
    }
    for (const control of node.querySelectorAll<HTMLElement>("[data-local-key]")) {
      const selected = control.dataset.localKey === active;
      control.classList.toggle("ip-tab--active", selected && control.classList.contains("ip-tab"));
      control.classList.toggle(
        "ip-stage--active",
        selected && control.classList.contains("ip-stage"),
      );
      control.classList.toggle(
        "ip-node--active",
        selected && control.classList.contains("ip-node"),
      );
      if (selected) control.setAttribute("aria-current", "true");
      else control.removeAttribute("aria-current");
    }
  }, [active]);

  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const onClick = (event: MouseEvent) => {
      const control = (event.target as HTMLElement | null)?.closest<HTMLElement>(
        "[data-local-key]",
      );
      if (!control || !node.contains(control)) return;
      // Let a modified click open a new tab, exactly as it would on any link.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
        return;
      }
      const key = control.dataset.localKey;
      if (!key) return;
      event.preventDefault();
      setActive(key);
      // replaceState, not push: a tab is a view of the same page, and filling
      // the back button with six of them makes leaving the page a chore.
      const url = new URL(window.location.href);
      url.searchParams.set(param, key);
      window.history.replaceState(window.history.state, "", url.toString());
    };
    node.addEventListener("click", onClick);
    return () => node.removeEventListener("click", onClick);
  }, [param]);

  return (
    <div className="ip-local" ref={root}>
      {children}
    </div>
  );
}
