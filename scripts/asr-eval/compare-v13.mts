/**
 * What the v1.3 specification changed, on real recordings.
 *
 * The number that matters least is the total. A prompt that extracts more is not
 * better if what it added is wrong, so the differences are grouped by kind: a
 * field that gained a value, one that lost it, one that changed its answer, and
 * the fields that only exist under the new spec.
 *
 * Usage:
 *   node --env-file=.env.local --experimental-strip-types \
 *     scripts/asr-eval/compare-v13.mts --org "AG LLC" --before eval/before-v13.json
 */

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import postgres from "postgres";

const { values } = parseArgs({
  options: {
    org: { type: "string", default: "AG LLC" },
    before: { type: "string", default: "eval/before-v13.json" },
    show: { type: "string" },
  },
});

const NEW_FIELDS = new Set([
  "cross_sell_pitch",
  "cross_sell_hierarchy",
  "upsell_pitch",
  "upsell_hierarchy",
  "confirmed_business_outcome",
  "outcome_basis",
]);

/** Matches the separator the snapshot writes; see reextract-all.mts. */
const KEY_SEPARATOR = "\u0000";

const sql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false, max: 1 });

type Row = {
  title: string;
  field_key: string;
  label: string | null;
  value_text: string | null;
  value_amount_minor: string | null;
  abstention: string | null;
};

try {
  const before: Record<string, string> = JSON.parse(readFileSync(values.before!, "utf8"));

  const rows = await sql<Row[]>`
    with latest as (
      select distinct on (c.title) c.title, r.id
      from interaction_records r
      join conversations c on c.id = r.conversation_id
      join organizations o on o.id = r.organization_id
      where o.name = ${values.org!} and r.status = 'completed' and c.title is not null
      order by c.title, r.created_at desc
    )
    select latest.title, v.field_key, v.label, v.value_text, v.value_amount_minor, v.abstention
    from latest join interaction_field_values v on v.interaction_record_id = latest.id`;

  const after: Record<string, string[]> = {};
  for (const row of rows) {
    const rendered = row.abstention
      ? `[${row.abstention}]`
      : row.value_amount_minor
        ? `₹${Number(row.value_amount_minor) / 100}`
        : `${row.label ? `${row.label}=` : ""}${(row.value_text ?? "").trim()}`;
    const key = `${row.title}${KEY_SEPARATOR}${row.field_key}`;
    (after[key] ??= []).push(rendered);
  }
  const afterText = Object.fromEntries(
    Object.entries(after).map(([key, list]) => [key, list.sort().join(" | ")]),
  );

  const conversations = new Set<string>();
  const stats = new Map<string, { gained: number; lost: number; changed: number; added: number }>();
  const bump = (title: string, kind: "gained" | "lost" | "changed" | "added") => {
    const row = stats.get(title) ?? { gained: 0, lost: 0, changed: 0, added: 0 };
    row[kind] += 1;
    stats.set(title, row);
  };

  /** A value is "present" when it is neither absent nor an abstention. */
  const stated = (text: string | undefined) => Boolean(text) && !/^\[[a-z_]+\]$/.test(text!);

  const newFieldHits = new Map<string, number>();
  const abstainedNow: string[] = [];

  for (const key of new Set([...Object.keys(before), ...Object.keys(afterText)])) {
    const [title = key, field = ""] = key.split(KEY_SEPARATOR);
    conversations.add(title);
    const was = before[key];
    const now = afterText[key];
    if (was === now) continue;

    if (NEW_FIELDS.has(field)) {
      if (stated(now)) newFieldHits.set(field, (newFieldHits.get(field) ?? 0) + 1);
      bump(title, "added");
      continue;
    }
    if (!stated(was) && stated(now)) bump(title, "gained");
    else if (stated(was) && !stated(now)) {
      bump(title, "lost");
      if (now) abstainedNow.push(`${key}: "${was}" → ${now}`);
    } else bump(title, "changed");
  }

  console.log(`\n${conversations.size} conversation(s) compared against ${values.before}\n`);
  console.log("conversation                          gained   lost  changed    new");
  console.log("-".repeat(70));
  const totals = { gained: 0, lost: 0, changed: 0, added: 0 };
  for (const title of [...conversations].sort()) {
    const row = stats.get(title);
    if (!row) continue;
    totals.gained += row.gained;
    totals.lost += row.lost;
    totals.changed += row.changed;
    totals.added += row.added;
    console.log(
      `${title.slice(0, 34).padEnd(36)} ${String(row.gained).padStart(6)} ${String(row.lost).padStart(6)} ${String(row.changed).padStart(8)} ${String(row.added).padStart(6)}`,
    );
  }
  console.log("-".repeat(70));
  console.log(
    `${"total".padEnd(36)} ${String(totals.gained).padStart(6)} ${String(totals.lost).padStart(6)} ${String(totals.changed).padStart(8)} ${String(totals.added).padStart(6)}`,
  );

  console.log("\nFields v1.3 adds, and how many conversations gave them a value:");
  for (const field of NEW_FIELDS) {
    console.log(`  ${field.padEnd(28)} ${newFieldHits.get(field) ?? 0} / ${conversations.size}`);
  }

  console.log(`\nWhere v1.3 abstains and the old record committed (${abstainedNow.length}):`);
  for (const line of abstainedNow.slice(0, Number(values.show ?? 12))) console.log(`  ${line}`);
} finally {
  await sql.end();
}
