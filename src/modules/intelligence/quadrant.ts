/**
 * Peer quadrants — the one thing on these pages we are not allowed to compute.
 *
 * Q1 to Q4 is a business classification of representatives. It belongs to the
 * organization that employs them, and it has to arrive from a system they own.
 * ANUMA could rank representatives by any of the behaviour rates on the
 * Frontline page and call the top quarter Q1, and the result would look exactly
 * like this feature and mean something entirely different: a coaching benchmark
 * built out of the same conversations it is used to judge, with no relationship
 * to sales, tenure, floor, or anything a manager would recognise as performance.
 *
 * A database audit of the public schema found no canonical quadrant column or
 * table. So the slot renders a connection state and this module returns
 * nothing. When a source exists it is wired up here, once, and every consumer
 * gets it — the shape it must supply is `QuadrantAssignment` below.
 */

export const QUADRANTS = ["Q1", "Q2", "Q3", "Q4"] as const;
export type Quadrant = (typeof QUADRANTS)[number];

/**
 * What a canonical source must provide before the benchmark can be switched on.
 *
 * Effective period is required because a quadrant is a statement about a person
 * at a time. Without it, re-reading last quarter would grade everyone by where
 * they sit today, and the coaching history would silently rewrite itself.
 */
export type QuadrantAssignment = {
  organizationId: string;
  /** The membership the assignment is about. */
  representativeMembershipId: string;
  quadrant: Quadrant;
  effectiveFrom: string;
  effectiveTo: string | null;
  /** Null where the assignment is organization-wide rather than per store. */
  locationId: string | null;
  /** Who said so, and which revision of their model. */
  source: string;
  version: string;
};

export type QuadrantSource =
  { connected: true; assignments: QuadrantAssignment[] } | { connected: false; reason: string };

/**
 * The connection state of the quadrant benchmark.
 *
 * Deliberately not a database probe. Reading a table that does not exist would
 * turn a known, stated product gap into a runtime error on the Frontline page,
 * and catching that error would make "not connected" indistinguishable from "the
 * database is down" — which are different things to tell a manager.
 */
export function quadrantSource(): QuadrantSource {
  return {
    connected: false,
    reason:
      "No business-owned Q1–Q4 assignment is connected to this organization. Quadrants are never derived from ANUMA conversation metrics.",
  };
}

/**
 * The rows the store benchmark shows once a source is connected.
 *
 * Fixed and in this order, so the table is the same table before and after
 * connection and a reader learns it once.
 */
export const QUADRANT_BENCHMARK_ROWS: readonly { key: string; label: string }[] = [
  { key: "recommendation_rationale", label: "Recommendation rationale" },
  { key: "demo_rate", label: "Demo where applicable" },
  { key: "alternative_rate", label: "Alternative where applicable" },
  { key: "full_objection_handling", label: "Full objection response" },
  { key: "finance_question_response", label: "Finance response coverage" },
  { key: "proactive_offer", label: "Proactive offer" },
  { key: "cross_sell_rate", label: "Cross-sell" },
  { key: "upsell_rate", label: "Upsell" },
  { key: "close_after_commitment", label: "Close after commitment" },
  { key: "next_action_capture", label: "Next action" },
];

/**
 * What a representative practises when a gap is found, per behaviour.
 *
 * Fixed templates, chosen by metric key. Nothing here is generated at runtime:
 * coaching text that changes between two readings of the same numbers is not
 * coaching, it is a slot machine, and a manager cannot hold anyone to it.
 *
 * Every line stays inside what a recording can show. The earlier set told
 * representatives to give a reason *before the price*, to demonstrate *before
 * the objection*, to offer *before the customer asks for a discount* and to
 * show *the next tier* — sequencing and discounting instructions that no
 * business here has issued and that no conversation field measures. A page that
 * prints them is inventing a sales methodology and attributing it to the
 * employer.
 *
 * Three benchmark rows — proactive offer, cross-sell, upsell — therefore have
 * no template at all. Their safe form would be a commercial policy decision,
 * and the honest thing is to show the gap without telling anybody what to do
 * about it until somebody who owns that policy says.
 */
export const PRACTICE_TEMPLATES: Readonly<Record<string, string>> = {
  recommendation_rationale: "Explain why the recommendation matches the customer's stated need.",
  demo_rate: "When applicable, demonstrate rather than only describe.",
  full_objection_handling:
    "Address the objection fully; if unresolved, state the limitation or relevant alternative.",
  finance_question_response:
    "When the customer asks about finance, provide the complete recorded response where information is available.",
  alternative_rate:
    "When the primary request cannot progress and an alternative is applicable, offer a relevant alternative.",
  close_after_commitment: "After an explicit buying signal, make a clear close attempt.",
  next_action_capture: "If the interaction remains open, agree a concrete next step.",
};

/** Percentage points a Q1 gap must clear before it is coached. */
export const COACHING_MATERIALITY_POINTS = 10;

/** The most coaching gaps ever shown at once. */
export const MAX_COACHING_GAPS = 3;
