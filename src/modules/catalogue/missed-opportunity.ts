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
  /**
   * Every value that satisfies this requirement, when more than one does.
   *
   * A customer asking for a hybrid will take `Hybrid Fuel`, `Gas/Electric
   * Hybrid` or a plug-in; a retailer writes all three and means one thing.
   * Binding to a single winner made the answer depend on which spelling that
   * retailer happened to use most, and made the margin between two spellings of
   * the same idea look like uncertainty about what the customer meant.
   */
  valueTextAnyOf?: string[];
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

    if (reading.valueText !== null) {
      const accepted = (requirement.valueTextAnyOf ?? [requirement.valueText ?? ""])
        .filter((value) => value.length > 0)
        .map((value) => value.toLowerCase());
      if (accepted.length > 0) {
        (accepted.includes(reading.valueText.toLowerCase()) ? met : failed).push(requirement.key);
        continue;
      }
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
/**
 * Whether what was said rules this row out despite naming its model.
 *
 * A dealer feed's description column holds "Escape", and the salesperson showed
 * "the Ford Escape gas model". Matching on the model alone marks every Escape as
 * shown, including the hybrids — which are the cars the customer actually wanted
 * and never saw, so the finding disappears into its own evidence.
 *
 * The words the retailer uses for their own attribute values settle it: if the
 * sentence names a value this row does not hold, it was describing a different
 * one.
 */
function contradicted(
  item: StockedItem,
  spoken: string,
  vocabulary: ReadonlyMap<string, readonly string[]>,
): boolean {
  const sentence = ` ${spoken.toLowerCase()} `;
  for (const reading of item.attributes) {
    if (reading.valueText === null) continue;
    const values = vocabulary.get(reading.key);
    if (!values) continue;
    const named = values.filter((value) => {
      const word = value.toLowerCase().trim();
      return word.length > 2 && sentence.includes(` ${word} `);
    });
    if (named.length === 0) continue;
    if (!named.some((value) => value.toLowerCase() === reading.valueText!.toLowerCase())) {
      return true;
    }
  }
  return false;
}

function wasNamed(
  item: StockedItem,
  spokenNames: readonly string[],
  vocabulary: ReadonlyMap<string, readonly string[]>,
): boolean {
  const itemTokens = distinctiveTokens(item.description);
  if (itemTokens.length === 0) return false;

  return spokenNames.some((name) => {
    if (contradicted(item, name, vocabulary)) return false;
    const spoken = distinctiveTokens(name);
    if (spoken.length === 0) return false;
    // Containment either way, because which string is longer depends on the
    // retailer's file rather than on what happened in the shop. A dealer feed
    // whose description column holds "Escape" is named by a salesperson saying
    // "the Ford Escape gas model"; an electronics catalogue whose description
    // is "HP 16H1023DX Envy i9/16GB/1TB" is named by someone saying "the HP
    // Envy i9". Requiring the spoken words to contain the row reported every
    // product as never shown against the first, which turns a report about what
    // a salesperson missed into a list of their entire stock.
    const spokenSet = new Set(spoken);
    const itemSet = new Set(itemTokens);
    return (
      itemTokens.every((token) => spokenSet.has(token)) ||
      spoken.every((token) => itemSet.has(token))
    );
  });
}

export function findMissedOpportunity(input: {
  stocked: readonly StockedItem[];
  requirements: readonly Requirement[];
  /** Products the record says were recommended or discussed, verbatim. */
  spokenNames: readonly string[];
  /** Whether the record says the store could not supply what was wanted. */
  claimedUnavailable: boolean;
  /** Each attribute and the values this retailer writes for it. */
  vocabulary?: ReadonlyMap<string, readonly string[]>;
}): MissedOpportunity {
  const vocabulary = input.vocabulary ?? new Map<string, readonly string[]>();
  const qualifying = input.stocked
    .filter((item) => item.stock > 0)
    .map((item) => assess(item, input.requirements))
    .filter((assessment) => assessment.failed.length === 0);

  const shown = qualifying.filter((assessment) =>
    wasNamed(assessment.item, input.spokenNames, vocabulary),
  );
  const neverShown = qualifying.filter(
    (assessment) => !wasNamed(assessment.item, input.spokenNames, vocabulary),
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
