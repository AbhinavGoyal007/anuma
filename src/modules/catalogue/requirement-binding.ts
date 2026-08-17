/**
 * Turning what a customer said into something the catalogue can be asked.
 *
 * This is the join the whole product turns on, and the one place it is easiest
 * to fool yourself. A customer says he wants a bike he can tour on with his wife
 * riding pillion. The dealer's export says `RE SM650 ASTRAL ASTRL BLK ABS`.
 * Between those two strings sits every interesting question, and nothing but
 * knowledge of motorcycles connects them.
 *
 * So the binding is deliberately narrow and says so out loud. A requirement
 * binds only when the customer's words appear in a vocabulary discovered from
 * this retailer's own catalogue, or when a number and unit line up with a
 * numeric attribute. Anything else comes back unbound, with the phrase kept, and
 * an unbound requirement is reported rather than dropped.
 *
 * Reporting it is the point. A system that silently ignored the requirements it
 * could not express would answer "we had four that matched" while quietly having
 * matched on nothing, and that answer is worse than no answer — it is the same
 * confident wrongness the abstention rules exist to prevent everywhere else.
 * What a store owner needs to see is: this is what we could check, and this is
 * what we could not.
 *
 * Pure, so the boundary between "the catalogue can answer this" and "it cannot"
 * is a thing you can read a test for.
 */

import type { Requirement } from "@/modules/catalogue/missed-opportunity";

/** An attribute as discovered for one node, reduced to what binding needs. */
export type BindableAttribute = {
  key: string;
  kind: "numeric" | "categorical";
  comparison: "at_least" | "at_most" | "equals";
  unit: string | null;
  /** Canonical value to the surface forms this retailer writes it as. */
  vocabulary: Record<string, string[]>;
};

export type Binding =
  | { bound: true; phrase: string; requirement: Requirement; matchedOn: string }
  | { bound: false; phrase: string; reason: "no_attribute_expresses_this" };

/** Words that carry no distinguishing weight when matching a phrase. */
const NOISE = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "for",
  "with",
  "is",
  "are",
  "very",
  "important",
  "type",
  "kind",
  "good",
  "better",
  "best",
  "want",
  "wants",
  "need",
  "needs",
  "should",
  "must",
  "be",
  "more",
  "less",
  "in",
  "on",
  "to",
]);

function tokens(phrase: string): string[] {
  return phrase
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    .filter((token) => token.length > 2 && !NOISE.has(token));
}

/**
 * Whether a phrase names a value this retailer actually uses.
 *
 * Matched against the vocabulary rather than by meaning, because meaning is
 * exactly what is not available: "cruiser-type seating" and a trim called
 * "astral" are unrelated as text, and the fact that a Super Meteor is a touring
 * bike is knowledge about motorcycles that no amount of reading this catalogue
 * will supply.
 */
function valueNamedIn(
  phrase: string,
  attribute: BindableAttribute,
): { canonical: string; form: string } | null {
  const lowered = phrase.toLowerCase();
  for (const [canonical, forms] of Object.entries(attribute.vocabulary)) {
    for (const form of [canonical, ...forms]) {
      const cleaned = form.toLowerCase().replace(/_/g, " ").trim();
      if (cleaned.length < 3) continue;
      const boundary = new RegExp(
        String.raw`(?<![a-z0-9])${cleaned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`,
      );
      if (boundary.test(lowered)) return { canonical, form };
    }
  }
  return null;
}

/** A magnitude and unit in the phrase that a numeric attribute can hold. */
function magnitudeFor(phrase: string, attribute: BindableAttribute): number | null {
  if (!attribute.unit) return null;
  const unit = attribute.unit.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(String.raw`(\d+(?:\.\d+)?)\s*${unit}(?![a-z0-9])`, "i").exec(phrase);
  if (match) return Number(match[1]);
  // A bare number alongside a phrase naming the attribute — "650 engine" against
  // an attribute keyed engine_capacity — is the same statement without the unit.
  const keyWords = attribute.key.split("_").filter((word) => word.length > 2);
  if (keyWords.some((word) => phrase.toLowerCase().includes(word))) {
    const bare = /(\d+(?:\.\d+)?)/.exec(phrase);
    if (bare) return Number(bare[1]);
  }
  return null;
}

/**
 * Bind each thing the customer said to an attribute, or report that nothing can.
 */
export function bindRequirements(
  phrases: readonly string[],
  attributes: readonly BindableAttribute[],
): Binding[] {
  return phrases.map((phrase): Binding => {
    if (tokens(phrase).length === 0) {
      return { bound: false, phrase, reason: "no_attribute_expresses_this" };
    }

    for (const attribute of attributes) {
      if (attribute.kind === "categorical") {
        const named = valueNamedIn(phrase, attribute);
        if (named) {
          return {
            bound: true,
            phrase,
            matchedOn: `${attribute.key} = ${named.canonical}`,
            requirement: {
              key: attribute.key,
              comparison: "equals",
              valueText: named.canonical,
              valueNumeric: null,
            },
          };
        }
        continue;
      }

      const magnitude = magnitudeFor(phrase, attribute);
      if (magnitude !== null) {
        return {
          bound: true,
          phrase,
          matchedOn: `${attribute.key} ${attribute.comparison} ${magnitude}`,
          requirement: {
            key: attribute.key,
            comparison: attribute.comparison,
            valueText: null,
            valueNumeric: magnitude,
          },
        };
      }
    }

    return { bound: false, phrase, reason: "no_attribute_expresses_this" };
  });
}
