/**
 * What changed when the extraction prompt was replaced.
 *
 * The v1.1 specification is a far more careful document than the one-line field
 * definitions it replaces: it separates a thing that was said from a judgement
 * made about it, scopes some fields to the opening of a conversation and others
 * to its close, keeps linked events linked, and adds nine fields for what a
 * customer settled on and what actually blocked a sale.
 *
 * More careful is not automatically better, and on a single conversation it is
 * impossible to tell. So every recording is compared field by field against the
 * record the old prompt produced, and the differences are grouped by the kind of
 * change rather than counted: a field that gained a value, one that lost it, one
 * that changed its mind, and the fields that only exist now.
 *
 * The count that matters least is the total. A prompt that extracts more is not
 * better if what it added is wrong, and this run's most interesting number is
 * how often the new prompt abstains where the old one committed — because that
 * is the behaviour the specification asks for, and the one a manager will trust.
 *
 * Usage:
 *   node --env-file=.env.local --experimental-strip-types \
 *     scripts/asr-eval/compare-prompt-versions.mts --org "AG LLC" \
 *     --before eval/before-v11.json
 */

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import postgres from "postgres";

const { values } = parseArgs({
  options: {
    org: { type: "string", default: "AG LLC" },
    before: { type: "string", default: "eval/before-v11.json" },
    verbose: { type: "boolean", default: false },
  },
});

type Row = {
  field_key: string;
  label: string | null;
  value_text: string | null;
  value_amount_minor: string | null;
  abstention: string | null;
};

/** One field's worth of a record, as a comparable string. */
function render(rows: readonly Row[]): string {
  return rows
    .map((row) =>
      row.abstention
        ? `[${row.abstention}]`
        : row.value_amount_minor
          ? `₹${Number(row.value_amount_minor) / 100}`
          : `${row.label ? `${row.label}=` : ""}${(row.value_text ?? "").trim()}`,
    )
    .sort()
    .join(" | ");
}

const sql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false, max: 1 });

try {
  const before: Record<string, string> = JSON.parse(readFileSync(values.before!, "utf8"));

  const [organization] = await sql<{ id: string }[]>`
    select id from organizations where name = ${values.org!} order by created_at limit 1
  `;
  if (!organization) throw new Error(`No organization named ${values.org}.`);

  const after = Object.fromEntries(
    (
      await sql<{ title: string; record_id: string }[]>`
        select distinct on (c.title) c.title, r.id as record_id
        from interaction_records r
        join conversations c on c.id = r.conversation_id
        where r.organization_id = ${organization.id} and r.status = 'completed'
          and c.title is not null
        order by c.title, r.created_at desc
      `
    ).map((row) => [row.title, row.record_id]),
  );

  const valuesOf = async (recordId: string) => {
    const rows = await sql<Row[]>`
      select field_key, label, value_text, value_amount_minor, abstention
      from interaction_field_values where interaction_record_id = ${recordId}
    `;
    const byField = new Map<string, Row[]>();
    for (const row of rows) {
      const list = byField.get(row.field_key) ?? [];
      list.push(row);
      byField.set(row.field_key, list);
    }
    return byField;
  };

  let gained = 0;
  let lost = 0;
  let changed = 0;
  let same = 0;
  let newOnly = 0;
  const newFieldHits = new Map<string, number>();
  const abstainedNow: string[] = [];
  const notes: string[] = [];

  const titles = Object.keys(before).filter((title) => after[title] && after[title] !== before[title]);
  console.log(
    `${titles.length} conversation(s) re-extracted with the v1.1 prompt.\n`,
  );
  console.log(
    `${"conversation".padEnd(34)}${"gained".padStart(8)}${"lost".padStart(7)}${"changed".padStart(9)}${"new".padStart(6)}`,
  );
  console.log("-".repeat(64));

  for (const title of titles) {
    const [old, now] = [await valuesOf(before[title]!), await valuesOf(after[title]!)];
    let g = 0;
    let l = 0;
    let c = 0;
    let n = 0;

    for (const key of new Set([...old.keys(), ...now.keys()])) {
      const oldRows = old.get(key) ?? [];
      const nowRows = now.get(key) ?? [];
      if (oldRows.length === 0) {
        n += 1;
        newOnly += 1;
        if (nowRows.some((row) => !row.abstention)) {
          newFieldHits.set(key, (newFieldHits.get(key) ?? 0) + 1);
        }
        continue;
      }
      const oldStated = oldRows.some((row) => !row.abstention);
      const nowStated = nowRows.some((row) => !row.abstention);
      const oldText = render(oldRows);
      const nowText = render(nowRows);

      if (oldText === nowText) {
        same += 1;
      } else if (!oldStated && nowStated) {
        g += 1;
        gained += 1;
        if (values.verbose) notes.push(`  + ${title} · ${key}: ${nowText.slice(0, 70)}`);
      } else if (oldStated && !nowStated) {
        l += 1;
        lost += 1;
        abstainedNow.push(`  − ${title} · ${key}: was "${oldText.slice(0, 52)}" now ${nowText}`);
      } else {
        c += 1;
        changed += 1;
        if (values.verbose) {
          notes.push(`  ~ ${title} · ${key}\n      was: ${oldText.slice(0, 66)}\n      now: ${nowText.slice(0, 66)}`);
        }
      }
    }
    console.log(
      `${title.slice(0, 33).padEnd(34)}${String(g).padStart(8)}${String(l).padStart(7)}${String(c).padStart(9)}${String(n).padStart(6)}`,
    );
  }

  console.log("-".repeat(64));
  console.log(
    `${"total".padEnd(34)}${String(gained).padStart(8)}${String(lost).padStart(7)}${String(changed).padStart(9)}${String(newOnly).padStart(6)}`,
  );
  console.log(`\n${same} field(s) identical between the two prompts.`);

  console.log("\nFields the v1.1 spec adds, and how many conversations gave them a value:");
  const added = [...newFieldHits].sort((a, b) => b[1] - a[1]);
  if (added.length === 0) console.log("  none returned a value");
  for (const [key, count] of added) console.log(`  ${key.padEnd(32)} ${count}`);

  console.log(
    `\nWhere the new prompt abstains and the old one committed (${abstainedNow.length}):`,
  );
  for (const line of abstainedNow.slice(0, 25)) console.log(line);

  if (values.verbose && notes.length) {
    console.log(`\nEverything else that moved (${notes.length}):`);
    console.log(notes.slice(0, 60).join("\n"));
  }
} finally {
  await sql.end();
}
