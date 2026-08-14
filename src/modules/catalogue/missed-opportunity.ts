/**
 * What was on the floor that the customer never saw.
 *
 * The question a store owner actually wants answered is not whether their
 * salesperson was polite. It is whether a customer walked out past something
 * that would have suited them. That has two shapes, and neither is specific to
 * an industry.
 *
 * The first is a claim that turns out to be false — "we do not have it" when the
 * shelf did. The second is quieter and far more common: the customer was shown
 * one option, said no, and left, while four others in stock met everything they
 * asked for. Nobody lied; the range was simply narrower in the telling than on
 * the floor. In the conversation this was written against, a customer asking for
 * a touring 650 was told the range held two models. It held six, and one of them
 * is the touring bike in the line-up.
 *
 * Both are computed here, in code, over the attributes discovered for the
 * retailer's own catalogue. The vertical never appears: a requirement is a key,
 * a direction and a value, and whether that key is engine capacity or thread
 * count changes nothing about the arithmetic. The model that read the
 * conversation contributes the requirements and nothing else — it does not
 * decide what qualified, does not count anything, and never sees the stock.
 *
 * Pure, because this is the number a manager will argue with, and an argument
 * about it should be settled by reading a test rather than by re-running a
 * model.
 */

export type StockedItem = {
  itemId: string;
  description: string;
  /** The retailer's own taxonomy node, which is the only grouping there is. */
  nodeKey: string;
  stock: number;
  attributes: { key: string; valueText: string | null; valueNumeric: number | null }[];
};

/** One thing the customer said they needed, in the retailer's own vocabulary. */
export type Requirement = {
  key: string;
  comparison: "at_least" | "at_most" | "equals";
  valueText: string | null;
  valueNumeric: number | null;
};

export type ItemAssessment = {
  item: StockedItem;
  /** Requirements this item meets, and the ones it does not. */
  met: string[];
  failed: string[];
  /** Requirements the item carries no reading for, which is not a failure. */
  unknown: string[];
};

export type MissedOpportunity = {
  /** In stock on the day, and contradicting nothing the customer asked for. */
  qualifying: ItemAssessment[];
  /** Of those, the ones the conversation shows were actually put in front of them. */
  shown: ItemAssessment[];
  /** Of those, the ones that were never mentioned. */
  neverShown: ItemAssessment[];
  /** True when the record says unavailable and something qualifying was in stock. */
  falselyUnavailable: boolean;
};

/**
 * Whether one stocked item contradicts one stated requirement.
 *
 * A missing reading is deliberately not a failure. Extraction abstains wherever
 * it cannot settle a value, so treating silence as a mismatch would quietly
 * shrink the range every time the catalogue was terse — and this number exists
 * to catch a range being reported as too narrow.
 */
function assess(item: StockedItem, requirements: readonly Requirement[]): ItemAssessment {
  const met: string[] = [];
  const failed: string[] = [];
  const unknown: string[] = [];

  for (const requirement of requirements) {
    const reading = item.attributes.find((attribute) => attribute.key === requirement.key);
    if (!reading) {
      unknown.push(requirement.key);
      continue;
    }

    if (requirement.valueNumeric !== null && reading.valueNumeric !== null) {
      const satisfied =
        requirement.comparison === "at_least"
          ? reading.valueNumeric >= requirement.valueNumeric
          : requirement.comparison === "at_most"
            ? reading.valueNumeric <= requirement.valueNumeric
            : reading.valueNumeric === requirement.valueNumeric;
      (satisfied ? met : failed).push(requirement.key);
      continue;
    }

    if (requirement.valueText !== null && reading.valueText !== null) {
      const satisfied = reading.valueText.toLowerCase() === requirement.valueText.toLowerCase();
      (satisfied ? met : failed).push(requirement.key);
      continue;
    }

    unknown.push(requirement.key);
  }

  return { item, met, failed, unknown };
}

/** The words in a product name that distinguish it from its neighbours. */
function distinctiveTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1)
    // The brand is on every row in a single-brand dealership and separates
    // nothing; "Royal Enfield Interceptor" and "Royal Enfield Super Meteor"
    // would otherwise look like the same product being discussed.
    .filter((token) => !["royal", "enfield", "the", "and"].includes(token));
}

/**
 * Whether a product named in the conversation is this catalogue row.
 *
 * Deliberately exact rather than similar. "Interceptor 650" and "Super Meteor
 * 650" are both 650 twins from one brand at a similar price, and a fuzzy match
 * that treated one as the other would report the missed bike as already shown —
 * turning the finding into its opposite.
 */
function wasNamed(item: StockedItem, spokenNames: readonly string[]): boolean {
  const description = item.description.toLowerCase();
  return spokenNames.some((name) => {
    const tokens = distinctiveTokens(name);
    return tokens.length > 0 && tokens.every((token) => description.includes(token));
  });
}

export function findMissedOpportunity(input: {
  stocked: readonly StockedItem[];
  requirements: readonly Requirement[];
  /** Products the record says were recommended or discussed, verbatim. */
  spokenNames: readonly string[];
  /** Whether the record says the store could not supply what was wanted. */
  claimedUnavailable: boolean;
}): MissedOpportunity {
  const qualifying = input.stocked
    .filter((item) => item.stock > 0)
    .map((item) => assess(item, input.requirements))
    .filter((assessment) => assessment.failed.length === 0);

  const shown = qualifying.filter((assessment) => wasNamed(assessment.item, input.spokenNames));
  const neverShown = qualifying.filter(
    (assessment) => !wasNamed(assessment.item, input.spokenNames),
  );

  return {
    qualifying,
    shown,
    neverShown,
    // Contradicting a salesperson requires having checked something. With no
    // requirement bound, every row in stock trivially "qualifies" and this fired
    // on the size of the shelf — against a real Ford feed it announced a false
    // "we did have it" while having verified neither the hybrid the customer
    // asked for nor his budget, because the feed's fuel type and price columns
    // are not in the catalogue at all. Being accidentally right there is worse
    // than being wrong: the same code accuses a salesperson who was telling the
    // truth, and that accusation is the one thing this product cannot get wrong.
    falselyUnavailable:
      input.claimedUnavailable && input.requirements.length > 0 && qualifying.length > 0,
  };
}
