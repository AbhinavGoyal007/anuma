import { DEFAULT_GUARDRAILS, type Measure } from "@/modules/intelligence/guardrails";

/**
 * What a slot shows when it does not have what it needs.
 *
 * Every analytical slot on these four pages exists whether or not there is data
 * behind it. A layout that rearranges when a field is empty teaches a reader
 * that the page is a different page each morning, and it hides the most
 * important fact of all — that something we expected to measure was not there.
 *
 * The five states are deliberately distinct. "Nobody did this" and "we could not
 * read this" and "this field did not exist yet" all render as an empty panel if
 * you let them, and they call for three different responses.
 */

export type SlotState =
  /** Real values, drawn as intended. */
  | "POPULATED"
  /** The field exists and nothing was observed in this scope. */
  | "NO_OBSERVATIONS"
  /** The field is not available for this period or population. */
  | "NOT_SUPPORTED"
  /** Observed, but too thin to draw the intended comparison. */
  | "LOW_SAMPLE"
  /** The read failed. Never rendered as zero. */
  | "ERROR";

const COPY: Readonly<Record<Exclude<SlotState, "POPULATED">, { title: string; note: string }>> = {
  NO_OBSERVATIONS: {
    title: "No observations in this scope",
    note: "Nothing matching this was recorded in the selected period and filters.",
  },
  NOT_SUPPORTED: {
    title: "Not available for this period",
    note: "These interactions were analysed before this field existed, so there is nothing to count.",
  },
  LOW_SAMPLE: {
    title: "Too few to compare",
    note: "Counts are shown instead of rates until the sample can carry one.",
  },
  ERROR: {
    title: "Unable to load this analysis",
    note: "Reload the page. If it keeps failing, the underlying read is at fault — this is never shown as zero.",
  },
};

/**
 * Decides a slot's state from the measure behind it.
 *
 * Coverage and eligibility are read separately on purpose: a field nobody could
 * answer and a field everybody answered "no" to produce the same rate and mean
 * opposite things.
 */
export function stateFor(
  m: Measure | null,
  { comparison = false }: { comparison?: boolean } = {},
): SlotState {
  if (m === null) return "NOT_SUPPORTED";
  if (m.eligible === 0) return "NO_OBSERVATIONS";
  if (m.observed === 0) return "NOT_SUPPORTED";
  if (comparison && m.observed < DEFAULT_GUARDRAILS.minimumForComparison) return "LOW_SAMPLE";
  return "POPULATED";
}

export function DataState({ state, compact }: { state: SlotState; compact?: boolean }) {
  if (state === "POPULATED") return null;
  const copy = COPY[state];
  return (
    <div className={`ip-state${compact ? " ip-state--compact" : ""}`} role="status">
      <strong>{copy.title}</strong>
      {compact ? null : <span>{copy.note}</span>}
    </div>
  );
}

/**
 * A slot that keeps its shape whatever the data does.
 *
 * The heading and the panel are rendered either way; only the inside changes.
 */
export function Slot({
  state,
  compact,
  children,
}: {
  state: SlotState;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return state === "POPULATED" ? <>{children}</> : <DataState state={state} compact={compact} />;
}
