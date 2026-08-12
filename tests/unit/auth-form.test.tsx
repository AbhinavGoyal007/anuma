import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));

import { AuthForm } from "@/components/auth/auth-form";

describe("AuthForm", () => {
  it("renders sign-in credentials with accessible labels", () => {
    render(<AuthForm mode="sign-in" />);

    expect(screen.getByLabelText("Email address")).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("uses account-creation wording and a new-password field for sign-up", () => {
    render(<AuthForm mode="sign-up" />);

    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled();
  });
});
