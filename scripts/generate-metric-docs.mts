/**
 * Writes the metric reference from the registry.
 *
 * Generated rather than hand-written because a metric document that drifts from
 * the code is worse than none: someone reads a denominator, acts on it, and the
 * number meant something else. Run it whenever the registry changes; the file it
 * writes is committed so the reference is readable without running anything.
 *
 * Usage:
 *   node --experimental-strip-types --import ./scripts/alias-hook.mjs \
 *     scripts/generate-metric-docs.mts
 */
import { writeFileSync } from "node:fs";

import { DEFAULT_GUARDRAILS } from "@/modules/intelligence/guardrails";
import { metricRegistry, type MetricModule } from "@/modules/intelligence/metric-registry";
import { CORRECTION_LIMITS } from "@/modules/intelligence/corrections";

const MODULE_TITLES: Record<MetricModule, string> = {
  customer_demand: "Customer demand",
  customer_journey: "Customer decision journey",
  frontline: "Frontline",
};

const lines: string[] = [
  "# Intelligence metrics",
  "",
  "Generated from `src/modules/intelligence/metric-registry.ts` by",
  "`scripts/generate-metric-docs.mts`. Edit the registry, not this file.",
  "",
  "Every percentage on an Intelligence page comes from a definition below. A",
  "component may render a rate; it may never decide one. Where a formula is an",
  "approximation of the one we actually want, it is marked **provisional** with",
  "the reason — those are shown as approximate on the page too, rather than",
  "rounded into a precise-looking figure.",
  "",
  "## Sample and coverage guardrails",
  "",
  `- Fewer than ${DEFAULT_GUARDRAILS.minimumForComparison} eligible interactions: no comparative claim is promoted.`,
  `- ${DEFAULT_GUARDRAILS.minimumForComparison}–${DEFAULT_GUARDRAILS.minimumForConfidentDisplay - 1}: shown, marked directional only.`,
  `- ${DEFAULT_GUARDRAILS.minimumForConfidentDisplay} or more: directional comparison allowed.`,
  `- ${DEFAULT_GUARDRAILS.minimumForTrend} or more: reasonable for trend reading, still not a guarantee.`,
  `- Coverage below ${Math.round(DEFAULT_GUARDRAILS.minimumCoverage * 100)}%: the metric is not used as a headline.`,
  "",
  "These are product guardrails. Nothing here is a significance test, and none",
  "of it says a difference is real.",
  "",
  "## Performance, measured",
  "",
  "Against the hosted database with sixty interactions in the window, each read",
  "takes roughly half a second and the SQL inside it takes two milliseconds. The",
  "plan for the largest read is an index scan on `field_values_field_idx`",
  "returning three thousand rows in under 2ms. The cost is round trips, not",
  "query execution.",
  "",
  "The consequence: adding indexes would buy nothing. Consolidating each page",
  "into a single RPC returning one payload would remove four or five round trips",
  "and is the optimisation worth making when latency starts to matter. It is not",
  "urgent at this volume, and it would cost the unit-testability that computing",
  "in TypeScript currently buys, so it is recorded rather than done.",
  "",
  "One read is paged deliberately: the API caps a select at a thousand rows and",
  "sixty interactions carry roughly three thousand field values, so an unpaged",
  "read silently returns a third of the data.",
  "",
  "## Corrections",
  "",
  CORRECTION_LIMITS,
  "",
];

for (const section of Object.keys(MODULE_TITLES) as MetricModule[]) {
  const metrics = metricRegistry.filter((definition) => definition.module === section);
  if (metrics.length === 0) continue;
  lines.push(`## ${MODULE_TITLES[section]}`, "");
  for (const definition of metrics) {
    lines.push(
      `### ${definition.label}`,
      "",
      `\`${definition.key}\` · ${definition.format} · ${definition.grain} grain · ${definition.directionality.replaceAll("_", " ")}`,
      "",
      `**Question.** ${definition.businessQuestion}`,
      "",
      `**Counts.** ${definition.definition}`,
      "",
      `**Eligible.** ${definition.eligibilityRule}`,
    );
    if (definition.numeratorRule) lines.push("", `**Numerator.** ${definition.numeratorRule}`);
    if (definition.denominatorRule)
      lines.push("", `**Denominator.** ${definition.denominatorRule}`);
    if (definition.requiredFields.length) {
      lines.push("", `**Depends on.** ${definition.requiredFields.join(", ")}`);
    }
    if (definition.drilldownFieldKeys.length) {
      lines.push("", `**Drill-down shows.** ${definition.drilldownFieldKeys.join(", ")}`);
    }
    if (definition.provisional) lines.push("", `**Provisional.** ${definition.provisional}`);
    lines.push("");
  }
}

writeFileSync("docs/intelligence-metrics.md", lines.join("\n"));
console.log(`docs/intelligence-metrics.md — ${metricRegistry.length} metrics`);
