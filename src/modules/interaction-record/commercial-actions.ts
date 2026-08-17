/**
 * The four commercial actions, reassembled from the flat record.
 *
 * The v1.3 extraction spec treats a recommendation, an alternative, an upsell
 * and a cross-sell as different commercial events rather than four words for
 * "mentioned another product", and asks for each pitch with the hierarchy it
 * sits in: which department, which category, which brand and model where those
 * were actually said.
 *
 * A record stores one value per row, so a pitch arrives as a run of rows — the
 * pitch itself, then its levels. Putting them back together needs a rule for
 * where one pitch ends and the next begins, and position alone will not do it,
 * because a pitch that named a brand contributes more rows than one that named
 * only a category.
 *
 * The rule used here comes from the shape of the data rather than from counting:
 * a single pitch cannot have two categories or two brands, so a level that has
 * already appeared means the run has moved on to the next pitch. That holds
 * whether a pitch supplied six levels or one, which is the case that defeats
 * every fixed-width scheme.
 */

export type PitchLevel = { level: string; value: string };

export type Pitch = {
  /** What was pitched, as spoken. */
  what: string;
  /** The pitch's kind for a cross-sell, or the dimension upgraded for an upsell. */
  kind: string | null;
  /** Department, category, brand and model, as deep as the conversation went. */
  hierarchy: PitchLevel[];
};

export type CommercialAction = {
  /** yes, no or uncertain — derived from the pitches, never asked for. */
  verdict: "yes" | "no" | "uncertain" | null;
  /** Why no verdict was reached, where the pitch field abstained instead. */
  abstention: string | null;
  pitches: Pitch[];
};

export type CommercialActions = {
  crossSell: CommercialAction;
  upsell: CommercialAction;
  /**
   * Whether a substitute was put forward because the preferred option failed a
   * constraint. A verdict rather than a list — the record holds whether it
   * happened, and the products themselves sit in products_recommended.
   */
  alternativeOffered: string | null;
  recommendations: string[];
  outcome: { value: string | null; basis: string | null };
};

/** The minimum of a stored value this needs; the panel's type is a superset. */
export type ActionInputValue = {
  fieldKey: string;
  valueText: string | null;
  label: string | null;
  abstention: string | null;
};

function present(values: readonly ActionInputValue[], fieldKey: string) {
  return values.filter((value) => value.fieldKey === fieldKey && !value.abstention);
}

function firstText(values: readonly ActionInputValue[], fieldKey: string): string | null {
  return present(values, fieldKey)[0]?.valueText ?? null;
}

/**
 * Splits a flat run of hierarchy rows into one group per pitch.
 *
 * A repeated level starts a new group. A row with no level at all cannot be
 * placed, so it joins the group being built rather than being dropped — losing
 * it would silently shorten a pitch's hierarchy for a reason the reader could
 * never see.
 */
export function segmentHierarchy(rows: readonly ActionInputValue[]): PitchLevel[][] {
  const groups: PitchLevel[][] = [];
  let current: PitchLevel[] = [];
  let seen = new Set<string>();

  for (const row of rows) {
    if (!row.valueText) continue;
    const level = row.label ?? "";
    if (level && seen.has(level)) {
      groups.push(current);
      current = [];
      seen = new Set();
    }
    current.push({ level, value: row.valueText });
    if (level) seen.add(level);
  }
  if (current.length) groups.push(current);
  return groups;
}

/**
 * The verdict, read off the pitches rather than asked for separately.
 *
 * The specification defines the field as yes when at least one qualifying pitch
 * exists, which makes it a function of the pitches and not an independent
 * judgement. Deriving it costs nothing and removes the one failure the stored
 * version allowed: a record claiming a cross-sell happened while listing none,
 * or denying one while listing two.
 *
 * The distinctions that matter survive, because the pitch field's own abstention
 * already carries them — nothing was pitched, the words do not settle it, or the
 * conversation gave no opening for one.
 */
function verdictFrom(
  pitchRows: readonly ActionInputValue[],
  abstention: string | null,
): CommercialAction["verdict"] {
  if (pitchRows.length > 0) return "yes";
  if (abstention === "not_stated") return "no";
  if (abstention === "insufficient_evidence" || abstention === "ambiguous") return "uncertain";
  return null;
}

function action(
  values: readonly ActionInputValue[],
  pitchField: string,
  hierarchyField: string,
): CommercialAction {
  const pitchRows = present(values, pitchField);
  const groups = segmentHierarchy(present(values, hierarchyField));
  // `unknown` means the field did not apply, which stays an abstention rather
  // than becoming a "no" a manager would read as a missed opportunity.
  const abstention =
    values.find((value) => value.fieldKey === pitchField && value.abstention)?.abstention ?? null;

  return {
    verdict: verdictFrom(pitchRows, abstention),
    abstention,
    pitches: pitchRows.map((row, index) => ({
      what: row.valueText ?? "",
      kind: row.label,
      hierarchy: groups[index] ?? [],
    })),
  };
}

export function commercialActions(values: readonly ActionInputValue[]): CommercialActions {
  return {
    crossSell: action(values, "cross_sell_pitch", "cross_sell_hierarchy"),
    upsell: action(values, "upsell_pitch", "upsell_hierarchy"),
    alternativeOffered: firstText(values, "alternative_offered"),
    recommendations: present(values, "products_recommended")
      .map((value) => value.valueText ?? "")
      .filter(Boolean),
    outcome: {
      value: firstText(values, "confirmed_business_outcome"),
      basis: firstText(values, "outcome_basis"),
    },
  };
}

/** Whether there is anything at all to show, so the panel can stay off a bare record. */
export function hasCommercialActions(actions: CommercialActions): boolean {
  return (
    actions.crossSell.verdict !== null ||
    actions.upsell.verdict !== null ||
    actions.crossSell.abstention !== null ||
    actions.upsell.abstention !== null ||
    actions.alternativeOffered !== null ||
    actions.recommendations.length > 0 ||
    actions.outcome.value !== null
  );
}
