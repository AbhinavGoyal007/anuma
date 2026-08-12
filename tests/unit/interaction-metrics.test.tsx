import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { InteractionMetrics } from "@/components/conversations/interaction-metrics";

describe("InteractionMetrics", () => {
  it("shows only deterministic participant metrics with an estimated-WPM qualification", () => {
    render(
      <InteractionMetrics
        metrics={[
          { key: "interaction_duration", value: 504_000, unit: "milliseconds" },
          { key: "representative_talk_share", value: 0.58, unit: "ratio" },
          { key: "customer_talk_share", value: 0.42, unit: "ratio" },
          { key: "representative_talk_duration", value: 252_000, unit: "milliseconds" },
          { key: "customer_talk_duration", value: 184_000, unit: "milliseconds" },
          { key: "representative_words_per_minute", value: 134, unit: "words_per_minute" },
          { key: "customer_words_per_minute", value: 108, unit: "words_per_minute" },
          { key: "representative_longest_monologue", value: 38_000, unit: "milliseconds" },
          { key: "customer_longest_monologue", value: 27_000, unit: "milliseconds" },
          { key: "representative_turn_count", value: 18, unit: "turns" },
          { key: "customer_turn_count", value: 17, unit: "turns" },
        ]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Talk balance and pace" })).toBeInTheDocument();
    expect(screen.getByText("Representative 58% · Customer 42%")).toBeInTheDocument();
    expect(screen.getByText("Estimated WPM")).toBeInTheDocument();
    expect(screen.getByText(/not a language-quality judgment/i)).toBeInTheDocument();
  });

  it("stays hidden when no deterministic metric lineage exists", () => {
    const { container } = render(<InteractionMetrics metrics={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
