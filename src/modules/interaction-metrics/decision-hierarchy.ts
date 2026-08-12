/**
 * The order customers apply their decision filters.
 *
 * The category playbook asks a question most retailers cannot answer: name the
 * top three filters your customer applies — *in the sequence they apply them*.
 * Search logs give the sequence online; on a shop floor nobody has it.
 *
 * Every extracted fact cites the transcript segments that support it, and those
 * carry a timestamp, so the moment a requirement first surfaces in a
 * conversation is already recorded. Ranking those moments within a conversation
 * and averaging across conversations produces the decision order.
 *
 * The honest caveat, which the view states plainly: this measures the order in
 * which topics *surface*, and a representative's questioning shapes that order
 * as much as the customer's own priorities. It is a strong proxy for the
 * decision hierarchy, not a direct reading of intent — which is why the field it
 * belongs to is evaluated rather than verified.
 */

/** The decision filter each requirement-bearing field speaks to. */
const DECISION_DIMENSIONS: Readonly<Record<string, string>> = {
  purchase_use_cases: "use case",
  target_budget: "budget",
  maximum_budget: "budget",
  specification_requirements: "specification",
  additional_requirements: "category requirement",
  brand_preferences: "brand",
  other_constraints: "constraint",
  purchase_timing: "timing",
};

export function decisionDimensionFor(fieldKey: string): string | null {
  return DECISION_DIMENSIONS[fieldKey] ?? null;
}

/** One dimension surfacing in one conversation, at its earliest evidence. */
export type DecisionAppearance = {
  conversationId: string;
  dimension: string;
  firstMilliseconds: number;
};

export type DecisionFilter = {
  dimension: string;
  /** Conversations in which this filter surfaced at all. */
  conversations: number;
  /** Mean position among the filters present in a conversation, 1 = earliest. */
  meanRank: number;
  /** Share of its conversations where it surfaced first. */
  firstShare: number;
};

export function computeDecisionHierarchy(
  appearances: readonly DecisionAppearance[],
): DecisionFilter[] {
  // Earliest mention wins when a dimension is fed by several fields — budget is
  // both the target and the ceiling, and the first of them is when budget
  // entered the conversation.
  const earliest = new Map<string, Map<string, number>>();
  for (const appearance of appearances) {
    const perConversation =
      earliest.get(appearance.conversationId) ?? new Map<string, number>();
    const seen = perConversation.get(appearance.dimension);
    if (seen === undefined || appearance.firstMilliseconds < seen) {
      perConversation.set(appearance.dimension, appearance.firstMilliseconds);
    }
    earliest.set(appearance.conversationId, perConversation);
  }

  const totals = new Map<string, { conversations: number; rankSum: number; firsts: number }>();
  for (const perConversation of earliest.values()) {
    const ordered = [...perConversation.entries()].sort((a, b) => a[1] - b[1]);
    ordered.forEach(([dimension], index) => {
      const entry = totals.get(dimension) ?? { conversations: 0, rankSum: 0, firsts: 0 };
      entry.conversations += 1;
      entry.rankSum += index + 1;
      if (index === 0) entry.firsts += 1;
      totals.set(dimension, entry);
    });
  }

  return [...totals.entries()]
    .map(([dimension, entry]) => ({
      dimension,
      conversations: entry.conversations,
      meanRank: entry.rankSum / entry.conversations,
      firstShare: entry.firsts / entry.conversations,
    }))
    .sort((a, b) => a.meanRank - b.meanRank);
}
