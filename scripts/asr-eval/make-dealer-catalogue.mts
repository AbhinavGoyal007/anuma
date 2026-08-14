/**
 * A motorcycle dealer's catalogue, written the way a dealer system actually
 * exports one.
 *
 * The first version of this file was a test designed to pass. It put the body
 * style — "Tourer", "Scrambler", "Cafe Racer" — into every description, so
 * discovery found a `type` attribute immediately and the whole scenario resolved
 * cleanly. No dealer export contains those words.
 *
 * What a real one contains, checked against Royal Enfield's published range: the
 * trim name. The Meteor 350 ships as Fireball, Stellar, Aurora and Supernova;
 * the Hunter as Dapper, Rebel and Factory. Those name a paint and equipment
 * package, not a riding posture, and no ordering of them says which bike is
 * comfortable over three hundred kilometres with a pillion. That knowledge is
 * real, and it is nowhere in the retailer's data.
 *
 * The descriptions here are abbreviated the way the electronics export in this
 * same database is abbreviated — model codes, compressed colours, a hard column
 * width that cuts rows mid-word — because that is what these systems produce.
 *
 * Sources for the range and trims:
 *   https://www.autocarindia.com/auto-features/classic-vs-hunter-vs-meteor-vs-bullet-vs-goan-classic-which-royal-enfield-350-to-buy-437865
 *   https://www.91wheels.com/expert-review/2025-royal-enfield-meteor-350-launched-whats-new-vs-what-stayed-the-same
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

/**
 * Where this dealer's system cuts a description.
 *
 * The electronics retailer in this database cuts at 40 characters and 57% of
 * their rows sit exactly on it. Dealer systems do the same thing.
 */
const DESCRIPTION_WIDTH = 38;

type Model = {
  /** How the dealer system abbreviates it, which is not how anyone says it. */
  code: string;
  cc: number;
  group: string;
  subgroup: string;
  subgroupId: string;
  /** Real trim names. None of them describes how the bike rides. */
  trims: string[];
  colours: string[];
};

const MODELS: Model[] = [
  {
    code: "HNTR350",
    cc: 349,
    group: "Roadster",
    subgroup: "350cc Roadster",
    subgroupId: "M0101",
    trims: ["FCTRY", "DAPPER", "REBEL"],
    colours: ["BLK", "RBL BLU", "DPR GRY", "LDN RED", "RIO WHT"],
  },
  {
    code: "BUL350",
    cc: 349,
    group: "Cruiser",
    subgroup: "350cc Cruiser",
    subgroupId: "M0102",
    trims: ["STD", "MILTRY", "BLK GOLD"],
    colours: ["BTL GRN", "MIL SLV", "JET BLK", "MRN"],
  },
  {
    code: "CLS350",
    cc: 349,
    group: "Cruiser",
    subgroup: "350cc Cruiser",
    subgroupId: "M0102",
    trims: ["HALCYON", "SIGNALS", "CHROME", "DARK"],
    colours: ["RDTCH RED", "HLCN GRN", "CHRM BRNZ", "STLTH BLK", "MDRS RED"],
  },
  {
    code: "MTR350",
    cc: 349,
    group: "Cruiser",
    subgroup: "350cc Cruiser",
    subgroupId: "M0102",
    trims: ["FIREBALL", "STELLAR", "AURORA", "SUPERNOVA"],
    colours: ["FRBL YLW", "STLR BLU", "SPRNVA BRN", "AURORA BLK"],
  },
  {
    code: "GOAN350",
    cc: 349,
    group: "Cruiser",
    subgroup: "350cc Cruiser",
    subgroupId: "M0102",
    trims: ["STD", "CHROME"],
    colours: ["PRPL HAZE", "SHACK BLK", "RAVE RED"],
  },
  {
    code: "SCRM440",
    cc: 443,
    group: "Adventure",
    subgroup: "Adventure Tourer",
    subgroupId: "M0103",
    trims: ["FORCE", "TRAIL"],
    colours: ["FRC BLU", "TEAL", "TRL GRN", "SLV SPRT"],
  },
  {
    code: "HIM450",
    cc: 452,
    group: "Adventure",
    subgroup: "Adventure Tourer",
    subgroupId: "M0103",
    trims: ["BASE", "PASS", "SUMMIT"],
    colours: ["KAZA BRN", "HANLE BLK", "SLT POPPY", "KAMET WHT"],
  },
  {
    code: "GRLA450",
    cc: 452,
    group: "Roadster",
    subgroup: "350cc Roadster",
    subgroupId: "M0101",
    trims: ["ANALOGUE", "DASH", "FLASH"],
    colours: ["PLAYA BLK", "BRAVA BLU", "YLW RBN", "SMK SLV"],
  },
  {
    code: "INT650",
    cc: 648,
    group: "Twin",
    subgroup: "650cc Twin",
    subgroupId: "M0104",
    trims: ["STD", "CUSTOM", "CHROME"],
    colours: ["CNYN RED", "BKR EXPRS", "SNST STRP", "BCN BLU"],
  },
  {
    code: "CGT650",
    cc: 648,
    group: "Twin",
    subgroup: "650cc Twin",
    subgroupId: "M0104",
    trims: ["STD", "CUSTOM", "CHROME"],
    colours: ["RCKR RED", "BRT RCNG GRN", "APEX GRY", "SLPSTRM BLU"],
  },
  {
    code: "SM650",
    cc: 648,
    group: "Twin",
    subgroup: "650cc Twin",
    subgroupId: "M0104",
    trims: ["ASTRAL", "INTERSTELLAR", "CELESTIAL"],
    colours: ["ASTRL BLK", "INTSTLR GRY", "CLSTL RED", "ASTRL BLU"],
  },
  {
    code: "SHTGN650",
    cc: 648,
    group: "Twin",
    subgroup: "650cc Twin",
    subgroupId: "M0104",
    trims: ["STD", "CUSTOM"],
    colours: ["SHT MTL GRY", "PLSMA BLU", "GRN DRILL", "STNCL WHT"],
  },
  {
    code: "BEAR650",
    cc: 648,
    group: "Twin",
    subgroup: "650cc Twin",
    subgroupId: "M0104",
    trims: ["STD", "TWO FOUR NINE"],
    colours: ["BRDWLK WHT", "PTRL GRN", "WLD HNY"],
  },
  {
    code: "CLS650",
    cc: 648,
    group: "Twin",
    subgroup: "650cc Twin",
    subgroupId: "M0104",
    trims: ["HALCYON", "CHROME"],
    colours: ["VLLM RED", "TEAL", "BLK CHRM"],
  },
];

const rows: string[][] = [];
let sequence = 500000;
const next = () => String((sequence += 7));

/** Cut at the column width the dealer system uses, as their export does. */
const cut = (text: string) => text.slice(0, DESCRIPTION_WIDTH).trimEnd();

for (const model of MODELS) {
  for (const trim of model.trims) {
    for (const colour of model.colours) {
      rows.push([
        next(),
        cut(`RE ${model.code} ${trim} ${colour} ABS`),
        "M01",
        "Motorcycles",
        "RE01",
        "Royal Enfield",
        `M01${model.group === "Twin" ? "04" : "01"}`,
        model.group,
        model.subgroupId,
        model.subgroup,
      ]);
    }
  }
}

const HELMETS = ["STRT PRIME", "ESCAPADE", "RAMBLER", "DWNTWN", "COPTER"];
const HELMET_COLOURS = ["BLK", "WHT", "GRY", "RED", "BLU", "OLV"];
const HELMET_SIZES = ["55CM", "57CM", "59CM", "61CM", "63CM"];
for (const helmet of HELMETS) {
  for (const colour of HELMET_COLOURS) {
    for (const size of HELMET_SIZES) {
      rows.push([
        next(),
        cut(`RE HLMT ${helmet} FF ${colour} ${size}`),
        "G01",
        "Riding Gear",
        "RE01",
        "Royal Enfield",
        "G0101",
        "Helmets",
        "G010101",
        "Full Face Helmets",
      ]);
    }
  }
}

const JACKETS = ["STRTWND", "EXPLORER", "WNDFARER", "DARCY"];
for (const jacket of JACKETS) {
  for (const colour of ["BLK", "OLV", "BLU", "GRY"]) {
    for (const size of ["S", "M", "L", "XL", "XXL"]) {
      rows.push([
        next(),
        cut(`RE JKT ${jacket} ${colour} ${size}`),
        "G01",
        "Riding Gear",
        "RE01",
        "Royal Enfield",
        "G0102",
        "Apparel",
        "G010201",
        "Riding Jackets",
      ]);
    }
  }
}

for (const grade of ["10W30", "10W50", "15W50", "20W50"]) {
  for (const litres of ["1L", "2.5L", "4L"]) {
    for (const kind of ["SEMI SYN", "FULL SYN", "MINRL"]) {
      rows.push([
        next(),
        cut(`RE ENG OIL ${grade} ${kind} ${litres}`),
        "S01",
        "Service Parts",
        "RE01",
        "Royal Enfield",
        "S0101",
        "Lubricants",
        "S010101",
        "Engine Oil",
      ]);
    }
  }
}

// Spares carry a material number, as a dealer system does, and the part name is
// written in the plain English the parts catalogue uses.
let material = 1900000;
for (const model of MODELS) {
  for (const part of [
    "AIR FILTER",
    "OIL FILTER",
    "BRK PAD SET FRT",
    "BRK PAD SET RR",
    "CLUTCH CABLE",
    "CHAIN SPRCKT KIT",
    "SPARK PLUG",
    "HEADLAMP ASSY",
    "MIRROR SET",
    "SIDE STAND",
    "FUEL TANK CAP",
    "SEAT ASSY",
  ]) {
    material += 13;
    rows.push([
      next(),
      cut(`${material} ${part} ${model.code}`),
      "S01",
      "Service Parts",
      "RE01",
      "Royal Enfield",
      "S0102",
      "Spares",
      "S010201",
      "Motorcycle Spares",
    ]);
  }
}

for (const model of MODELS) {
  for (const accessory of [
    "TOURING SEAT",
    "WNDSCRN SHORT",
    "WNDSCRN TALL",
    "ENGINE GUARD",
    "PANNIER SET 30L",
    "TOP BOX 40L",
    "BAR END MIRROR",
    "SUMP GUARD",
    "BACKREST PILLION",
    "FLY SCREEN",
  ]) {
    rows.push([
      next(),
      cut(`RE ACC ${accessory} ${model.code}`),
      "A01",
      "Accessories",
      "RE01",
      "Royal Enfield",
      "A0101",
      "Motorcycle Accessories",
      "A010101",
      "Genuine Accessories",
    ]);
  }
}

const header = [
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
const escape = (field: string) => (/[",\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field);
writeFileSync(
  values.out!,
  `${[header, ...rows].map((row) => row.map(escape).join(",")).join("\n")}\n`,
  "utf8",
);
mkdirSync(dirname(values.out!), { recursive: true });

const byNode = new Map<string, number>();
for (const row of rows) {
  const key = `${row[3]} > ${row[9]}`;
  byNode.set(key, (byNode.get(key) ?? 0) + 1);
}
console.log(`${rows.length} rows -> ${values.out}\n`);
for (const [node, count] of [...byNode].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(5)}  ${node}`);
}
console.log("\nSample motorcycle rows, as the dealer system writes them:");
for (const row of rows.slice(0, 6)) console.log(`  ${row[1]}`);
