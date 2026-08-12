import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmptyState } from "@/components/ui/empty-state";

describe("EmptyState", () => {
  it("shows an honest not-yet-available state without placeholder analytics", () => {
    render(<EmptyState description="Evidence will appear after processing." signal="evidence" />);

    expect(screen.getByText("Evidence foundation")).toBeInTheDocument();
    expect(screen.getByText("Evidence will appear after processing.")).toBeInTheDocument();
  });
});
