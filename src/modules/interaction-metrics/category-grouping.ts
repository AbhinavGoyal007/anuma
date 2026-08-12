/**
 * Resolving what a customer's words for a category meant.
 *
 * `purchase_category` is extracted from what was actually said, so it arrives in
 * the customer's phrasing rather than the business's. Across fifteen real
 * interactions it produced twelve distinct values, six of which describe one
 * category: "2 bhk flat", "2 bhk property", "3 bhk property", "3 bhk
 * property/flat", "property / 2 bhk flat", "residential property / apartment".
 * Counting those as written reports six categories of one interaction each, and
 * the one line of demand that actually exists disappears.
 *
 * A phrase resolves only through a mapping a person confirmed. Nothing is
 * guessed: an unconfirmed phrase is reported as unresolved and a phrase marked
 * as outside ANUMA's range is counted separately, so a caller can always state
 * what its own breakdown failed to account for.
 *
 * Pure, and free of any server import, so the rule that decides what a category
 * head is looking at can be tested directly.
 */

export type SpokenMappingStatus = "proposed" | "confirmed" | "not_relevant";

export type SpokenDecision = {
  phrase: string;
  anumaCategoryKey: string | null;
  status: SpokenMappingStatus;
};

export type CategoryResolution = {
  /** Conversation id to the ANUMA category key it counts towards. */
  keyByConversation: Map<string, string>;
  /** Conversations whose phrasing is confirmed as outside the covered range. */
  outsideRange: number;
  /** Unconfirmed phrasings, and how many conversations each cost. */
  unresolved: Map<string, number>;
};

/**
 * The one normalisation rule.
 *
 * Deliberately only case and surrounding space — the same thing
 * `spoken_category_summary` does in SQL, so a phrase queued for confirmation and
 * a phrase looked up here are always the same string. Anything cleverer (cutting
 * plurals, splitting on slashes) would have to be implemented identically in two
 * languages, and the day they drifted a confirmed mapping would silently stop
 * matching the thing it was confirmed for.
 */
export function normalizeCategoryPhrase(text: string): string {
  return text.trim().toLowerCase();
}

export function resolveSpokenCategories(
  phraseByConversation: ReadonlyMap<string, string>,
  decisions: readonly SpokenDecision[],
): CategoryResolution {
  const confirmed = new Map<string, string>();
  const outsideRangePhrases = new Set<string>();
  for (const decision of decisions) {
    const phrase = normalizeCategoryPhrase(decision.phrase);
    // A confirmed decision with no category is not a mapping to nothing; it is
    // a row that should have been marked not relevant, and treating it as a
    // category would create an unnamed bucket.
    if (decision.status === "confirmed" && decision.anumaCategoryKey) {
      confirmed.set(phrase, decision.anumaCategoryKey);
    } else if (decision.status === "not_relevant") {
      outsideRangePhrases.add(phrase);
    }
  }

  const keyByConversation = new Map<string, string>();
  const unresolved = new Map<string, number>();
  let outsideRange = 0;

  for (const [conversationId, rawPhrase] of phraseByConversation) {
    const phrase = normalizeCategoryPhrase(rawPhrase);
    if (phrase.length === 0) continue;

    const key = confirmed.get(phrase);
    if (key !== undefined) {
      keyByConversation.set(conversationId, key);
    } else if (outsideRangePhrases.has(phrase)) {
      outsideRange += 1;
    } else {
      unresolved.set(phrase, (unresolved.get(phrase) ?? 0) + 1);
    }
  }

  return { keyByConversation, outsideRange, unresolved };
}
