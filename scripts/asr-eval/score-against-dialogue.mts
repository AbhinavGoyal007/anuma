/**
 * Scoring the extracted record against what was actually said.
 *
 * An earlier version of this compared the record to the pack's answer key and
 * counted every abstention as a failure. That was wrong, and it inverted the
 * product's own rule. The key describes what an evaluator concludes having read
 * the whole scenario; the dialogue is what the customer and representative
 * actually uttered. Where the key expects a battery requirement and nobody in
 * the room mentioned a battery, abstaining is not a miss — it is the most
 * valuable thing the extractor can do, because the alternative is asserting a
 * requirement no evidence supports.
 *
 * So every field is judged against the dialogue first, and lands in one of four
 * places:
 *
 *   captured           the fact was said and was captured
 *   missed             the fact was said and was lost          <- the real failure
 *   correctly silent   nothing was said and nothing claimed    <- a success
 *   invented           nothing was said and a value appeared   <- the worst outcome
 *
 * The last is counted separately and never averaged away, because a product that
 * invents a budget is worse than one that admits it does not know.
 *
 * Usage:
 *   node --env-file=.env.local --experimental-strip-types \
 *     scripts/asr-eval/score-against-dialogue.mts --provider voxtral
 */

import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import postgres from "postgres";

const { values } = parseArgs({
  options: {
    gold: { type: "string", default: "eval/gold-fields.json" },
    dialogue: { type: "string", default: "eval/dialogues.json" },
    org: { type: "string", default: "AG LLC" },
    provider: { type: "string", default: "voxtral" },
    verbose: { type: "boolean", default: false },
  },
});

/**
 * What has to appear in the dialogue for a field to be answerable at all.
 *
 * Both scripts, because half the pack is spoken in Hindi and a requirement is no
 * less stated for having been said in Devanagari.
 */
const EVIDENCE: Record<string, RegExp> = {
  battery_requirement: /\b(battery|batteries|charge|charger|backup)\b|बैटरी|चार्ज/i,
  portability_requirement:
    /\b(light|lighter|weight|heavy|carry|portable|portability|kg|gram)\b|हल्क|वजन|भारी|किलो/i,
  target_budget: /\b(budget|price|cost|under|around)\b|₹|बजट|कीमत|हजार|हज़ार|रुपय/i,
  maximum_budget: /\b(stretch|maximum|max|up to|above|beyond|push|extra)\b|ज्यादा|ज़्यादा|ऊपर|अधिक/i,
  purchase_timing: /\b(today|tomorrow|week|month|now|urgent|wednesday|soon|deadline)\b|आज|कल|हफ्ते|जल्दी/i,
  brand_preferences: /\b(lenovo|hp|dell|asus|acer|apple|msi|samsung|brand)\b|ब्रांड|लेनोवो|एचपी/i,
  competitor_named: /\b(amazon|flipkart|croma|reliance|vijay sales|online)\b|अमेज़न|फ्लिपकार्ट|ऑनलाइन/i,
  finance_requested: /\b(emi|instal|finance|credit|hdfc|card)\b|ईएमआई|किस्त/i,
  promotion_discussed: /\b(offer|cashback|discount|promotion|deal|exchange|bonus)\b|ऑफर|छूट|कैशबैक/i,
  stock_status: /\b(stock|available|availability|out of|unit|inventory)\b|स्टॉक|उपलब्ध/i,
  product_demo_performed: /\b(demo|show|see|try|display unit|hands on)\b|दिखा|देख/i,
  cross_sell_offered: /\b(bag|mouse|antivirus|accessor|cover|sleeve)\b|बैग|माउस/i,
  upsell_offered: /\b(upgrade|higher|better model|more ram|bigger)\b|अपग्रेड|बड़ा/i,
  next_action: /\b(call|callback|confirm|check|come back|visit|later|will)\b|कॉल|वापस|बताऊ/i,
  requirement_origin: /\b(friend|youtube|online|research|review|suggested|told)\b|दोस्त|यूट्यूब/i,
};

type Verdict = "captured" | "missed" | "correctly-silent" | "invented" | "unjudged";

/**
 * Fields the extractor concludes rather than quotes.
 *
 * Nobody says "my arrival intent is specific_product" or "my clarity is 3". These
 * are judgements drawn from the whole conversation, so looking for them as
 * phrases in the dialogue finds nothing and reports every one as an invention.
 * They can still be wrong, but they cannot be fabricated in the sense that
 * matters — asserting a price nobody quoted — so they are judged on whether the
 * answer key agrees, never on whether the words appear.
 */
const INFERRED = new Set([
  "arrival_intent_state",
  "customer_mood",
  "requirement_clarity_start",
  "requirement_clarity_end",
  "final_decision_state",
  "objection_response",
  "language_mix",
  "customer_party_size",
  "alternative_offered",
  "purchase_category",
  "requirement_origin",
  "recommendation_reasons",
  "initial_request",
]);

/**
 * Numbers as the scripts write them, because they are written to be read aloud.
 *
 * The dialogue says "eighty thousand" and "seventy-eight thousand nine hundred
 * ninety-nine"; the record stores 80000 and 78999. Searching the dialogue for
 * digits found neither and reported both as values the extractor made up.
 */
const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
};

/** Every value the spelled-out numbers in a phrase could represent. */
function spelledNumbers(text: string): Set<string> {
  const found = new Set<string>();
  const tokens = text.toLowerCase().replace(/-/g, " ").split(/[^a-z]+/);
  let running = 0;
  let current = 0;
  const flush = () => {
    const total = running + current;
    if (total > 0) found.add(String(total));
    running = 0;
    current = 0;
  };
  for (const token of tokens) {
    if (token in NUMBER_WORDS) {
      current += NUMBER_WORDS[token]!;
    } else if (token === "hundred") {
      current = Math.max(current, 1) * 100;
    } else if (token === "thousand") {
      running += Math.max(current, 1) * 1000;
      current = 0;
    } else if (token === "lakh" || token === "lac") {
      running += Math.max(current, 1) * 100000;
      current = 0;
    } else {
      flush();
    }
  }
  flush();
  return found;
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "for", "in", "on", "with", "is",
  "are", "was", "were", "be", "been", "not", "no", "yes", "at", "as", "by",
  "if", "it", "its", "this", "that", "but", "from", "any", "all", "more", "than",
]);

function contentWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[₹,]/g, "")
      .split(/[^a-z0-9.]+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

/** Numbers a phrase mentions, with thousands shorthand expanded both ways. */
function numbers(text: string): Set<string> {
  const found = new Set<string>();
  for (const raw of text.replace(/[,\s](?=\d{3}\b)/g, "").match(/\d+(?:\.\d+)?/g) ?? []) {
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    found.add(String(value));
    if (value < 1000) found.add(String(value * 1000));
    if (value >= 1000 && value % 1000 === 0) found.add(String(value / 1000));
  }
  return found;
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0) return 1;
  let hit = 0;
  for (const item of a) if (b.has(item)) hit += 1;
  return hit / a.size;
}

/**
 * Whether the dialogue carries anything this field could be extracted from.
 *
 * Either a field-specific cue — the word "battery" for a battery requirement —
 * or the substance of the key's own answer turning up in what was said. The
 * first catches answers the key phrased in its own words; the second catches
 * fields with no obvious cue.
 */
function statedInDialogue(field: string, expected: string, dialogue: string): boolean {
  if (EVIDENCE[field]?.test(dialogue)) return true;
  const goldNumbers = numbers(expected);
  if (goldNumbers.size > 0) {
    // Digits as written, and every number the dialogue spells out in words.
    const spoken = numbers(dialogue);
    const spelled = spelledNumbers(dialogue);
    for (const n of goldNumbers) if (spoken.has(n) || spelled.has(n)) return true;
  }
  return overlap(contentWords(expected), contentWords(dialogue)) >= 0.34;
}

function looksRight(expected: string, actual: string): boolean {
  const goldNumbers = numbers(expected);
  if (goldNumbers.size > 0) return overlap(goldNumbers, numbers(actual)) >= 0.5;
  return overlap(contentWords(expected), contentWords(actual)) >= 0.25;
}

/**
 * Concepts the pack names as fields but the product stores as labelled entries.
 *
 * The pack has a row called "Portability requirement". The product has no such
 * field and never will: portability is one dimension a laptop buyer cares
 * about, alongside battery, weight and screen, and a schema with a column per
 * dimension stops working the moment the vertical changes. So
 * `additional_requirements` holds `portability = carried to college daily` and
 * the dimension lives in the label.
 *
 * Looking for a `portability_requirement` field therefore finds nothing and
 * reports a captured requirement as a lost one. These patterns say which labels
 * answer which row of the pack.
 */
const LABELLED_CONCEPTS: Record<string, RegExp> = {
  portability_requirement: /portab|weight|light|carry/i,
  battery_requirement: /batter|backup/i,
  display_requirement: /display|screen|panel/i,
  performance_requirement: /performance|speed|processor/i,
};

/** The fields that carry labelled dimension entries, in search order. */
const LABELLED_FIELDS = [
  "additional_requirements",
  "specification_requirements",
  "other_constraints",
  "decision_drivers",
];

const ALIASES: Record<string, string> = {
  decision_state: "final_decision_state",
  clarity_start: "requirement_clarity_start",
  clarity_end: "requirement_clarity_end",
  demo_performed: "product_demo_performed",
  cross_sell: "cross_sell_offered",
  upsell: "upsell_offered",
  stock_availability: "stock_status",
  customer_sentiment: "customer_mood",
  purchase_urgency: "purchase_timing",
  accessories_discussed: "cross_sell_offered",
};

const sql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false, max: 1 });

try {
  const gold: Record<string, Record<string, string>> = JSON.parse(
    await readFile(values.gold!, "utf8"),
  );
  const dialogues: Record<string, string> = JSON.parse(await readFile(values.dialogue!, "utf8"));

  const [organization] = await sql<{ id: string }[]>`
    select id from organizations where name = ${values.org!} order by created_at limit 1
  `;
  if (!organization) throw new Error(`No organization named ${values.org}.`);

  const rows = await sql<
    {
      title: string;
      field_key: string;
      label: string | null;
      value_text: string | null;
      value_amount_minor: string | null;
      abstention: string | null;
    }[]
  >`
    with newest as (
      select distinct on (c.title) c.title, r.id as record_id
      from interaction_records r
      join conversations c on c.id = r.conversation_id
      join transcription_runs tr on tr.id = r.source_transcription_run_id
      where r.organization_id = ${organization.id} and r.status = 'completed'
        and c.title like 'Script%' and tr.provider = ${values.provider!}
      order by c.title, r.created_at desc
    )
    select newest.title, v.field_key, v.label, v.value_text, v.value_amount_minor, v.abstention
    from newest join interaction_field_values v on v.interaction_record_id = newest.record_id
  `;

  /** Every labelled entry per script, so a pack concept can be looked up by label. */
  const labelled = new Map<string, { field: string; label: string; value: string }[]>();
  for (const row of rows) {
    if (row.abstention || !row.value_text) continue;
    if (!LABELLED_FIELDS.includes(row.field_key)) continue;
    const list = labelled.get(row.title) ?? [];
    list.push({
      field: row.field_key,
      // An unlabelled entry in a labelled field still describes its dimension in
      // the value itself — "Portability and battery life for weekly travel" —
      // so the value is searched when there is no label to search.
      label: row.label ?? row.value_text,
      value: row.value_text,
    });
    labelled.set(row.title, list);
  }

  const extracted = new Map<string, Map<string, string>>();
  for (const row of rows) {
    const value = row.abstention
      ? ""
      : row.value_amount_minor
        ? String(Number(row.value_amount_minor) / 100)
        : (row.value_text ?? "");
    const script = extracted.get(row.title) ?? new Map<string, string>();
    const existing = script.get(row.field_key);
    script.set(row.field_key, existing && value ? `${existing} | ${value}` : existing || value);
    extracted.set(row.title, script);
  }

  const totals: Record<Verdict, number> = {
    captured: 0,
    missed: 0,
    "correctly-silent": 0,
    invented: 0,
    unjudged: 0,
  };
  const misses: string[] = [];
  const inventions: string[] = [];

  console.log(
    `${"script".padEnd(11)}${"judged".padStart(8)}${"captured".padStart(10)}${"missed".padStart(8)}${"silent ok".padStart(11)}${"INVENTED".padStart(10)}`,
  );
  console.log("-".repeat(58));

  for (const script of Object.keys(gold).sort(
    (a, b) => Number(a.split(" ")[1]) - Number(b.split(" ")[1]),
  )) {
    const dialogue = dialogues[script];
    const fields = extracted.get(script);
    if (!dialogue || !fields) continue;

    const per: Record<Verdict, number> = {
      captured: 0,
      missed: 0,
      "correctly-silent": 0,
      invented: 0,
      unjudged: 0,
    };
    for (const [key, expected] of Object.entries(gold[script]!)) {
      const stored = ALIASES[key] ?? key;
      let actual = (fields.get(stored) ?? fields.get(key) ?? "").trim();

      // A concept with no field of its own is answered by the labelled entries.
      const concept = LABELLED_CONCEPTS[stored];
      if (!actual && concept) {
        actual = (labelled.get(script) ?? [])
          .filter((entry) => concept.test(entry.label) || concept.test(entry.value))
          .map((entry) => entry.value)
          .join(" | ");
      }
      // The key itself saying "None" settles the question before the dialogue
      // is consulted. `brand_preferences` is the case that matters: a
      // salesperson naming Acer and Lenovo puts both brands in the dialogue,
      // and searching for brand words then concludes a preference was stated
      // when the key explicitly records that none was. The key is the authority
      // on what the customer wanted; the dialogue only shows what was said.
      const keyExpectsNothing = /^(none|none stated|not stated|n\/a|no|—|-)\b/i.test(
        expected.trim(),
      );
      const present = keyExpectsNothing
        ? false
        : statedInDialogue(stored, expected, dialogue);

      let verdict: Verdict;
      if (INFERRED.has(stored)) {
        // A conclusion, not a quotation. Judged only against the answer key.
        verdict = !actual
          ? "missed"
          : looksRight(expected, actual)
            ? "captured"
            : "unjudged";
      } else if (present && actual) verdict = looksRight(expected, actual) ? "captured" : "unjudged";
      else if (present && !actual) verdict = "missed";
      else if (!present && !actual) verdict = "correctly-silent";
      else verdict = "invented";

      per[verdict] += 1;
      totals[verdict] += 1;
      if (verdict === "missed") {
        misses.push(
          `  ${script} · ${key}\n      said in the dialogue, absent from the record. key: ${expected.slice(0, 85)}`,
        );
      }
      if (verdict === "invented") {
        inventions.push(
          `  ${script} · ${key}\n      nothing in the dialogue. record asserts: ${actual.slice(0, 85)}`,
        );
      }
    }
    const judged = per.captured + per.missed + per["correctly-silent"] + per.invented;
    console.log(
      `${script.padEnd(11)}${judged.toString().padStart(8)}${per.captured.toString().padStart(10)}${per.missed.toString().padStart(8)}${per["correctly-silent"].toString().padStart(11)}${per.invented.toString().padStart(10)}`,
    );
  }

  const judged = totals.captured + totals.missed + totals["correctly-silent"] + totals.invented;
  console.log("-".repeat(58));
  console.log(
    `${"total".padEnd(11)}${judged.toString().padStart(8)}${totals.captured.toString().padStart(10)}${totals.missed.toString().padStart(8)}${totals["correctly-silent"].toString().padStart(11)}${totals.invented.toString().padStart(10)}`,
  );

  const right = totals.captured + totals["correctly-silent"];
  console.log(
    `\ncorrect: ${right}/${judged} (${((right / Math.max(judged, 1)) * 100).toFixed(0)}%) — ` +
      `${totals.captured} captured, ${totals["correctly-silent"]} correctly silent`,
  );
  console.log(
    `wrong:   ${totals.missed} missed, ${totals.invented} invented ` +
      `(plus ${totals.unjudged} extracted but phrased too differently to judge automatically)`,
  );

  if (inventions.length) {
    console.log(`\nInvented values — the outcome that matters most:\n\n${inventions.join("\n")}`);
  } else {
    console.log(
      "\nNo invented values: the extractor never asserted a fact the dialogue did not carry.",
    );
  }
  if (values.verbose && misses.length) {
    console.log(`\nMissed:\n\n${misses.join("\n")}`);
  }
} finally {
  await sql.end();
}
