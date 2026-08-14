/**
 * Loading any retailer's product file, whatever shape it arrives in.
 *
 * This replaces the fixed ten-column contract and the converters written by hand
 * to satisfy it. A file is read, its columns are put to a model once, every
 * proposal is checked against the column's own values, and what survives becomes
 * the catalogue. Attributes declared as columns are stored directly rather than
 * inferred from prose, which is the case the previous design could not handle at
 * all — the Delaware dealer feed has no description and declares bodystyle,
 * fueltype and price as columns.
 *
 * Accepts csv, tsv and xlsx. The taxonomy is whatever the retailer's own
 * category columns say; none of it is mapped onto vocabulary of ours.
 *
 * Usage:
 *   node --env-file=.env.local --experimental-strip-types --conditions=react-server \
 *     --import ./scripts/register-alias.mjs \
 *     scripts/ingest-catalogue.mts --file <path> --org "<organization>" [--dry-run]
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { parseArgs } from "node:util";

import postgres from "postgres";

import { proposeColumnRoles } from "@/modules/catalogue/column-inference";
import {
  judgeColumn,
  parseMoney,
  resolveConflicts,
  type ColumnVerdict,
  type ProposedColumn,
} from "@/modules/catalogue/column-roles";
import { contentHash, parseDelimited } from "@/modules/catalogue/csv";
import { ATTRIBUTE_EXTRACTOR_VERSION } from "@/modules/catalogue/attribute-schema";

const { values } = parseArgs({
  options: {
    file: { type: "string" },
    org: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    reinfer: { type: "boolean", default: false },
    currency: { type: "string" },
  },
});
if (!values.file || !values.org) {
  console.error('Usage: --file <path> --org "<organization>" [--dry-run]');
  process.exit(1);
}

/** Rows of a file, whatever container it came in. */
function readTable(path: string): { columns: string[]; rows: string[][] } {
  if (extname(path).toLowerCase() === ".xlsx") {
    const json = execFileSync(
      "python3",
      [
        "-c",
        `
import json, openpyxl, sys
wb = openpyxl.load_workbook(sys.argv[1], read_only=True)
# The widest sheet is the data; summary tabs are narrow and short.
ws = max(wb.worksheets, key=lambda s: (s.max_row or 0) * (s.max_column or 0))
rows = [[('' if c is None else str(c)) for c in r] for r in ws.iter_rows(values_only=True)]
print(json.dumps(rows))
`,
        path,
      ],
      { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
    );
    const table: string[][] = JSON.parse(json);
    return { columns: table[0]!.map((c) => c.trim()), rows: table.slice(1) };
  }

  const text = readFileSync(path, "utf8");
  const delimiter = extname(path).toLowerCase() === ".tsv" ? "\t" : ",";
  const table = parseDelimited(text, delimiter);
  return { columns: table[0]!.map((c) => c.trim()), rows: table.slice(1) };
}

const sql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false, max: 4 });

try {
  const [organization] = await sql<{ id: string; default_currency: string }[]>`
    select id, default_currency from organizations
    where name = ${values.org!} order by created_at limit 1
  `;
  if (!organization) throw new Error(`No organization named ${values.org}.`);

  const { columns, rows } = readTable(values.file!);
  console.log(`${rows.length.toLocaleString()} rows, ${columns.length} columns.\n`);

  // A spread of rows rather than the first forty, which in a file sorted by id
  // are one product family repeated.
  const step = Math.max(1, Math.floor(rows.length / 40));
  const sample = rows.filter((_, index) => index % step === 0).slice(0, 40);

  // A mapping already agreed for this retailer is reused rather than asked
  // again. The same Delaware file came back with bodystyle as a category on one
  // run and as an attribute on the next, which silently emptied the taxonomy and
  // left every product ungrouped — a load that reported success and produced a
  // catalogue nobody could search. The file has not changed between uploads;
  // only the model's answer did, and re-deriving it every time makes a
  // retailer's catalogue reshape itself on a schedule.
  const stored = values.reinfer
    ? []
    : await sql<
        { source_column: string; role: string; value_kind: string | null; unit: string | null }[]
      >`
        select source_column, role, value_kind, unit
        from public.catalogue_source_columns
        where organization_id = ${organization.id} and accepted
      `;
  const reusable = stored.filter((row) => columns.includes(row.source_column));

  const proposed =
    reusable.length > 0
      ? reusable.map((row) => ({
          column: row.source_column,
          role: row.role as ProposedColumn["role"],
          valueKind: (row.value_kind ?? undefined) as ProposedColumn["valueKind"],
          unit: row.unit,
        }))
      : await proposeColumnRoles({
          filename: basename(values.file!),
          columns,
          rows: sample,
        });
  console.log(
    reusable.length > 0
      ? `Reusing the mapping agreed for this retailer (${reusable.length} columns).\n`
      : "No mapping on file; reading the columns.\n",
  );

  const verdicts: ColumnVerdict[] = resolveConflicts(
    proposed.map((proposal) => {
      const index = columns.indexOf(proposal.column);
      const columnValues = index >= 0 ? rows.map((row) => row[index] ?? "") : [];
      return judgeColumn(proposal, { column: proposal.column, values: columnValues });
    }),
  );

  console.log("What each column turned out to be:\n");
  for (const verdict of verdicts) {
    const mark = verdict.accepted ? "OK  " : "NO  ";
    const detail = verdict.accepted ? "" : ` (${verdict.reason})`;
    console.log(
      `  ${mark}${verdict.column.padEnd(16)} ${verdict.role.padEnd(12)}${(verdict.valueKind ?? "").padEnd(12)} ${verdict.distinctValues} distinct${detail}`,
    );
  }

  const roleOf = (role: string) => verdicts.find((v) => v.accepted && v.role === role);
  const indexOf = (verdict: ColumnVerdict | undefined) =>
    verdict ? columns.indexOf(verdict.column) : -1;

  const identifier = roleOf("identifier");
  if (!identifier) throw new Error("No column could be accepted as the identifier.");

  const description = indexOf(roleOf("description"));
  const brand = indexOf(roleOf("brand"));
  const category1 = indexOf(roleOf("category_1"));
  const category2 = indexOf(roleOf("category_2"));
  const category3 = indexOf(roleOf("category_3"));
  const price = indexOf(roleOf("price"));
  const msrp = indexOf(roleOf("msrp"));
  const stockColumn = indexOf(roleOf("stock"));
  const identifierIndex = indexOf(identifier);

  const attributeColumns = verdicts
    .filter((verdict) => verdict.accepted && verdict.role === "attribute")
    .map((verdict) => ({ verdict, index: columns.indexOf(verdict.column) }))
    .filter((entry) => entry.index >= 0);

  console.log(
    `\nidentifier=${identifier.column}` +
      `  description=${description >= 0 ? columns[description] : "none"}` +
      `  price=${price >= 0 ? columns[price] : "none"}` +
      `\ncategories=${
        [category1, category2, category3]
          .filter((i) => i >= 0)
          .map((i) => columns[i])
          .join(" > ") || "none"
      }` +
      `\nattributes=${attributeColumns.map((a) => a.verdict.column).join(", ") || "none"}`,
  );

  if (values["dry-run"]) {
    console.log("\nDry run: nothing written.");
    process.exit(0);
  }

  const currency = values.currency ?? organization.default_currency ?? "INR";
  const cell = (row: string[], index: number) => (index >= 0 ? (row[index] ?? "").trim() : "");
  const money = (row: string[], index: number): number | null => {
    const parsed = parseMoney(cell(row, index));
    return parsed === null ? null : Math.round(parsed * 100);
  };

  for (const verdict of verdicts) {
    await sql`
      insert into public.catalogue_source_columns (
        organization_id, source_column, role, value_kind, unit, accepted,
        rejection_reason, distinct_values, null_share, sample_values
      ) values (
        ${organization.id}, ${verdict.column}, ${verdict.role}, ${verdict.valueKind},
        ${verdict.unit}, ${verdict.accepted},
        ${verdict.accepted ? null : verdict.reason},
        ${verdict.distinctValues}, ${verdict.nullShare}, ${verdict.sampleValues}
      )
      on conflict (organization_id, source_column) do update set
        role = excluded.role, value_kind = excluded.value_kind, unit = excluded.unit,
        accepted = excluded.accepted, rejection_reason = excluded.rejection_reason,
        distinct_values = excluded.distinct_values, null_share = excluded.null_share,
        sample_values = excluded.sample_values, inferred_at = now()
    `;
  }

  const [importRow] = await sql<{ id: string }[]>`
    insert into public.catalogue_imports (organization_id, filename, status, row_count)
    values (${organization.id}, ${basename(values.file!)}, 'processing', ${rows.length})
    returning id
  `;
  const importId = importRow!.id;

  const seen = new Set<string>();
  const staged = rows
    .map((row) => {
      const itemId = cell(row, identifierIndex);
      if (!itemId || seen.has(itemId)) return null;
      seen.add(itemId);
      const parts = [cell(row, category1), cell(row, category2), cell(row, category3)];
      return {
        organization_id: organization.id,
        import_id: importId,
        item_id: itemId,
        description:
          description >= 0
            ? cell(row, description)
            : // No description column: one is composed from the brand and the
              // categories so the row is still nameable on a screen. It is not
              // used for attribute discovery, which reads the columns instead.
              [cell(row, brand), ...parts].filter(Boolean).join(" ") || itemId,
        brand_id: null,
        brand_name: brand >= 0 ? cell(row, brand) || null : null,
        dept_id: null,
        dept_name: parts[0] || null,
        group_id: null,
        group_name: parts[1] || null,
        subgroup_id: null,
        subgroup_name: parts[2] || null,
        content_hash: contentHash({
          itemId,
          description:
            description >= 0
              ? cell(row, description)
              : [cell(row, brand), ...parts].filter(Boolean).join(" ") || itemId,
          brandId: null,
          brandName: brand >= 0 ? cell(row, brand) || null : null,
          deptId: null,
          deptName: parts[0] || null,
          groupId: null,
          groupName: parts[1] || null,
          subgroupId: null,
          subgroupName: parts[2] || null,
        }),
        price_minor: money(row, price),
        msrp_minor: money(row, msrp),
        currency_code: price >= 0 ? currency : null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  await sql`delete from public.catalogue_staging where import_id = ${importId}`;
  for (let index = 0; index < staged.length; index += 1000) {
    await sql`insert into public.catalogue_staging ${sql(staged.slice(index, index + 1000))}`;
  }
  await sql`select set_config('statement_timeout', '3600s', false)`;
  const [applied] = await sql<{ added: number; changed: number; delisted: number }[]>`
    select * from public.apply_catalogue_import(${importId}::uuid)
  `;
  console.log(
    `\napplied: added ${applied?.added ?? 0}, changed ${applied?.changed ?? 0}, delisted ${applied?.delisted ?? 0}`,
  );

  // Attributes the retailer declared as columns. No discovery, no model: the
  // retailer has already said what these products vary by, and inferring it from
  // prose would be solving a problem they do not have.
  if (attributeColumns.length > 0) {
    const attributeRows = rows.flatMap((row) => {
      const itemId = cell(row, identifierIndex);
      if (!itemId) return [];
      return attributeColumns.flatMap(({ verdict, index }) => {
        const raw = cell(row, index);
        if (!raw) return [];
        const numeric = verdict.valueKind === "numeric" ? Number(raw.replace(/,/g, "")) : NaN;
        const isNumeric = Number.isFinite(numeric);
        return [
          {
            organization_id: organization.id,
            item_id: itemId,
            attribute_key: verdict.column.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
            value_text: isNumeric ? null : raw,
            value_numeric: isNumeric ? numeric : null,
            unit: verdict.unit,
            extractor_version: ATTRIBUTE_EXTRACTOR_VERSION,
          },
        ];
      });
    });

    const unique = new Map<string, (typeof attributeRows)[number]>();
    for (const row of attributeRows) unique.set(`${row.item_id}|${row.attribute_key}`, row);
    const list = [...unique.values()];
    for (let index = 0; index < list.length; index += 2000) {
      await sql`
        insert into public.catalogue_item_attributes ${sql(list.slice(index, index + 2000))}
        on conflict do nothing
      `;
    }
    console.log(`declared attributes stored: ${list.length.toLocaleString()}`);
  }

  if (stockColumn >= 0) {
    const stockRows = rows
      .map((row) => {
        const itemId = cell(row, identifierIndex);
        const quantity = Number(cell(row, stockColumn));
        if (!itemId || !Number.isFinite(quantity)) return null;
        return {
          organization_id: organization.id,
          item_id: itemId,
          location_id: null,
          stock: Math.trunc(quantity),
          as_of: new Date().toISOString(),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
    await sql`delete from public.inventory where organization_id = ${organization.id}`;
    for (let index = 0; index < stockRows.length; index += 1000) {
      await sql`insert into public.inventory ${sql(stockRows.slice(index, index + 1000))}`;
    }
    console.log(`inventory rows stored: ${stockRows.length.toLocaleString()}`);
  }
} finally {
  await sql.end();
}
