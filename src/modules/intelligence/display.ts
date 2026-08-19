/**
 * Deterministic cleanup of stored values for display only.
 *
 * Extraction sometimes writes a value that repeats its own label — a row
 * labelled `battery_life` whose text is `battery_life=important`. Rendered raw
 * it reads as leaked plumbing: "BATTERY LIFE battery_life=im…".
 *
 * The rule is narrow on purpose. Only an exact repetition of this row's own
 * label, followed by `=`, is removed. Nothing is merged, nothing is rephrased,
 * no near-synonym is collapsed — that would be inventing a taxonomy nobody
 * agreed to, and the number underneath would quietly change meaning. The stored
 * value is untouched, so the drill-down and the evidence still show what was
 * actually recorded.
 */

/** Compares a label and a prefix the way a machine wrote them. */
function normalize(token: string): string {
  return token
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export type DisplayValue = {
  /** The label as a short semantic tag, or null where the row has none. */
  label: string | null;
  /** The value with a duplicated machine prefix removed, never rewritten. */
  text: string;
};

export function displayValue(label: string | null, valueText: string | null): DisplayValue {
  const raw = (valueText ?? "").trim();
  if (!label) return { label: null, text: raw };

  const separator = raw.indexOf("=");
  if (separator > 0 && normalize(raw.slice(0, separator)) === normalize(label)) {
    const remainder = raw.slice(separator + 1).trim();
    // A value that was only ever its own label carries no information beyond
    // the label, so the label alone is shown rather than an empty cell.
    if (remainder) return { label, text: sentenceCase(remainder) };
    return { label, text: "" };
  }
  return { label, text: raw };
}

/**
 * Capitalises a machine token for reading.
 *
 * Applied only to the remainder of a stripped prefix, which is a controlled
 * token by construction. Free text the customer actually spoke is never touched.
 */
function sentenceCase(token: string): string {
  const spaced = token.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** A label rendered for reading: `battery_life` becomes `Battery life`. */
export function readableLabel(label: string): string {
  const spaced = label.replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
