/**
 * Deciding whether a catalogue row is the product that was discussed.
 *
 * Everything here is exact comparison of codes and numbers. That is a deliberate
 * refusal of similarity: "RTX 4050" and "RTX 4060" are one character apart and
 * near-identical to any embedding, but they are different machines at different
 * prices, and a confident wrong answer about which one the store had is worse
 * than admitting the mention was ambiguous.
 *
 * A match is therefore never a number on its own — it is a list of what agreed
 * and what did not, so the screen can show *why* a row was chosen and a person
 * can see immediately that the memory matched but the graphics did not.
 *
 * Pure, and the only place the decision is made.
 */

import type { ProductMention } from "@/modules/catalogue/product-mention";

export type FacetName = "brand" | "model" | "memory" | "storage" | "graphics" | "screen";

export type FacetVerdict = "agrees" | "conflicts" | "unstated" | "unreadable";

export type Facet = {
  name: FacetName;
  verdict: FacetVerdict;
  /** What was said, and what the row holds — for showing the reader. */
  wanted: string | null;
  found: string | null;
};

export type CandidateItem = {
  id: string;
  itemId: string;
  description: string;
  brandName: string | null;
  groupName: string | null;
  subgroupName: string | null;
  ramGb: number | null;
  storageGb: number | null;
  gpuGb: number | null;
  screenIn: number | null;
  /** Why a field is null, so an absent value is not read as a disagreement. */
  specIssues: string[];
};

export type SkuMatch = {
  item: CandidateItem;
  facets: Facet[];
  /** How many stated things agreed. Ordering only; never shown as a score. */
  agreements: number;
  /** Any stated thing the row contradicts. One is enough to disqualify. */
  conflicts: number;
  /** Stated things the row cannot answer because its description was damaged. */
  unreadable: number;
};

export type MatchConfidence = "exact" | "likely" | "ambiguous" | "none";

function facet(
  name: FacetName,
  wanted: string | null,
  found: string | null,
  verdict: FacetVerdict,
): Facet {
  return { name, wanted, found, verdict };
}

/**
 * Compares one stated number against what the row holds.
 *
 * The distinction that matters is between "this row says something else" and
 * "this row's description was cut off before it said". The first disqualifies a
 * candidate; the second must not, or the truncation in the source data would
 * silently erase two-thirds of the range from every answer.
 */
function compareNumber(
  name: FacetName,
  wanted: number | null,
  found: number | null,
  unreadable: boolean,
  format: (value: number) => string,
): Facet {
  if (wanted === null) return facet(name, null, found === null ? null : format(found), "unstated");
  if (found === null) {
    return facet(name, format(wanted), null, unreadable ? "unreadable" : "unstated");
  }
  return facet(name, format(wanted), format(found), wanted === found ? "agrees" : "conflicts");
}

export function matchMention(mention: ProductMention, item: CandidateItem): SkuMatch {
  const truncated = item.specIssues.includes("truncated");
  const facets: Facet[] = [];

  if (mention.brand) {
    const agrees = (item.brandName ?? "").toLowerCase() === mention.brand.toLowerCase();
    facets.push(facet("brand", mention.brand, item.brandName, agrees ? "agrees" : "conflicts"));
  }

  if (mention.modelTokens.length > 0) {
    const haystack = item.description.toUpperCase();
    const matched = mention.modelTokens.filter((token) => haystack.includes(token));
    facets.push(
      facet(
        "model",
        mention.modelTokens.join(" "),
        matched.join(" ") || null,
        // Every model word has to appear. A row matching "SWIFT" but not "GO" is
        // a different Acer, and offering it as the same one is the error this
        // whole module exists to avoid.
        matched.length === mention.modelTokens.length ? "agrees" : "conflicts",
      ),
    );
  }

  facets.push(
    compareNumber("memory", mention.ramGb, item.ramGb, truncated, (v) => `${v}GB`),
    compareNumber("storage", mention.storageGb, item.storageGb, truncated, (v) =>
      v >= 1024 ? `${v / 1024}TB` : `${v}GB`,
    ),
    compareNumber("screen", mention.screenIn, item.screenIn, truncated, (v) => `${v}"`),
  );

  // Graphics is the one facet where the two sides speak different languages: the
  // mention names a chip, the catalogue records how much memory is on it.
  if (mention.gpuModel) {
    if (item.gpuGb === null) {
      facets.push(facet("graphics", mention.gpuModel, null, truncated ? "unreadable" : "unstated"));
    } else if (mention.gpuGbCandidates.length === 0) {
      // A chip nobody has told us the size of. Silence, not a guess.
      facets.push(facet("graphics", mention.gpuModel, `${item.gpuGb}GB`, "unstated"));
    } else {
      const agrees = mention.gpuGbCandidates.includes(item.gpuGb);
      facets.push(
        facet("graphics", mention.gpuModel, `${item.gpuGb}GB`, agrees ? "agrees" : "conflicts"),
      );
    }
  }

  return {
    item,
    facets,
    agreements: facets.filter((f) => f.verdict === "agrees").length,
    conflicts: facets.filter((f) => f.verdict === "conflicts").length,
    unreadable: facets.filter((f) => f.verdict === "unreadable").length,
  };
}

/**
 * How firmly a set of candidates answers "which product was this".
 *
 * One surviving candidate that agreed on everything stated is an identification.
 * Several equally good ones is not — and saying so is the point, because the
 * alternative is picking one arbitrarily and printing it as fact.
 */
export function matchConfidence(ranked: readonly SkuMatch[]): MatchConfidence {
  const viable = ranked.filter((match) => match.conflicts === 0);
  if (viable.length === 0) return "none";

  const best = viable[0]!;
  if (best.unreadable > 0) return "ambiguous";
  const equallyGood = viable.filter((match) => match.agreements === best.agreements);
  if (equallyGood.length === 1) return "exact";
  // Several rows agree on everything said. Often the same machine listed twice,
  // but that is not something to assume.
  return "likely";
}

/**
 * Best first: nothing contradicted, then most agreed, then least damaged.
 *
 * Deliberately not a weighted score. A weight would let a strong brand match
 * outvote a contradicted graphics chip, which is exactly the trade this refuses.
 */
export function rankMatches(matches: readonly SkuMatch[]): SkuMatch[] {
  return [...matches].sort(
    (a, b) =>
      a.conflicts - b.conflicts ||
      b.agreements - a.agreements ||
      a.unreadable - b.unreadable ||
      a.item.description.localeCompare(b.item.description),
  );
}
