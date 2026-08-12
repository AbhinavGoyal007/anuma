export type ReviewProjectionObservation = {
  type: string;
  text: string | null;
  amountMinor: number | null;
  currencyCode: string | null;
};

export type ReviewProjectionCheck = {
  id: string;
  name: string;
  description: string;
  purpose: "monitor" | "scorecard";
  state: "met" | "not_met" | "partial" | "not_applicable" | "insufficient_evidence";
  explanation: string;
  applicabilityReason: string | null;
  evidenceSegmentId: string | null;
};

export type ReviewProjection = {
  status: string;
  checks: ReviewProjectionCheck[];
  scorecards: Array<{
    id: string;
    name: string;
    scorePercent: number | null;
    applicableCheckCount: number;
    evaluatedCheckCount: number;
    insufficientEvidenceCount: number;
  }>;
};

function observationValue(observation: ReviewProjectionObservation) {
  if (observation.text) return observation.text;
  if (observation.amountMinor !== null && observation.currencyCode === "INR") {
    return `₹${(observation.amountMinor / 100).toLocaleString("en-IN")}`;
  }
  return null;
}

export function notesFor(observations: ReviewProjectionObservation[]) {
  const labels: Array<[string, string[]]> = [
    ["Customer need", ["need"]],
    ["Budget", ["budget"]],
    ["Products and specs", ["product", "spec"]],
    ["Prices", ["price", "competitor_price", "store_quote"]],
    ["Competitors", ["competitor"]],
    ["Questions", ["question", "finance"]],
    ["Objections and barriers", ["objection", "barrier"]],
    ["Next action", ["next_action", "commitment"]],
  ];
  return labels.flatMap(([label, types]) => {
    const values = observations
      .filter((observation) => types.includes(observation.type))
      .map(observationValue)
      .filter((value): value is string => Boolean(value));
    return values.length ? [[label, [...new Set(values)].join(" · ")] as const] : [];
  });
}

export function coachingFor(review: ReviewProjection, observations: ReviewProjectionObservation[]) {
  const strengths = review.checks
    .filter((check) => check.state === "met" || check.state === "partial")
    .slice(0, 2);
  const gaps = review.checks.filter((check) => check.state === "not_met").slice(0, 2);
  const hasPriceComparison = observations.some((item) =>
    ["competitor_price", "objection"].includes(item.type),
  );
  return {
    strengths,
    opportunities: gaps.map((check) => ({
      ...check,
      advice:
        hasPriceComparison && /price comparison|price/i.test(check.description)
          ? "After acknowledging the online comparison, make the value difference explicit — for example a bank offer, warranty, immediate availability, or a relevant alternative."
          : `In the next interaction, make this expectation explicit: ${check.description}`,
    })),
  };
}
