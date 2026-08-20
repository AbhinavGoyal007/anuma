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
  /** The field was asked and nothing was recorded in this scope. */
  | "NO_OBSERVATIONS"
  /** It was recorded, but not in a form that can be read either way. */
  | "NO_USABLE_OBSERVATIONS"
  /** Nothing in this scope carries the field at all. */
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
  NO_USABLE_OBSERVATIONS: {
    title: "No usable observations in this scope",
    note: "The field was recorded but not in a form that settles the question either way.",
  },
  NOT_SUPPORTED: {
    // Deliberately not "analysed before this field existed". That is a claim
    // about extraction history, and nothing here proves it — the field may
    // simply not have been reached in these conversations. Missing is not zero
    // and it is not a version story either.
    title: "Not available for this period",
    note: "No interaction in this scope carries this field, so there is nothing to count.",
  },
  LOW_SAMPLE: {
    title: "Too few to compare",
    note: "Counts are shown instead of rates until the sample can carry one.",
  },
  ERROR: {
    title: "Unable to load this analysis",
    note: "Reload the page. If it keeps failing the underlying read is at fault — this is never shown as zero.",
  },
};

/**
 * Decides a slot's state from the measure behind it.
 *
 * Eligibility and observation are read separately on purpose. A field nobody
 * could answer and a field everybody answered "no" to produce the same rate and
 * mean opposite things, and a rate of 0% over a real denominator is a finding
 * rather than an empty state.
 */
export function stateFor(
  m: Measure | null,
  { comparison = false }: { comparison?: boolean } = {},
): SlotState {
  if (m === null) return "NOT_SUPPORTED";
  if (m.eligible === 0) return "NOT_SUPPORTED";
  if (m.observed === 0) return "NO_USABLE_OBSERVATIONS";
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
