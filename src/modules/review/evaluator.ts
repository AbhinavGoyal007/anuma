export type CheckState = "met" | "not_met" | "partial" | "not_applicable" | "insufficient_evidence";

export type ReviewCheck = {
  applicability: "every_interaction" | "when_relevant";
  description: string;
  evaluationStrategy: "observation" | "phrase" | "semantic";
  id: string;
  name: string;
  observationTypes: string[];
  phrase: string | null;
  purpose: "monitor" | "scorecard";
  weight: number | null;
};

export type ReviewObservation = {
  evidenceGroupId: string;
  type: string;
  valueText: string | null;
};

export type ReviewSegment = {
  id: string;
  role: string;
  text: string;
};

export type ReviewResult = {
  applicabilityReason: string | null;
  evidenceGroupId: string | null;
  evidenceSegmentIds: string[];
  explanation: string;
  state: CheckState;
};

function applicableObservations(check: ReviewCheck, observations: ReviewObservation[]) {
  return observations.filter((observation) => check.observationTypes.includes(observation.type));
}

function isRelevant(check: ReviewCheck, observations: ReviewObservation[]) {
  // A configured observation dependency is the bounded applicability rule for
  // starter checks. Custom semantic checks without one stay for the single
  // semantic batch to decide; no check-name parsing is used.
  if (check.applicability === "every_interaction") return true;
  if (check.observationTypes.length === 0) return null;
  return applicableObservations(check, observations).length > 0;
}

export function evaluateDeterministicCheck(
  check: ReviewCheck,
  observations: ReviewObservation[],
  segments: ReviewSegment[],
): ReviewResult | null {
  const relevance = isRelevant(check, observations);
  const matchingObservations = applicableObservations(check, observations);
  if (relevance === false) {
    return {
      applicabilityReason: "This check was not relevant to the interaction.",
      evidenceGroupId: null,
      evidenceSegmentIds: [],
      explanation: "This check was not relevant to the interaction.",
      state: "not_applicable",
    };
  }

  if (check.evaluationStrategy === "semantic") return null;

  if (check.evaluationStrategy === "observation") {
    const evidenceGroupId = matchingObservations[0]?.evidenceGroupId ?? null;
    return evidenceGroupId
      ? {
          applicabilityReason:
            relevance === true ? "Matching interaction evidence was observed." : null,
          evidenceGroupId,
          evidenceSegmentIds: [],
          explanation: "Matching interaction evidence was observed.",
          state: "met",
        }
      : {
          applicabilityReason: null,
          evidenceGroupId: null,
          evidenceSegmentIds: [],
          explanation: "Applicable check, but no matching evidence was observed.",
          state: "not_met",
        };
  }

  const phrase = check.phrase?.trim().toLocaleLowerCase();
  const matchingSegment = phrase
    ? segments.find((segment) => segment.text.toLocaleLowerCase().includes(phrase))
    : undefined;
  return matchingSegment
    ? {
        applicabilityReason:
          relevance === true ? "The configured phrase made this check relevant." : null,
        evidenceGroupId: null,
        evidenceSegmentIds: [matchingSegment.id],
        explanation: "The configured phrase was observed in the transcript.",
        state: "met",
      }
    : {
        applicabilityReason: null,
        evidenceGroupId: null,
        evidenceSegmentIds: [],
        explanation: "The configured phrase was not observed in the transcript.",
        state: "not_met",
      };
}

export function calculateScorecard(results: Array<{ state: CheckState; weight: number }>) {
  const applicable = results.filter((item) => item.state !== "not_applicable");
  const evaluated = applicable.filter((item) => item.state !== "insufficient_evidence");
  const denominator = evaluated.reduce((total, item) => total + item.weight, 0);
  const numerator = evaluated.reduce(
    (total, item) =>
      total +
      (item.state === "met" ? item.weight : item.state === "partial" ? item.weight * 0.5 : 0),
    0,
  );
  return {
    applicableCheckCount: applicable.length,
    evaluatedCheckCount: evaluated.length,
    insufficientEvidenceCount: applicable.length - evaluated.length,
    scorePercent: denominator === 0 ? null : (numerator / denominator) * 100,
  };
}
