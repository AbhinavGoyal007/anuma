/**
 * When a number is allowed to be shown, compared, or turned into a claim.
 *
 * A rate computed from eleven conversations is arithmetically fine and
 * commercially worthless. The difference between the two is a judgement about
 * sample and coverage, and it has to be made in one place — scattered across
 * components it becomes a dozen slightly different opinions, and a manager ends
 * up trusting a headline on one page that another page would have suppressed.
 *
 * These are product guardrails, not statistics. Nothing here is a significance
 * test, and none of it says a difference is real. It says only that we are
 * willing to put the difference in front of someone.
 */

export type Guardrails = {
  /** Below this, never promote a comparative claim. */
  minimumForComparison: number;
  /** Below this, show the value but mark it as directional. */
  minimumForConfidentDisplay: number;
  /** At or above this, ordinary management trend reading is reasonable. */
  minimumForTrend: number;
  /** Share of the eligible population that actually carries the field. */
  minimumCoverage: number;
};

export const DEFAULT_GUARDRAILS: Guardrails = {
  minimumForComparison: 10,
  minimumForConfidentDisplay: 30,
  minimumForTrend: 100,
  minimumCoverage: 0.7,
};

/**
 * How much weight a number has earned.
 *
 * `insufficient` is not an error and not an empty state — the metric exists and
 * was measured, and this says only that too little of it exists to argue from.
 */
export type Confidence = "insufficient" | "directional" | "comparable" | "trendworthy";

export function confidenceFor(
  eligible: number,
  guardrails: Guardrails = DEFAULT_GUARDRAILS,
): Confidence {
  if (eligible >= guardrails.minimumForTrend) return "trendworthy";
  if (eligible >= guardrails.minimumForConfidentDisplay) return "comparable";
  if (eligible >= guardrails.minimumForComparison) return "directional";
  return "insufficient";
}

/**
 * A measured value with everything needed to judge it.
 *
 * The denominator travels with the number rather than being recoverable from
 * some other call, because a percentage without its denominator is the single
 * easiest way for a dashboard to mislead. `observed` is how many of the eligible
 * interactions actually carried the field: a field nobody could answer and a
 * field everybody answered "no" to produce the same rate and mean opposite
 * things.
 */
export type Measure = {
  /** The rate or amount. Null where nothing was eligible. */
  value: number | null;
  /** Interactions that could have contributed. */
  eligible: number;
  /** Interactions that actually carried the field. */
  observed: number;
  /** Interactions in the numerator, for rates. */
  affected?: number;
  coverage: number | null;
  confidence: Confidence;
};

export function measure(
  affected: number,
  eligible: number,
  observed = eligible,
  guardrails: Guardrails = DEFAULT_GUARDRAILS,
): Measure {
  return {
    // Missingness is never zero. A metric with nothing eligible has no value,
    // and rendering that as 0% would invent a finding out of an absence.
    value: observed > 0 ? affected / observed : null,
    eligible,
    observed,
    affected,
    coverage: eligible > 0 ? observed / eligible : null,
    confidence: confidenceFor(observed, guardrails),
  };
}

/** Whether a measure may carry a headline claim rather than sit in a table. */
export function mayPromote(
  candidate: Measure,
  guardrails: Guardrails = DEFAULT_GUARDRAILS,
): boolean {
  return (
    candidate.value !== null &&
    candidate.observed >= guardrails.minimumForConfidentDisplay &&
    (candidate.coverage ?? 0) >= guardrails.minimumCoverage
  );
}

/**
 * The change between two periods, in percentage points.
 *
 * Both sides must independently clear the comparison bar. A solid current
 * period measured against six conversations last month is not a trend, and
 * averaging that away inside a single delta hides which half is thin.
 */
export type Change = {
  currentValue: number | null;
  previousValue: number | null;
  /** Difference in percentage points, for rates. Null if either side is absent. */
  deltaPoints: number | null;
  comparable: boolean;
};

export function change(
  current: Measure,
  previous: Measure,
  guardrails: Guardrails = DEFAULT_GUARDRAILS,
): Change {
  const both = current.value !== null && previous.value !== null;
  return {
    currentValue: current.value,
    previousValue: previous.value,
    deltaPoints: both ? (current.value! - previous.value!) * 100 : null,
    comparable:
      both &&
      current.observed >= guardrails.minimumForComparison &&
      previous.observed >= guardrails.minimumForComparison,
  };
}
