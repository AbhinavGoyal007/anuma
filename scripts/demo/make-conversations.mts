/**
 * Sixty showroom conversations, varied enough to be worth looking at.
 *
 * Written rather than recorded, because sixty real recordings do not exist — but
 * written to behave like the thirteen that do: Hinglish, the customer switching
 * to English for model names and back to Hindi for everything else, and the
 * shape a floor conversation actually has. A greeting, what they came for, what
 * it is for, a budget, specifications, something shown, an objection, an answer,
 * and a decision that is often not a sale.
 *
 * Variation is the point. Sixty copies of one conversation would fill every
 * screen with a single number repeated, which looks like working software and
 * demonstrates nothing. So the category, the budget, what they care about, what
 * they push back on, who served them, which store, when, and how it ended are
 * all drawn independently.
 *
 * Products named are taken from the catalogue that was actually loaded, so
 * matching against the range has something real to find.
 *
 * Usage:
 *   node --env-file=.env.local --experimental-strip-types \
 *     scripts/demo/make-conversations.mts --org "Nova Electronics" --count 60
 */

import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { parseArgs } from "node:util";

import postgres from "postgres";

const { values } = parseArgs({
  options: {
    org: { type: "string", default: "Nova Electronics" },
    count: { type: "string", default: "60" },
    out: { type: "string", default: "eval/demo" },
  },
});

/** Deterministic, so a re-run produces the same demo and screenshots stay true. */
function makeRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
const random = makeRandom(20260814);
const pick = <T,>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
const chance = (probability: number) => random() < probability;

type Shape = {
  node: string;
  spoken: string;
  useCases: string[];
  specs: string[];
  budgets: [number, number][];
  objections: string[];
  wants: string[];
};

/** One kind of shopper, per category the catalogue actually carries. */
const SHAPES: Shape[] = [
  {
    node: "Notebooks > Clamshell",
    spoken: "laptop",
    useCases: [
      "college assignments aur online classes",
      "office work, Excel aur video calls",
      "coding aur development work",
      "photo editing aur Lightroom",
    ],
    specs: ["16 GB RAM", "512 GB SSD", "i5 processor", "i7 processor", "14 inch screen"],
    budgets: [
      [55000, 65000],
      [65000, 80000],
      [80000, 95000],
      [45000, 55000],
    ],
    objections: [
      "Amazon pe yehi model chaar hazaar sasta dikha raha hai",
      "Yeh thoda heavy lag raha hai, roz carry karna padega",
      "Battery backup kitna milega? Abhi wali mein do ghante chalti hai",
      "Warranty on-site hai ya service centre le jaana padega",
    ],
    wants: ["halka ho", "battery achhi ho", "build quality solid ho", "keyboard comfortable ho"],
  },
  {
    node: "Notebooks > Gaming PC",
    spoken: "gaming laptop",
    useCases: ["Valorant aur GTA khelna", "gaming aur video editing dono", "streaming aur gaming"],
    specs: ["RTX 4060", "RTX 4050", "16 GB RAM", "1 TB SSD", "144Hz display"],
    budgets: [
      [75000, 90000],
      [90000, 110000],
      [110000, 130000],
    ],
    objections: [
      "Yeh dhai kilo ka hai, college le jaana mushkil hoga",
      "Thermals kaise hain? Friend ka laptop bahut garam hota hai",
      "Online pe isse sasta mil raha hai same config mein",
    ],
    wants: ["thermals achhe hon", "RTX 4060 hi chahiye", "display achhi ho"],
  },
  {
    node: "Mobile Phones > Smart Phones",
    spoken: "smartphone",
    useCases: ["photography aur reels", "office email aur calls", "gaming aur social media"],
    specs: ["256 GB storage", "128 GB storage", "8 GB RAM", "5G", "AMOLED display"],
    budgets: [
      [15000, 22000],
      [25000, 35000],
      [40000, 60000],
      [65000, 90000],
    ],
    objections: [
      "Camera itne ka toh nahi lag raha",
      "Battery ek din chalti hai kya? Mera abhi wala shaam tak khatam",
      "Exchange mein purane phone ka kitna milega",
    ],
    wants: ["camera achha ho", "battery poora din chale", "5G ho"],
  },
  {
    node: "Televisions > 4K Ultra HD TV",
    spoken: "television",
    useCases: ["living room ke liye", "cricket aur movies dekhne", "bedroom ke liye chhota"],
    specs: ["55 inch", "43 inch", "65 inch", "4K", "OLED panel"],
    budgets: [
      [25000, 40000],
      [40000, 60000],
      [60000, 90000],
      [90000, 150000],
    ],
    objections: [
      "Sound quality kaisi hai? Soundbar alag lena padega kya",
      "Installation ka charge alag hai kya",
      "Yeh model purana hai, naya kab aayega",
    ],
    wants: ["picture quality achhi ho", "smart TV ho", "wall mount included ho"],
  },
  {
    node: "Air Conditioners > Split Air Conditioners",
    spoken: "air conditioner",
    useCases: ["bedroom ke liye", "hall ke liye", "office cabin ke liye"],
    specs: ["1.5 ton", "2 ton", "1 ton", "5 star", "inverter"],
    budgets: [
      [28000, 38000],
      [38000, 50000],
      [50000, 70000],
    ],
    objections: [
      "Bijli ka bill kitna badhega",
      "Installation aur copper pipe ka extra kitna lagega",
      "Service kitni baar free milegi",
    ],
    wants: ["inverter ho", "5 star ho", "jaldi cooling ho"],
  },
  {
    node: "Refrigerators > Top Mount Refrigerator",
    spoken: "refrigerator",
    useCases: ["chaar log ki family", "do log ke liye", "joint family ke liye bada"],
    specs: ["300 litre", "250 litre", "500 litre", "frost free", "5 star"],
    budgets: [
      [22000, 32000],
      [32000, 45000],
      [45000, 70000],
    ],
    objections: [
      "Yeh size fit hoga kitchen mein?",
      "Frost free hai ya manual defrost",
      "Compressor ki warranty kitni hai",
    ],
    wants: ["frost free ho", "bijli kam khaye", "space achha ho"],
  },
  {
    node: "Washing Machines > Front Load Washing Machines",
    spoken: "washing machine",
    useCases: ["family of four ke liye", "do log ke liye", "roz ke kapde"],
    specs: ["7 kg", "8 kg", "6.5 kg", "front load", "inverter motor"],
    budgets: [
      [25000, 35000],
      [35000, 48000],
      [48000, 65000],
    ],
    objections: [
      "Front load mein time zyada lagta hai na",
      "Installation free hai kya",
      "Dryer bhi hai ismein?",
    ],
    wants: ["kam pani use kare", "awaaz kam kare", "capacity theek ho"],
  },
];

const OUTCOMES = [
  { state: "purchased", weight: 0.22 },
  { state: "researching", weight: 0.3 },
  { state: "deferred", weight: 0.2 },
  { state: "follow_up_scheduled", weight: 0.18 },
  { state: "comparing", weight: 0.1 },
] as const;

function chooseOutcome(): string {
  const roll = random();
  let cumulative = 0;
  for (const outcome of OUTCOMES) {
    cumulative += outcome.weight;
    if (roll <= cumulative) return outcome.state;
  }
  return "researching";
}

const rupees = (amount: number) =>
  amount >= 100000
    ? `${(amount / 100000).toFixed(2).replace(/\.00$/, "")} lakh`
    : `${Math.round(amount / 1000)} hazaar`;

type Turn = [speaker: "R" | "C", line: string];

function buildDialogue(
  shape: Shape,
  product: string,
  alternative: string,
): {
  turns: Turn[];
  outcome: string;
} {
  const [low, high] = pick(shape.budgets);
  const target = Math.round((low + random() * (high - low)) / 1000) * 1000;
  const stretch = chance(0.55)
    ? target + Math.round((random() * 0.15 * target) / 1000) * 1000
    : null;
  const useCase = pick(shape.useCases);
  const specA = pick(shape.specs);
  const specB = pick(shape.specs.filter((spec) => spec !== specA));
  const want = pick(shape.wants);
  const objection = pick(shape.objections);
  const outcome = chooseOutcome();

  const turns: Turn[] = [
    [
      "R",
      pick([
        "Namaste sir, welcome. Kya dekh rahe the aap?",
        "Hello sir, kaise help kar sakta hoon?",
        "Namaste, kya dhoond rahe hain aaj?",
      ]),
    ],
    ["C", `Mujhe ek ${shape.spoken} chahiye tha.`],
    ["R", "Bilkul sir. Kis kaam ke liye chahiye?"],
    ["C", `Mainly ${useCase}.`],
    ["R", "Theek hai. Budget kya soch rahe hain?"],
    [
      "C",
      stretch
        ? `Around ${rupees(target)} tak. Agar bahut achha hua toh ${rupees(stretch)} tak ja sakta hoon.`
        : `${rupees(target)} ke aas paas rakhna hai.`,
    ],
    ["R", "Koi specific requirement hai?"],
    ["C", `${specA} toh chahiye hi. ${specB} bhi ho toh achha rahega.`],
    ["R", `Aur kya important hai aapke liye?`],
    ["C", `${want.charAt(0).toUpperCase() + want.slice(1)}, yeh matter karta hai.`],
    [
      "R",
      `Samajh gaya. Toh main aapko ${product} dikhata hoon, yeh aapki requirement ke closest hai.`,
    ],
    ["C", "Iska price kya hai?"],
    ["R", `Iska store price ${rupees(Math.round(target * (0.95 + random() * 0.25)))} hai sir.`],
    ["C", objection],
  ];

  if (chance(0.7)) {
    turns.push([
      "R",
      pick([
        "Sir woh main check karwa deta hoon, par yahan aapko on-site service aur immediate delivery milti hai.",
        "Haan sir, wahan warranty claim karne mein dikkat hoti hai. Yahan hum khud handle karte hain.",
        "Main aapko exact detail nikaal ke deta hoon, galat information nahi dena chahta.",
      ]),
    ]);
    turns.push(["C", pick(["Hmm, theek hai.", "Achha.", "Samajh gaya."])]);
  }

  if (chance(0.6)) {
    turns.push(["R", `Ek aur option hai — ${alternative}. Thoda alag configuration hai.`]);
    turns.push([
      "C",
      pick([
        "Isme kya difference hai?",
        "Yeh kaisa hai comparison mein?",
        "Price mein kitna farak hai?",
      ]),
    ]);
    turns.push(["R", "Isme specification thoda upar hai, aur price bhi us hisaab se hai."]);
  }

  if (chance(0.45)) {
    turns.push(["C", "EMI option hai kya?"]);
    turns.push(["R", "Haan sir, no-cost EMI six months tak available hai select cards pe."]);
  }

  if (chance(0.35)) {
    turns.push([
      "C",
      pick(["Stock mein hai abhi?", "Aaj le jaa sakta hoon kya?", "Delivery kab tak ho jayegi?"]),
    ]);
    turns.push([
      "R",
      chance(0.7)
        ? "Haan sir, yeh stock mein hai. Aaj hi le ja sakte hain."
        : "Is colour mein abhi nahi hai sir, do din mein aa jayega.",
    ]);
  }

  const endings: Record<string, Turn[]> = {
    purchased: [
      ["C", "Theek hai, main yehi le leta hoon."],
      ["R", "Bahut badhiya sir. Main billing karwa deta hoon."],
      ["C", "Haan, aur ek screen guard bhi daal dijiye."],
      ["R", "Ji bilkul. Thank you sir."],
    ],
    researching: [
      ["C", "Theek hai, main thoda aur dekh ke aata hoon."],
      ["R", "Bilkul sir. Mera number save kar lijiye, koi bhi doubt ho toh call kar dena."],
      ["C", "Haan, main sochke batata hoon."],
    ],
    deferred: [
      ["C", "Abhi nahi, agle mahine dekhta hoon."],
      ["R", "Koi baat nahi sir. Festive offer aane wala hai, tab bata dunga."],
      ["C", "Theek hai, thank you."],
    ],
    follow_up_scheduled: [
      ["C", "Main kal wife ke saath aata hoon, phir final karte hain."],
      ["R", "Zaroor sir, main kal shaam tak yahi rahunga."],
      ["C", "Theek hai, kal milte hain."],
    ],
    comparing: [
      ["C", "Main ek do jagah aur dekh leta hoon, phir decide karunga."],
      ["R", "Bilkul sir. Price match bhi kar dete hain hum, bata dijiyega."],
      ["C", "Haan theek hai."],
    ],
  };
  turns.push(...(endings[outcome] ?? endings.researching!));

  return { turns, outcome };
}

const sql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false, max: 1 });

try {
  const [organization] = await sql<{ id: string }[]>`
    select id from organizations where name = ${values.org!} order by created_at limit 1
  `;
  if (!organization) throw new Error(`No organization named ${values.org}.`);

  // Real products from the range, so what is named can be found again.
  const productsByNode = new Map<string, string[]>();
  for (const shape of SHAPES) {
    const [group, subgroup] = shape.node.split(" > ");
    const rows = await sql<{ description: string }[]>`
      select description from public.catalogue_items
      where organization_id = ${organization.id} and valid_to is null
        and group_name = ${group!} and subgroup_name = ${subgroup!}
        and length(description) between 18 and 44
      order by item_id
      limit 60
    `;
    productsByNode.set(
      shape.node,
      rows.map((row) => row.description),
    );
  }

  rmSync(values.out!, { recursive: true, force: true });
  mkdirSync(values.out!, { recursive: true });

  const total = Number(values.count);
  const manifest: { file: string; title: string; outcome: string; node: string }[] = [];

  for (let index = 0; index < total; index += 1) {
    const shape = pick(SHAPES);
    const catalogue = productsByNode.get(shape.node) ?? [];
    if (catalogue.length < 2) continue;
    const product = pick(catalogue);
    const alternative = pick(catalogue.filter((entry) => entry !== product));

    const { turns, outcome } = buildDialogue(shape, product, alternative);

    let clock = 0;
    const entries = turns.map(([speaker, line]) => {
      const start = clock;
      const seconds = Math.max(2.2, Math.min(9, line.length / 13));
      clock += seconds + 0.3 + random() * 0.6;
      return {
        transcript: line,
        start_time_seconds: Number(start.toFixed(2)),
        end_time_seconds: Number((start + seconds).toFixed(2)),
        speaker_id: speaker === "R" ? "SPEAKER_00" : "SPEAKER_01",
      };
    });

    const title = `Walk-in ${String(index + 1).padStart(2, "0")} — ${shape.spoken}`;
    const file = `conversation-${String(index + 1).padStart(2, "0")}.json`;
    writeFileSync(
      `${values.out}/${file}`,
      `${JSON.stringify({ title, language_code: "hi-IN", diarized_transcript: { entries } }, null, 2)}\n`,
      "utf8",
    );
    manifest.push({ file, title, outcome, node: shape.node });
  }

  writeFileSync(`${values.out}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const byNode = new Map<string, number>();
  const byOutcome = new Map<string, number>();
  for (const entry of manifest) {
    byNode.set(entry.node, (byNode.get(entry.node) ?? 0) + 1);
    byOutcome.set(entry.outcome, (byOutcome.get(entry.outcome) ?? 0) + 1);
  }
  console.log(`${manifest.length} conversations -> ${values.out}\n`);
  console.log("by category:");
  for (const [node, count] of [...byNode].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(3)}  ${node}`);
  }
  console.log("by outcome:");
  for (const [outcome, count] of [...byOutcome].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(3)}  ${outcome}`);
  }
} finally {
  await sql.end();
}
