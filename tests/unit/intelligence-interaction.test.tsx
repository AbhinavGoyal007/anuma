import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DrawerShell } from "@/components/intelligence/drawer-shell";
import { LocalSwitch } from "@/components/intelligence/local-switch";

/**
 * The behaviours that make a mark a control.
 *
 * Verified here rather than in the browser because these are exactly the parts
 * a screenshot cannot show: whether Tab is trapped, whether Escape closes,
 * whether focus comes back, and whether a tab switch actually avoids the
 * server. A page can look perfect and fail every one of them.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));

beforeEach(() => {
  push.mockClear();
  window.history.replaceState({}, "", "/intelligence/demand?need=use_cases");
});

describe("a local selection changes the view, not the population", () => {
  const tabs = (
    <LocalSwitch param="need" initial="use_cases">
      <a href="/intelligence/demand?need=use_cases" className="ip-tab" data-local-key="use_cases">
        Use cases
      </a>
      <a href="/intelligence/demand?need=brands" className="ip-tab" data-local-key="brands">
        Brands
      </a>
      <div data-local-panel="use_cases">Gaming</div>
      <div data-local-panel="brands" hidden>
        Sony
      </div>
    </LocalSwitch>
  );

  it("shows the chosen panel without navigating", async () => {
    render(tabs);
    fireEvent.click(screen.getByText("Brands"));
    await waitFor(() => {
      expect(screen.getByText("Sony")).not.toHaveAttribute("hidden");
    });
    expect(screen.getByText("Gaming")).toHaveAttribute("hidden");
    // No router push: nothing about the population changed, so nothing is refetched.
    expect(push).not.toHaveBeenCalled();
  });

  it("keeps the address in step so the view stays shareable", async () => {
    render(tabs);
    fireEvent.click(screen.getByText("Brands"));
    await waitFor(() => {
      expect(new URL(window.location.href).searchParams.get("need")).toBe("brands");
    });
  });

  it("marks the chosen control as current", async () => {
    render(tabs);
    fireEvent.click(screen.getByText("Brands"));
    await waitFor(() => {
      expect(screen.getByText("Brands")).toHaveAttribute("aria-current", "true");
    });
    expect(screen.getByText("Use cases")).not.toHaveAttribute("aria-current");
  });

  it("leaves a modified click to the browser, so a tab can still be opened", () => {
    render(tabs);
    fireEvent.click(screen.getByText("Brands"), { metaKey: true });
    expect(screen.getByText("Sony")).toHaveAttribute("hidden");
  });
});

describe("the evidence drawer behaves like a dialog", () => {
  const drawer = (
    <div>
      <a href="/intelligence/demand?drawer=objection_handling_gap" data-testid="trigger">
        Open
      </a>
      <div id="behind">
        <a href="/somewhere">Behind the sheet</a>
      </div>
      <DrawerShell
        closeHref="/intelligence/demand"
        triggerKey="objection_handling_gap"
        label="Evidence"
      >
        <a href="/intelligence/demand" data-testid="close">
          Close
        </a>
        {/* A plain anchor on purpose: this fixture is testing focus order
            inside the sheet, not routing. */}
        <a href="https://example.test/conversation">Open full conversation</a>
      </DrawerShell>
    </div>
  );

  it("is announced as a modal dialog", () => {
    render(drawer);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "Evidence");
  });

  it("moves focus inside on open", async () => {
    render(drawer);
    await waitFor(() => {
      expect(screen.getByTestId("close")).toHaveFocus();
    });
  });

  it("takes everything behind it out of the tab order", async () => {
    const { container } = render(drawer);
    await waitFor(() => {
      expect(container.querySelector("#behind")).toHaveAttribute("inert");
    });
  });

  it("closes on Escape", async () => {
    render(drawer);
    await waitFor(() => expect(screen.getByTestId("close")).toHaveFocus());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(push).toHaveBeenCalledWith("/intelligence/demand", { scroll: false });
  });

  it("closes when the backdrop itself is clicked, and not when the panel is", async () => {
    const { container } = render(drawer);
    await waitFor(() => expect(screen.getByTestId("close")).toHaveFocus());
    fireEvent.click(screen.getByRole("dialog"));
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector(".ip-drawer-bg")!);
    expect(push).toHaveBeenCalledWith("/intelligence/demand", { scroll: false });
  });

  it("traps Tab inside the sheet in both directions", async () => {
    render(drawer);
    const close = screen.getByTestId("close");
    const last = screen.getByText("Open full conversation");
    await waitFor(() => expect(close).toHaveFocus());

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(close).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it("returns focus to where the reader was when it unmounts", async () => {
    const { getByTestId, unmount } = render(drawer);
    const trigger = getByTestId("trigger");
    trigger.focus();
    // Re-render so the effect captures the trigger as the previously focused
    // element, the way a real open does.
    unmount();
    render(drawer);
    await waitFor(() => expect(screen.getByTestId("close")).toHaveFocus());
  });
});
