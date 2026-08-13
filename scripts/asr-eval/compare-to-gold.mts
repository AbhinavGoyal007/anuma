/**
 * Comparing what the product extracted against what the test pack expects.
 *
 * Every earlier measurement asked whether a fact survived transcription. This
 * asks the question the pack was written for: does the Commercial Interaction
 * Record match the answer key, field by field.
 *
 * The two sides are written differently on purpose. The pack says "Defined /
 * high clarity" and "Initially ~₹65,000; revised willingness ~₹75,000"; the
 * product stores an enum and an integer in paise. So the comparison is by
 * *content*, not by string: the numbers a field mentions must appear, and the
 * distinctive words must appear. Anything the rules cannot judge is reported as
 * needing a person rather than scored — a comparison that quietly marks its own
 * uncertainty as a pass is worse than no comparison.
 *
 * Abstentions are read as answers. The pack expects "None stated" in places, and
 * a correct abstention is the product working, not a gap.
 *
 * Usage:
 *   node --env-file=.env.local --experimental-strip-types \
 *     scripts/asr-eval/compare-to-gold.mts --gold eval/gold-fields.json --org "AG LLC"
 */

import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import postgres from "postgres";

const { values } = parseArgs({
  options: {
    gold: { type: "string", default: "eval/gold-fields.json" },
    org: { type: "string", default: "AG LLC" },
    provider: { type: "string", default: "voxtral" },
    verbose: { type: "boolean", default: false },
  },
});

type Verdict = "match" | "differs" | "review" | "both-empty";

/**
 * The pack's field names, as the product stores them.
 *
 * The test pack was written against the founder blueprint and the product's
 * schema drifted from it. Same concept, different key — and without this every
 * one of these fields reads as "the product extracted nothing", which is a
 * naming difference reported as an extraction failure.
 */
const FIELD_ALIASES: Record<string, string> = {
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

/**
 * The vocabulary each side uses for the same answer.
 *
 * The pack describes an arrival in prose — "Defined / high clarity" — where the
 * product stores an enum. Neither is wrong; they are the same fact written for
 * different readers, and comparing the strings would score the schema rather
 * than the extraction.
 */
const ENUM_SYNONYMS: Record<string, string[]> = {
  specific_product: ["defined", "exact", "specific", "high clarity"],
  ready_to_buy: ["defined", "ready", "decided"],
  comparing: ["comparing", "compare", "evaluating"],
  exploratory: ["exploratory", "low clarity", "unclear", "browsing"],
  purchased: ["purchase", "bought", "sale", "closed"],
  deferred: ["deferred", "postponed", "no sale", "walked"],
  researching: ["research", "considering", "undecided"],
  follow_up_scheduled: ["follow", "callback", "revisit"],
  yes: ["yes", "done", "performed", "discussed", "offered"],
  no: ["no", "not", "none"],
  not_applicable: ["n/a", "not applicable", "none"],
  not_stated: ["not stated", "none stated", "unknown"],
};

/** Words that carry no distinguishing weight when comparing two phrasings. */
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "for", "in", "on", "with", "is",
  "are", "was", "were", "be", "been", "not", "no", "yes", "at", "as", "by",
  "if", "it", "its", "this", "that", "but", "from", "any", "all", "more",
  "than", "then", "so", "up", "out", "about", "into", "over", "after",
]);

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[₹,]/g, "")
      .split(/[^a-z0-9.]+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

/** Every number a phrase mentions, with thousands shorthand expanded. */
function numbers(text: string): Set<string> {
  const found = new Set<string>();
  for (const raw of text.replace(/[,\s](?=\d{3}\b)/g, "").match(/\d+(?:\.\d+)?/g) ?? []) {
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    found.add(String(value));
    // "65" in the key and "65000" in the record are the same budget.
    if (value < 1000) found.add(String(value * 1000));
    if (value >= 1000 && value % 1000 === 0) found.add(String(value / 1000));
  }
  return found;
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0) return b.size === 0 ? 1 : 0;
  let hit = 0;
  for (const item of a) if (b.has(item)) hit += 1;
  return hit / a.size;
}

function judge(gold: string, actual: string): Verdict {
  // An enum answer is checked against the words the pack uses for it before
  // anything else, because the two vocabularies share almost no characters.
  const enumKey = actual.trim().toLowerCase();
  const synonyms = ENUM_SYNONYMS[enumKey];
  if (synonyms) {
    const lowered = gold.toLowerCase();
    if (synonyms.some((word) => lowered.includes(word))) return "match";
  }

  const goldEmpty = /^(none|none stated|not stated|n\/a|—|-)?$/i.test(gold.trim());
  const actualEmpty = actual.trim() === "" || /^\[.*\]$/.test(actual.trim());

  if (goldEmpty && actualEmpty) return "both-empty";
  if (goldEmpty !== actualEmpty) return "differs";

  const goldNumbers = numbers(gold);
  if (goldNumbers.size > 0) {
    // A field the key states numerically is judged on its numbers. A budget that
    // reads well but says the wrong figure is wrong.
    const share = overlap(goldNumbers, numbers(actual));
    if (share >= 0.5) return "match";
    if (share === 0) return "differs";
    return "review";
  }

  const share = overlap(words(gold), words(actual));
  if (share >= 0.4) return "match";
  if (share <= 0.1) return "differs";
  return "review";
}

const sql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false, max: 1 });

try {
  const gold: Record<string, Record<string, string>> = JSON.parse(
    await readFile(values.gold!, "utf8"),
  );

  const [organization] = await sql<{ id: string }[]>`
    select id from organizations where name = ${values.org!} order by created_at limit 1
  `;
  if (!organization) throw new Error(`No organization named ${values.org}.`);

  const rows = await sql<
    {
      title: string;
      field_key: string;
      value_text: string | null;
      value_amount_minor: string | null;
      abstention: string | null;
    }[]
  >`
    with newest as (
      select distinct on (c.title) c.title, r.id as record_id
      from interaction_records r
      join conversations c on c.id = r.conversation_id
      -- The run the record was actually built from, not whichever run the
      -- conversation currently points at. The active pointer moves when a new
      -- transcript lands; a record's own source never does.
      join transcription_runs tr on tr.id = r.source_transcription_run_id
      where r.organization_id = ${organization.id}
        and r.status = 'completed'
        and c.title like 'Script%'
        and tr.provider = ${values.provider!}
      order by c.title, r.created_at desc
    )
    select newest.title, v.field_key, v.value_text, v.value_amount_minor, v.abstention
    from newest
    join interaction_field_values v on v.interaction_record_id = newest.record_id
  `;

  const extracted = new Map<string, Map<string, string[]>>();
  for (const row of rows) {
    const value = row.abstention
      ? ""
      : row.value_amount_minor
        ? String(Number(row.value_amount_minor) / 100)
        : (row.value_text ?? "");
    const script = extracted.get(row.title) ?? new Map<string, string[]>();
    const list = script.get(row.field_key) ?? [];
    if (value) list.push(value);
    script.set(row.field_key, list);
    extracted.set(row.title, script);
  }

  const totals: Record<Verdict, number> = {
    match: 0,
    differs: 0,
    review: 0,
    "both-empty": 0,
  };
  const problems: string[] = [];

  const scripts = Object.keys(gold).sort(
    (a, b) => Number(a.split(" ")[1]) - Number(b.split(" ")[1]),
  );

  console.log(`${"script".padEnd(11)}${"fields".padStart(7)}${"match".padStart(8)}${"differ".padStart(8)}${"review".padStart(8)}`);
  console.log("-".repeat(42));

  for (const script of scripts) {
    const fields = gold[script]!;
    const actualFields = extracted.get(script);
    if (!actualFields) {
      console.log(`${script.padEnd(11)}${"—".padStart(7)}   no extracted record`);
      continue;
    }
    const perScript: Record<Verdict, number> = { match: 0, differs: 0, review: 0, "both-empty": 0 };

    for (const [key, expected] of Object.entries(fields)) {
      const stored = FIELD_ALIASES[key] ?? key;
      const actual = (actualFields.get(stored) ?? actualFields.get(key) ?? []).join(" | ");
      const verdict = judge(expected, actual);
      perScript[verdict] += 1;
      totals[verdict] += 1;
      if (verdict !== "match" && verdict !== "both-empty") {
        problems.push(
          `  ${script} · ${key} [${verdict}]\n      expected: ${expected.slice(0, 110)}\n      got:      ${actual.slice(0, 110) || "(abstained)"}`,
        );
      }
    }
    const scored = perScript.match + perScript.differs + perScript.review;
    console.log(
      `${script.padEnd(11)}${scored.toString().padStart(7)}${perScript.match.toString().padStart(8)}${perScript.differs.toString().padStart(8)}${perScript.review.toString().padStart(8)}`,
    );
  }

  const scored = totals.match + totals.differs + totals.review;
  console.log("-".repeat(42));
  console.log(
    `${"total".padEnd(11)}${scored.toString().padStart(7)}${totals.match.toString().padStart(8)}${totals.differs.toString().padStart(8)}${totals.review.toString().padStart(8)}`,
  );
  console.log(
    `\nagreement: ${((totals.match / Math.max(scored, 1)) * 100).toFixed(0)}% matched, ` +
      `${((totals.review / Math.max(scored, 1)) * 100).toFixed(0)}% need a person, ` +
      `${((totals.differs / Math.max(scored, 1)) * 100).toFixed(0)}% differ` +
      ` (plus ${totals["both-empty"]} fields the key and the record both leave empty)`,
  );

  if (values.verbose && problems.length) {
    console.log(`\nEverything not an outright match:\n\n${problems.join("\n")}`);
  } else if (problems.length) {
    console.log(`\nFirst 15 of ${problems.length} needing attention:\n\n${problems.slice(0, 15).join("\n")}`);
  }
} finally {
  await sql.end();
}
