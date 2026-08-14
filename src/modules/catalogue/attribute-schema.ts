/**
 * What a retailer's products vary by, without us naming the industry.
 *
 * The previous model asked "what dimensions does a product have?" and answered
 * it in DDL: seven columns for memory, storage, graphics, screen. That answer is
 * only true for computers. A mattress varies by size, material and firmness; an
 * air conditioner by tonnage; a jeweller's stock by metal, purity and weight.
 * Adding a column per industry is a migration per customer, and the schema still
 * cannot describe the next one.
 *
 * The question with a general answer is not what dimensions exist but what shape
 * a *requirement* has, and there are only two. A shopper either names a value
 * from a fixed vocabulary — cotton, king, front-load, OLED, 22-carat — or names
 * a number with a direction: at least 300 litres, under two ton, 16 GB or more.
 * Everything a retail conversation can ask for is one of those. So the schema
 * describes the two shapes, and each retailer's own vocabulary fills them in.
 *
 * The definitions are discovered per taxonomy node from the retailer's own
 * export, never configured, and never mapped onto vocabulary of ours. A mattress
 * retailer is onboarded by uploading mattresses.
 *
 * Pure: the description of what an attribute *is* has to be testable without a
 * model client or a database, because everything downstream trusts it.
 */

/**
 * Which rules produced a stored value.
 *
 * Bumped whenever a change here would read a description differently, so stored
 * rows can say what read them and a node can be re-extracted on its own rather
 * than the whole catalogue at once.
 */
export const ATTRIBUTE_EXTRACTOR_VERSION = "attr.v1";

/**
 * The two shapes a requirement comes in.
 *
 * `numeric` carries a magnitude and a unit and is compared by direction — more
 * litres is more, fewer kilos is fewer. `categorical` carries a member of a
 * fixed set where ordering is meaningless: king is not more than queen, and
 * cotton is not more than foam.
 */
export type AttributeKind = "numeric" | "categorical";

/**
 * How a stated requirement is satisfied by a stocked value.
 *
 * A shopper who says 16 GB will accept 32; one who says under ₹40,000 will not
 * accept ₹45,000; one who says king will not accept queen. The direction belongs
 * to the attribute, not to the sentence, which is why it is recorded once here
 * instead of being guessed per conversation.
 */
export type Comparison = "at_least" | "at_most" | "equals";

/**
 * One thing products in a taxonomy node vary by.
 *
 * `key` is the retailer's concept in snake_case, and is theirs — `capacity_kg`
 * for a washing machine, `thread_count` for bed linen. Nothing here is drawn
 * from a vocabulary of ours.
 */
export type AttributeDefinition = {
  key: string;
  kind: AttributeKind;
  /** How a stated requirement on this attribute is satisfied. */
  comparison: Comparison;
  /**
   * For numeric attributes, the unit words that follow the magnitude in this
   * retailer's descriptions — KG, L, Ton, Inch. Matched case-insensitively.
   *
   * These are *tokens*, never a pattern. A model proposing the vocabulary is
   * proposing what words mean; a model proposing a regex is writing code that
   * then runs against a hundred and eighty thousand rows, and neither its cost
   * nor its behaviour can be reviewed by reading it.
   */
  unitTokens: string[];
  /** The canonical unit values are stored in, for display and comparison. */
  unit: string | null;
  /**
   * For numeric attributes, the range this dimension is really sold in.
   *
   * A washing machine is 5–25 kg. Numbers outside the range are model numbers
   * and years, which is the failure this catalogue has already produced once:
   * a screen size of 16 inches read as 16 GB of graphics memory, and an 88 GB
   * misread that ranked first under "most memory".
   */
  range: { min: number; max: number } | null;
  /**
   * For categorical attributes, each canonical value and the surface forms that
   * mean it. `{ front_load: ["front load", "front-load", "FL"] }`.
   *
   * The canonical key is the retailer's own, taken from how their catalogue
   * writes it rather than translated into anything.
   */
  vocabulary: Record<string, string[]>;
};

/** A node of the retailer's own taxonomy, which is the only taxonomy there is. */
export type TaxonomyNode = {
  dept: string;
  group: string;
  subgroup: string;
};

/** How a node is identified, in the retailer's words, for storage and display. */
export function nodeKey(node: TaxonomyNode): string {
  return [node.dept, node.group, node.subgroup]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(" > ");
}

/**
 * Whether a definition can be trusted enough to run over a catalogue.
 *
 * A malformed definition is not a smaller version of a good one: a numeric
 * attribute with no unit tokens matches every number in the description, and an
 * attribute with one vocabulary entry claims every product is the same. Both
 * produce full-looking data that is wrong, which is worse than extracting
 * nothing, so they are rejected here rather than discovered in a dashboard.
 */
export function isUsableDefinition(definition: AttributeDefinition): boolean {
  if (!/^[a-z][a-z0-9_]{1,48}$/.test(definition.key)) return false;

  if (definition.kind === "numeric") {
    if (definition.unitTokens.length === 0) return false;
    if (definition.unitTokens.some((token) => token.trim().length === 0)) return false;
    if (definition.range === null) return false;
    if (!(definition.range.min < definition.range.max)) return false;
    if (definition.comparison === "equals") return false;
    return true;
  }

  const values = Object.entries(definition.vocabulary);
  // One value distinguishes nothing — every product would carry it, and a
  // requirement naming it would be satisfied by the entire node.
  if (values.length < 2) return false;
  if (values.some(([value, forms]) => value.trim().length === 0 || forms.length === 0)) {
    return false;
  }
  if (values.some(([, forms]) => forms.some((form) => form.trim().length === 0))) return false;
  return definition.comparison === "equals";
}
