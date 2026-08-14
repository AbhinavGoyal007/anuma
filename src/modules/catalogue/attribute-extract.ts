/**
 * Reading a retailer's descriptions using the vocabulary discovered for them.
 *
 * The split matters more than the code. A model proposes what a node's products
 * vary by and what words the retailer uses for it; everything that then touches
 * a hundred and eighty thousand rows happens here, in rules that can be read,
 * tested and re-run at no cost. The model contributes vocabulary, never a
 * pattern and never a value — so a bad proposal produces no data rather than
 * confident wrong data, and the same input always reads the same way.
 *
 * Nothing here guesses. A magnitude with no unit beside it is left alone,
 * because the number in "Akai ART4900G TM Refrigerator 302L" that means
 * something is 302 and the one that does not is 4900, and only the unit tells
 * them apart.
 *
 * Pure, and the only place a description becomes a value.
 */

import type { AttributeDefinition } from "@/modules/catalogue/attribute-schema";

export type ExtractedAttribute = {
  key: string;
  /** The canonical categorical value, or null for a numeric attribute. */
  valueText: string | null;
  /** The magnitude, or null for a categorical attribute. */
  valueNumeric: number | null;
  unit: string | null;
};

/** Regex-special characters, escaped so a unit token is matched literally. */
function escape(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A magnitude immediately followed by one of the node's unit words.
 *
 * Built here from tokens rather than accepted as a pattern, so the shape of what
 * runs is fixed no matter what a proposal contains. The unit may be attached
 * ("20KG") or spaced ("2 Ton"), and both appear in the same export.
 */
function numericMatcher(unitTokens: string[]): RegExp {
  const units = unitTokens
    .map((token) => escape(token.trim()))
    .sort((a, b) => b.length - a.length)
    .join("|");
  return new RegExp(String.raw`(\d+(?:\.\d+)?)\s*(?:${units})(?![a-z0-9])`, "gi");
}

/**
 * A surface form standing on its own.
 *
 * Bounded deliberately: "TL" inside "P1460RWN-BW TL SA" is a top-load marker,
 * but the same two letters inside a model number are not, and a bare substring
 * search cannot tell the difference. Forms containing spaces or punctuation are
 * matched as written.
 */
function categoricalMatcher(form: string): RegExp {
  const escaped = escape(form.trim());
  return new RegExp(String.raw`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i");
}

function extractNumeric(
  description: string,
  definition: AttributeDefinition,
): ExtractedAttribute | null {
  const matches = [...description.matchAll(numericMatcher(definition.unitTokens))];
  if (matches.length === 0) return null;

  const range = definition.range;
  const plausible = matches
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value))
    .filter((value) => range === null || (value >= range.min && value <= range.max));

  if (plausible.length === 0) return null;
  // Two different plausible magnitudes for one dimension is not a value to pick
  // between — "302L" beside "50L" in a description of a fridge with a freezer
  // means the reading is not settled, and choosing either invents a fact.
  const distinct = new Set(plausible);
  if (distinct.size > 1) return null;

  return {
    key: definition.key,
    valueText: null,
    valueNumeric: plausible[0]!,
    unit: definition.unit,
  };
}

function extractCategorical(
  description: string,
  definition: AttributeDefinition,
): ExtractedAttribute | null {
  const found = new Set<string>();
  for (const [canonical, forms] of Object.entries(definition.vocabulary)) {
    if (forms.some((form) => categoricalMatcher(form).test(description))) found.add(canonical);
  }
  // A description matching two values of one attribute is ambiguous in the same
  // way, and the same answer applies: record nothing.
  if (found.size !== 1) return null;

  return {
    key: definition.key,
    valueText: [...found][0]!,
    valueNumeric: null,
    unit: null,
  };
}

/** Every attribute a description settles, under the node's own definitions. */
export function extractAttributes(
  description: string,
  definitions: readonly AttributeDefinition[],
): ExtractedAttribute[] {
  const text = description.trim();
  if (text.length === 0) return [];

  const extracted: ExtractedAttribute[] = [];
  for (const definition of definitions) {
    const value =
      definition.kind === "numeric"
        ? extractNumeric(text, definition)
        : extractCategorical(text, definition);
    if (value) extracted.push(value);
  }
  return extracted;
}
