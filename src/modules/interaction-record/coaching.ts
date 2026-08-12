import type { RecordFieldValue } from "@/modules/interaction-record/data";

/**
 * Coaching moments — where the representative could have done better.
 *
 * Derived in code from the record's own facts, never asked of a model: a red
 * flag, an objection left unaddressed, no alternative when the preferred product
 * did not fit, no demonstration. Each moment carries whether it is backed by
 * transcript evidence, so a reviewer can always trace it. This is a synthesis of
 * facts already shown, not a new judgement — the same discipline as every metric.
 */

export type CoachingMoment = {
  category: string;
  severity: "high" | "medium" | "low";
  summary: string;
  evidenced: boolean;
};

function present(values: readonly RecordFieldValue[], fieldKey: string): RecordFieldValue[] {
  return values.filter((value) => value.fieldKey === fieldKey && value.abstention === null);
}

export function deriveCoachingMoments(values: readonly RecordFieldValue[]): CoachingMoment[] {
  const moments: CoachingMoment[] = [];

  // Red flags are the most serious — each is its own moment.
  for (const flag of present(values, "red_flags")) {
    if (!flag.valueText) continue;
    moments.push({
      category: flag.label ? `Red flag · ${flag.label.replaceAll("_", " ")}` : "Red flag",
      severity: "high",
      summary: flag.valueText,
      evidenced: flag.hasEvidence,
    });
  }

  // Objection handling: how many concerns were left open.
  const responses = present(values, "objection_response");
  const unaddressed = responses.filter((value) => value.valueText === "none");
  const partial = responses.filter((value) => value.valueText === "partial");
  const objections = present(values, "objections")
    .map((value) => value.valueText)
    .filter((text): text is string => Boolean(text));
  if (unaddressed.length > 0) {
    const raised = objections.length > 0 ? ` (raised: ${objections.join(", ")})` : "";
    moments.push({
      category: "Objection handling",
      severity: "medium",
      summary: `${unaddressed.length} objection${unaddressed.length > 1 ? "s were" : " was"} left unaddressed${raised}.`,
      evidenced: unaddressed.some((value) => value.hasEvidence),
    });
  } else if (partial.length > 0) {
    moments.push({
      category: "Objection handling",
      severity: "low",
      summary: `${partial.length} objection${partial.length > 1 ? "s were" : " was"} only partly addressed.`,
      evidenced: partial.some((value) => value.hasEvidence),
    });
  }

  // No alternative offered when the preferred product could not fit.
  const alternative = present(values, "alternative_offered")[0];
  if (alternative?.valueText === "no") {
    moments.push({
      category: "Alternative",
      severity: "medium",
      summary: "No alternative was offered when the preferred product did not fit.",
      evidenced: alternative.hasEvidence,
    });
  }

  // No demonstration where one was applicable.
  const demo = present(values, "product_demo_performed")[0];
  if (demo?.valueText === "no") {
    moments.push({
      category: "Demo",
      severity: "low",
      summary: "The product was not demonstrated.",
      evidenced: demo.hasEvidence,
    });
  }

  return moments;
}
