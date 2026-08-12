/**
 * The demand leakage funnel.
 *
 * The guide's executive model: of the interactions a store observed, how many
 * carried real intent, how many were understood, and where the ones that did
 * not convert actually died — understanding, assortment, stock, price, the
 * recommendation, or execution. It diagnoses where commercially viable demand
 * disappears, which a single conversion rate cannot.
 *
 * Two rules make the numbers honest.
 *
 * First, the stages are mutually exclusive: a conversation walks the funnel and
 * is attributed to the *first* gate it fails, so every interaction is counted
 * once and the stages sum. The guide is explicit that stages must be mutually
 * defined before any percentage is published.
 *
 * Second, a stage that cannot be measured from the conversation says so rather
 * than guessing. Whether a suitable product exists in the range is a question
 * about the catalogue, not about what was said, so that stage is reported as
 * unmeasured until a product feed exists. Availability is measured only from
 * what was spoken, and is therefore claimed rather than verified.
 *
 * A purchase clears every gate by definition, so a converted interaction is
 * never attributed to a leak.
 */

export type LeakageInput = {
  purchased: boolean;
  /** Stated a budget, a timeframe, or arrived beyond idle browsing. */
  hasIntentSignal: boolean;
  /** Requirement clarity at the close, 0..3, or null when not measured. */
  clarityEnd: number | null;
  /** Someone said the wanted product was not available. */
  stockUnavailable: boolean;
  /** A price, budget or financing objection was raised. */
  priceOrFinanceBlocked: boolean;
  /** The representative put at least one product forward. */
  recommendationMade: boolean;
  /** At least one objection was left less than fully addressed. */
  frictionUnaddressed: boolean;
};

export type LeakageStage = {
  key: string;
  label: string;
  /** Interactions that satisfied this stage. */
  reached: number;
  /** Interactions attributed to this stage as their blocker. */
  leaked: number;
  /** How the loss reads to a category head; null for stages nothing leaks at. */
  leakLabel: string | null;
  /** False when the stage needs data the conversation cannot supply. */
  measured: boolean;
  /** Set where the evidence is a claim rather than a system fact. */
  basis?: "claimed";
  /** Why a stage is unmeasured, for the reader. */
  note?: string;
};

export type DemandLeakage = {
  total: number;
  stages: LeakageStage[];
  purchased: number;
  /** Cleared every measured gate and still did not convert. */
  unattributed: number;
};

type Gate = Omit<LeakageStage, "reached" | "leaked"> & {
  fails: (input: LeakageInput) => boolean;
};

/**
 * The gates, in the order demand passes through them.
 *
 * Clarity below medium is the understanding gate: a customer who left no
 * clearer than they arrived was never given a requirement the store could
 * serve. Availability only counts as a loss when someone actually said the
 * product was unavailable — silence is not a stockout.
 */
const GATES: readonly Gate[] = [
  {
    key: "intent",
    label: "Meaningful purchase intent",
    leakLabel: "Browsing — no stated intent",
    measured: true,
    fails: (input) => !input.hasIntentSignal,
  },
  {
    key: "understanding",
    label: "Requirement understood",
    leakLabel: "Understanding leakage",
    measured: true,
    fails: (input) => input.clarityEnd !== null && input.clarityEnd < 2,
  },
  {
    key: "assortment",
    label: "Suitable option exists",
    leakLabel: "Assortment leakage",
    measured: false,
    note: "Needs a product catalogue feed",
    fails: () => false,
  },
  {
    key: "stock",
    label: "Product available",
    leakLabel: "Stock leakage",
    measured: true,
    basis: "claimed",
    note: "From what was said; an inventory feed would verify it",
    fails: (input) => input.stockUnavailable,
  },
  {
    key: "price",
    label: "Price / finance viable",
    leakLabel: "Price / finance leakage",
    measured: true,
    fails: (input) => input.priceOrFinanceBlocked,
  },
  {
    key: "recommendation",
    label: "Recommendation made",
    leakLabel: "Recommendation leakage",
    measured: true,
    fails: (input) => !input.recommendationMade,
  },
  {
    key: "friction",
    label: "Friction addressed",
    leakLabel: "Execution leakage",
    measured: true,
    fails: (input) => input.frictionUnaddressed,
  },
];

export function computeDemandLeakage(inputs: readonly LeakageInput[]): DemandLeakage {
  const total = inputs.length;
  const reached = new Map<string, number>(GATES.map((gate) => [gate.key, 0]));
  const leaked = new Map<string, number>(GATES.map((gate) => [gate.key, 0]));
  let purchased = 0;
  let unattributed = 0;

  for (const input of inputs) {
    let blocked = false;
    for (const gate of GATES) {
      // A conversion cleared every gate, whatever friction it met on the way.
      if (!input.purchased && gate.fails(input)) {
        leaked.set(gate.key, (leaked.get(gate.key) ?? 0) + 1);
        blocked = true;
        break;
      }
      reached.set(gate.key, (reached.get(gate.key) ?? 0) + 1);
    }
    if (blocked) continue;
    if (input.purchased) purchased += 1;
    else unattributed += 1;
  }

  const stages: LeakageStage[] = [
    {
      key: "observed",
      label: "Interactions observed",
      reached: total,
      leaked: 0,
      leakLabel: null,
      measured: true,
    },
    ...GATES.map((gate) => ({
      key: gate.key,
      label: gate.label,
      reached: reached.get(gate.key) ?? 0,
      leaked: leaked.get(gate.key) ?? 0,
      leakLabel: gate.leakLabel,
      measured: gate.measured,
      ...(gate.basis ? { basis: gate.basis } : {}),
      ...(gate.note ? { note: gate.note } : {}),
    })),
    {
      key: "purchased",
      label: "Purchased",
      reached: purchased,
      leaked: 0,
      leakLabel: null,
      measured: true,
    },
  ];

  return { total, stages, purchased, unattributed };
}
