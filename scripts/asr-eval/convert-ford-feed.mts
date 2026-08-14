/**
 * Mapping a real dealer inventory feed onto the catalogue contract.
 *
 * The feed is a Delaware sample covering four dealerships and three makes, one
 * row per physical vehicle, keyed by VIN. It is the first real non-electronics
 * master this system has seen and it does not fit, in ways worth writing down
 * rather than smoothing over.
 *
 * There is no description. The electronics retailer packs everything into one
 * free-text field — "Akai ART4900G TM Refrigerator 302L SLV" — and the whole
 * attribute-discovery design exists to read that convention back out. This feed
 * has already done that work: bodystyle, fueltype, trim, price, msrp, year and
 * mileage are columns. Discovering them from prose would be solving a problem
 * this retailer does not have.
 *
 * The ten columns the loader requires can therefore hold only part of it. What
 * fits: vin as the item, year/make/model/trim as a description written the way a
 * dealer writes one, make as the brand, bodystyle and model as the taxonomy.
 * What does not fit, and is dropped here rather than quietly: price, msrp,
 * fueltype, mileage, and new-versus-used. Price is the serious one — for a car
 * it is the dimension every conversation turns on.
 *
 * The data is also messy in the ordinary way real data is, and none of it is
 * corrected here. Three dealers write "SUVs" where the fourth writes "Sport
 * Utility". Boulevard Ford's rows carry a bodystyle in the new/used column.
 * Two rows are priced at zero. Correcting any of that would be testing a
 * cleaned-up world.
 *
 * Usage:
 *   node --experimental-strip-types scripts/asr-eval/convert-ford-feed.mts \
 *     --in ~/Downloads/Data_Delaware-Dealer-Samples_2025-06-25.xlsx \
 *     --out eval/ford/items.csv --stock eval/ford/stock.csv
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    in: { type: "string" },
    out: { type: "string", default: "eval/ford/items.csv" },
    stock: { type: "string", default: "eval/ford/stock.csv" },
  },
});
if (!values.in) {
  console.error("Usage: --in <feed.xlsx> [--out items.csv] [--stock stock.csv]");
  process.exit(1);
}

/** Read the sheet through Python, which is the only xlsx reader available. */
const raw = execFileSync(
  "python3",
  [
    "-c",
    `
import json, openpyxl, sys
wb = openpyxl.load_workbook(sys.argv[1], read_only=True)
ws = wb[[s for s in wb.sheetnames if s.startswith('Data_')][0]]
rows = list(ws.iter_rows(values_only=True))
header = [str(h) for h in rows[0]]
print(json.dumps([dict(zip(header, [None if c is None else str(c) for c in r])) for r in rows[1:]]))
`,
    values.in,
  ],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);

type Vehicle = Record<string, string | null>;
const vehicles: Vehicle[] = JSON.parse(raw);

const clean = (value: string | null | undefined) => (value ?? "").trim();
const escape = (field: string) => (/[",\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field);

/** A short, stable id for a text value, so the taxonomy has ids as the loader expects. */
const codeFor = (() => {
  const seen = new Map<string, string>();
  return (prefix: string, value: string) => {
    const key = `${prefix}:${value.toLowerCase()}`;
    if (!seen.has(key)) seen.set(key, `${prefix}${String(seen.size + 1).padStart(3, "0")}`);
    return seen.get(key)!;
  };
})();

const items: string[][] = [];
const stock: string[][] = [];
const dropped = new Set<string>();

for (const vehicle of vehicles) {
  const vin = clean(vehicle.vin);
  if (!vin) continue;

  const year = clean(vehicle.year);
  const make = clean(vehicle.make);
  const model = clean(vehicle.model);
  const trim = clean(vehicle.trim);
  const colour = clean(vehicle.ext_color);
  const bodystyle = clean(vehicle.bodystyle) || "Unclassified";

  // Written the way a dealer writes a car on a windscreen card. Bodystyle is
  // deliberately not folded in: it is a category and belongs in the taxonomy,
  // and putting it in the text would hand the discovery step an answer that a
  // real description would not contain.
  const description = [year, make, model, trim, colour].filter(Boolean).join(" ");

  items.push([
    vin,
    description,
    codeFor("D", clean(vehicle.dealer) || "Unknown"),
    clean(vehicle.dealer) || "Unknown",
    codeFor("B", make || "Unknown"),
    make || "Unknown",
    codeFor("G", bodystyle),
    bodystyle,
    codeFor("S", model || "Unknown"),
    model || "Unknown",
  ]);

  // One physical vehicle is one unit. `onlot` is 1 on every row in this sample,
  // so it distinguishes nothing and the presence of the row is the signal.
  stock.push([vin, "1", clean(vehicle.price), clean(vehicle.fueltype), clean(vehicle.type)]);
}

for (const column of ["price", "msrp", "fueltype", "mileage", "type", "date_in_stock"]) {
  dropped.add(column);
}

const itemHeader = [
  "ITEM_ID",
  "ITEM_DESC",
  "DEPT_ID",
  "DEPT_NAME",
  "BRAND_ID",
  "BRAND_NAME",
  "GROUP_ID",
  "GROUP_NAME",
  "SUBGROUP_ID",
  "SUBGROUP_NAME",
];
mkdirSync(dirname(values.out!), { recursive: true });
writeFileSync(
  values.out!,
  `${[itemHeader, ...items].map((row) => row.map(escape).join(",")).join("\n")}\n`,
  "utf8",
);
writeFileSync(
  values.stock!,
  `${[["item_id", "stock", "price", "fueltype", "type"], ...stock]
    .map((row) => row.map(escape).join(","))
    .join("\n")}\n`,
  "utf8",
);

console.log(`${items.length} vehicles -> ${values.out}`);
console.log(`${stock.length} stock rows -> ${values.stock}\n`);
console.log(`Columns the catalogue contract cannot hold: ${[...dropped].join(", ")}`);
console.log("  (kept alongside in the stock file, unused by the product)\n");
console.log("Sample descriptions as the loader will see them:");
for (const item of items.slice(0, 6)) console.log(`  ${item[1]}`);
console.log("\nTaxonomy this produces (dealer > bodystyle > model):");
const nodes = new Map<string, number>();
for (const item of items) {
  const key = `${item[7]}`;
  nodes.set(key, (nodes.get(key) ?? 0) + 1);
}
for (const [node, count] of [...nodes].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(4)}  ${node}`);
}
