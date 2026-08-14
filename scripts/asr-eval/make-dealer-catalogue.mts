/**
 * A motorcycle dealer's catalogue, in the shape a retailer actually exports.
 *
 * Written to test the claim that nothing in the catalogue path knows what
 * industry it is looking at. The columns are the ten the loader requires and the
 * descriptions follow the same compressed convention the electronics export
 * uses — model, variant, engine, colour — because that convention is what
 * retailers write, not something specific to computers.
 *
 * The proportions are deliberate and are the interesting part. A dealer's
 * motorcycle range is small: fourteen models, a few colours each, under a
 * hundred SKUs in total. Their spares and gear run to thousands. So the rows
 * that matter most commercially sit in the smallest nodes, which is the opposite
 * of the electronics catalogue this was all built against.
 *
 * Usage:
 *   node --experimental-strip-types scripts/asr-eval/make-dealer-catalogue.mts \
 *     --out eval/dealer/items.csv
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: { out: { type: "string", default: "eval/dealer/items.csv" } },
});

type Model = {
  name: string;
  cc: number;
  group: string;
  subgroup: string;
  subgroupId: string;
  colours: string[];
  variant: string;
};

/** The 2025 Royal Enfield range, with the engines and finishes it is sold in. */
const MODELS: Model[] = [
  { name: "Hunter 350", cc: 349, group: "Roadster", subgroup: "350cc Roadster", subgroupId: "M0101",
    variant: "Retro", colours: ["Factory Black", "Rebel Blue", "Dapper Grey", "London Red", "Rio White"] },
  { name: "Bullet 350", cc: 349, group: "Cruiser", subgroup: "350cc Cruiser", subgroupId: "M0102",
    variant: "Standard", colours: ["Battle Green", "Military Silver", "Jet Black", "Maroon"] },
  { name: "Classic 350", cc: 349, group: "Cruiser", subgroup: "350cc Cruiser", subgroupId: "M0102",
    variant: "Halcyon", colours: ["Redditch Red", "Halcyon Green", "Chrome Bronze", "Stealth Black", "Madras Red"] },
  { name: "Meteor 350", cc: 349, group: "Cruiser", subgroup: "350cc Cruiser", subgroupId: "M0102",
    variant: "Stellar", colours: ["Fireball Yellow", "Stellar Blue", "Supernova Brown", "Aurora Black"] },
  { name: "Goan Classic 350", cc: 349, group: "Cruiser", subgroup: "350cc Cruiser", subgroupId: "M0102",
    variant: "Bobber", colours: ["Purple Haze", "Shack Black", "Rave Red"] },
  { name: "Scram 440", cc: 443, group: "Adventure", subgroup: "Adventure Tourer", subgroupId: "M0103",
    variant: "Trail", colours: ["Force Blue", "Teal", "Trail Green", "Silver Spirit"] },
  { name: "Himalayan 450", cc: 452, group: "Adventure", subgroup: "Adventure Tourer", subgroupId: "M0103",
    variant: "Sherpa", colours: ["Kaza Brown", "Hanle Black", "Slate Poppy Blue", "Kamet White"] },
  { name: "Guerrilla 450", cc: 452, group: "Roadster", subgroup: "350cc Roadster", subgroupId: "M0101",
    variant: "Flash", colours: ["Playa Black", "Brava Blue", "Yellow Ribbon", "Smoke Silver"] },
  { name: "Interceptor 650", cc: 648, group: "Twin", subgroup: "650cc Twin", subgroupId: "M0104",
    variant: "Custom", colours: ["Canyon Red", "Baker Express", "Sunset Strip", "Barcelona Blue"] },
  { name: "Continental GT 650", cc: 648, group: "Twin", subgroup: "650cc Twin", subgroupId: "M0104",
    variant: "Cafe Racer", colours: ["Rocker Red", "British Racing Green", "Apex Grey", "Slipstream Blue"] },
  { name: "Super Meteor 650", cc: 648, group: "Twin", subgroup: "650cc Twin", subgroupId: "M0104",
    variant: "Tourer", colours: ["Astral Black", "Interstellar Grey", "Celestial Red", "Astral Blue"] },
  { name: "Shotgun 650", cc: 648, group: "Twin", subgroup: "650cc Twin", subgroupId: "M0104",
    variant: "Custom", colours: ["Sheet Metal Grey", "Plasma Blue", "Green Drill", "Stencil White"] },
  { name: "Bear 650", cc: 648, group: "Twin", subgroup: "650cc Twin", subgroupId: "M0104",
    variant: "Scrambler", colours: ["Boardwalk White", "Petrol Green", "Wild Honey", "Two Four Nine"] },
  { name: "Classic 650", cc: 648, group: "Twin", subgroup: "650cc Twin", subgroupId: "M0104",
    variant: "Halcyon", colours: ["Vallam Red", "Teal", "Black Chrome"] },
];

const HELMET_MODELS = ["Street Prime", "Escapade", "Rambler", "Downtown", "Copter", "Trailblazer"];
const HELMET_COLOURS = ["Black", "White", "Grey", "Red", "Blue", "Olive"];
const HELMET_SIZES = ["S 55cm", "M 57cm", "L 59cm", "XL 61cm", "XXL 63cm"];

const JACKET_MODELS = ["Streetwind", "Explorer", "Windfarer", "Darcy", "Trailblazer"];
const JACKET_SIZES = ["S", "M", "L", "XL", "XXL"];

const OIL_GRADES = ["10W30", "10W50", "15W50", "20W50"];
const OIL_SIZES = [1, 2.5, 4];

const rows: string[][] = [];
let sequence = 500000;
const next = () => String((sequence += 7));

// Motorcycles. Small, and where the money is.
for (const model of MODELS) {
  for (const colour of model.colours) {
    rows.push([
      next(),
      `Royal Enfield ${model.name} ${model.variant} ${model.cc}cc ${colour} ABS`,
      "M01", "Motorcycles", "RE01", "Royal Enfield",
      `M01${model.group === "Twin" ? "04" : "01"}`, model.group, model.subgroupId, model.subgroup,
    ]);
  }
}

// Riding gear. Larger, and described completely differently.
for (const helmet of HELMET_MODELS) {
  for (const colour of HELMET_COLOURS) {
    for (const size of HELMET_SIZES) {
      rows.push([
        next(),
        `Royal Enfield ${helmet} Full Face Helmet ${colour} ${size}`,
        "G01", "Riding Gear", "RE01", "Royal Enfield",
        "G0101", "Helmets", "G010101", "Full Face Helmets",
      ]);
    }
  }
}
for (const jacket of JACKET_MODELS) {
  for (const colour of ["Black", "Olive", "Blue", "Grey"]) {
    for (const size of JACKET_SIZES) {
      rows.push([
        next(),
        `Royal Enfield ${jacket} Riding Jacket ${colour} ${size}`,
        "G01", "Riding Gear", "RE01", "Royal Enfield",
        "G0102", "Apparel", "G010201", "Riding Jackets",
      ]);
    }
  }
}

// Spares. Thousands of rows, as every dealer master has.
for (const grade of OIL_GRADES) {
  for (const litres of OIL_SIZES) {
    for (const pack of ["Semi Synthetic", "Full Synthetic", "Mineral"]) {
      rows.push([
        next(),
        `Royal Enfield Engine Oil ${grade} ${pack} ${litres}L`,
        "S01", "Service Parts", "RE01", "Royal Enfield",
        "S0101", "Lubricants", "S010101", "Engine Oil",
      ]);
    }
  }
}
for (const model of MODELS) {
  for (const part of [
    "Air Filter", "Oil Filter", "Brake Pad Set Front", "Brake Pad Set Rear",
    "Clutch Cable", "Chain Sprocket Kit", "Spark Plug", "Headlamp Assembly",
    "Mirror Set", "Side Stand", "Fuel Tank Cap", "Seat Assembly",
  ]) {
    rows.push([
      next(),
      `Royal Enfield ${part} ${model.name} ${model.cc}cc`,
      "S01", "Service Parts", "RE01", "Royal Enfield",
      "S0102", "Spares", "S010201", "Motorcycle Spares",
    ]);
  }
}
for (const model of MODELS) {
  for (const accessory of [
    "Touring Seat", "Windscreen Short", "Windscreen Tall", "Engine Guard",
    "Pannier Set 30L", "Top Box 40L", "Bar End Mirror", "Sump Guard",
    "Backrest Pillion", "Fly Screen",
  ]) {
    rows.push([
      next(),
      `Royal Enfield ${accessory} ${model.name} Genuine Accessory`,
      "A01", "Accessories", "RE01", "Royal Enfield",
      "A0101", "Motorcycle Accessories", "A010101", "Genuine Accessories",
    ]);
  }
}

const header = [
  "ITEM_ID", "ITEM_DESC", "DEPT_ID", "DEPT_NAME", "BRAND_ID",
  "BRAND_NAME", "GROUP_ID", "GROUP_NAME", "SUBGROUP_ID", "SUBGROUP_NAME",
];
const escape = (field: string) =>
  /[",\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field;
const csv = [header, ...rows].map((row) => row.map(escape).join(",")).join("\n");

mkdirSync(dirname(values.out!), { recursive: true });
writeFileSync(values.out!, `${csv}\n`, "utf8");

const byNode = new Map<string, number>();
for (const row of rows) byNode.set(`${row[3]} > ${row[9]}`, (byNode.get(`${row[3]} > ${row[9]}`) ?? 0) + 1);
console.log(`${rows.length} rows -> ${values.out}\n`);
for (const [node, count] of [...byNode].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(5)}  ${node}`);
}
