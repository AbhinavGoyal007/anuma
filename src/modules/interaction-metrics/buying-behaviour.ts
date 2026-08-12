/**
 * How customers actually buy, measured rather than assumed.
 *
 * The category playbook holds two classifications side by side: the role the
 * retailer assigns a category (destination, routine, convenience, occasional)
 * and the effort the customer actually spends (convenience, shopping, specialty,
 * unsought). Its sharpest claim is that a mismatch between the two is "almost
 * always the root cause of underperformance" — and no retail system measures the
 * second one, because it only shows up in how people behave on the floor.
 *
 * This classifies the observed behaviour from facts already extracted. It
 * abstains when the conversation does not carry enough signal: a guessed
 * classification would be worse than a gap, because the whole point is to
 * compare it against what the business believes.
 */

export const buyingBehaviours = ["convenience", "shopping", "specialty", "unsought"] as const;
export type BuyingBehaviour = (typeof buyingBehaviours)[number];

export type BehaviourSignals = {
  /** exploratory | comparing | specific_product | ready_to_buy */
  arrivalIntent: string | null;
  /** Requirement clarity on arrival, 0..3, or null when unmeasured. */
  clarityStart: number | null;
  productsConsidered: number;
  competitorsNamed: number;
};

/**
 * The observed buying behaviour, or null when the conversation cannot say.
 *
 * Order matters, because the markers overlap. Arriving for a named product with
 * a formed requirement is the defining marker of a specialty purchase, so it is
 * tested before comparison behaviour — a customer who came for one model and
 * glanced at a second is still verifying, not shopping.
 */
export function classifyBuyingBehaviour(signals: BehaviourSignals): BuyingBehaviour | null {
  const { arrivalIntent, clarityStart, productsConsidered, competitorsNamed } = signals;

  // Nothing observed about how they arrived or what they knew: abstain.
  if (arrivalIntent === null && clarityStart === null) return null;

  // Specialty — arrived for a specific product, already knowing what they wanted.
  if (arrivalIntent === "specific_product" && (clarityStart === null || clarityStart >= 2)) {
    return "specialty";
  }

  // Shopping — actively comparing, by their own framing or by what was weighed.
  if (arrivalIntent === "comparing" || productsConsidered >= 2 || competitorsNamed > 0) {
    return "shopping";
  }

  // Unsought — arrived without a formed need to act on.
  if (arrivalIntent === "exploratory" && clarityStart !== null && clarityStart <= 1) {
    return "unsought";
  }

  // Convenience — decided, low deliberation, wants to find it and go.
  if (arrivalIntent === "ready_to_buy" || arrivalIntent === "specific_product") {
    return "convenience";
  }

  return null;
}

/** The roles a retailer can assign a category, from the playbook. */
export const categoryRoles = ["destination", "routine", "convenience", "occasional"] as const;
export type CategoryRole = (typeof categoryRoles)[number];

/**
 * The behaviours each role implies.
 *
 * This is an interpretation of the playbook, not a quotation from it: the book
 * names the mismatch as a root cause but does not enumerate the valid pairs. It
 * is therefore used only to raise a question, never to declare a category wrong.
 */
const EXPECTED: Readonly<Record<CategoryRole, readonly BuyingBehaviour[]>> = {
  destination: ["shopping", "specialty"],
  routine: ["convenience"],
  convenience: ["convenience"],
  occasional: ["shopping"],
};

/** Conversations needed before a mismatch is worth raising at all. */
export const MIN_BEHAVIOUR_SAMPLE = 5;
/** Share of observed interactions a behaviour needs before it counts as dominant. */
const DOMINANCE = 0.5;

export type BehaviourMix = {
  category: string;
  observed: number;
  counts: { behaviour: BuyingBehaviour; count: number }[];
  dominant: BuyingBehaviour | null;
  intendedRole: CategoryRole | null;
  /** True only when a dominant behaviour contradicts the stated role. */
  mismatch: boolean;
};

export function summarizeBehaviour(
  category: string,
  behaviours: readonly (BuyingBehaviour | null)[],
  intendedRole: CategoryRole | null,
): BehaviourMix {
  const present = behaviours.filter((b): b is BuyingBehaviour => b !== null);
  const counts = new Map<BuyingBehaviour, number>();
  for (const behaviour of present) counts.set(behaviour, (counts.get(behaviour) ?? 0) + 1);

  const ranked = [...counts.entries()]
    .map(([behaviour, count]) => ({ behaviour, count }))
    .sort((a, b) => b.count - a.count);

  const top = ranked[0];
  const dominant =
    top && present.length > 0 && top.count / present.length >= DOMINANCE ? top.behaviour : null;

  const mismatch =
    intendedRole !== null &&
    dominant !== null &&
    present.length >= MIN_BEHAVIOUR_SAMPLE &&
    !EXPECTED[intendedRole].includes(dominant);

  return {
    category,
    observed: present.length,
    counts: ranked,
    dominant,
    intendedRole,
    mismatch,
  };
}
