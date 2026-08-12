/**
 * Reading a product the way it was said out loud.
 *
 * A representative says "Lenovo LOQ with the 4060, 16 gig". A catalogue row says
 * "Lenovo LOQ 83DV0007AX i7/16/512/6/15.6/G". Those are the same machine, and
 * nothing about matching them is a language problem — it is a codes-and-numbers
 * problem, which is why no embedding is used here. "RTX 4050" and "RTX 4060" sit
 * next to each other in any vector space and are a five-hundred-rupee margin and
 * a returned laptop apart.
 *
 * So the mention is taken apart into the things that can be compared exactly:
 * the brand, the model words, and the numbers. Anything not recognised is left
 * out rather than guessed, because a wrong SKU is worse than no SKU — it puts a
 * confident answer under a question nobody re-checks.
 *
 * Pure and server-free, so the rules can be tested against what people actually
 * said in real conversations.
 */

import { PLAUSIBLE_RAM } from "@/modules/catalogue/spec-parser";

export type ProductMention = {
  /** The brand as written, when one was recognised. */
  brand: string | null;
  /** The model words, uppercased — "LOQ", "SWIFT", "GO". */
  modelTokens: string[];
  ramGb: number | null;
  storageGb: number | null;
  /** The graphics chip as named — "RTX 4060" — not as the catalogue stores it. */
  gpuModel: string | null;
  /** The memory sizes that chip is sold with, which is what the catalogue holds. */
  gpuGbCandidates: number[];
  screenIn: number | null;
};

/**
 * Brands this catalogue actually carries in the categories with specifications.
 *
 * A list rather than a lookup against the live catalogue because a mention is
 * parsed before any query is made, and because a brand is only useful here if it
 * is one we could match anyway.
 */
const BRANDS = [
  "Lenovo",
  "HP",
  "Dell",
  "Asus",
  "Acer",
  "Apple",
  "MSI",
  "Samsung",
  "Microsoft",
  "Infinix",
  "Honor",
  "Gigabyte",
  "Razer",
  "LG",
  "Toshiba",
  "Xiaomi",
  "Realme",
  "Vivo",
  "Oppo",
  "OnePlus",
  "Nothing",
  "Google",
  "Motorola",
] as const;

/**
 * What each graphics chip actually has on it.
 *
 * The catalogue never writes "RTX 4060" — it writes the memory, as a bare number
 * in the shorthand. Customers and representatives only ever say the chip. This
 * is the join between the two, and it is a table rather than a rule because
 * there is no rule: the numbers were chosen by a marketing department.
 *
 * Where a chip shipped in more than one size both are listed, and a match
 * against any of them counts — claiming to know which one would be inventing
 * precision the mention does not carry.
 */
const GPU_MEMORY: Record<string, number[]> = {
  "2050": [4],
  "3050": [4, 6],
  "3060": [6],
  "3070": [8],
  "3080": [8, 16],
  "4050": [6],
  "4060": [8],
  "4070": [8, 12],
  "4080": [12, 16],
  "4090": [16, 24],
  "5050": [8],
  "5060": [8],
  "5070": [8, 12],
  "5080": [16],
  "5090": [24, 32],
};

/** Words that carry no identity, so they never become model tokens. */
const NOISE = new Set([
  "LAPTOP",
  "NOTEBOOK",
  "MODEL",
  "SERIES",
  "GAMING",
  "THE",
  "WITH",
  "AND",
  "GB",
  "TB",
  "RAM",
  "SSD",
  "INCH",
  "GEN",
  "NEW",
  "LATEST",
  "VARIANT",
  "VERSION",
  "RTX",
  "GTX",
  "GRAPHICS",
  "CARD",
  // Chip and component makers. People say "Lenovo LOQ with NVIDIA RTX 4060";
  // no catalogue description contains "NVIDIA", so treating it as a model word
  // rules out every real match for a machine that is plainly in the range.
  "NVIDIA",
  "GEFORCE",
  "RADEON",
  "INTEL",
  "AMD",
  "CORE",
  "RYZEN",
  "ULTRA",
  "PROCESSOR",
  "CPU",
  "DISPLAY",
  "SCREEN",
]);

const GPU_PATTERN = /\b(?:RTX|GTX)\s*(\d{4})\b/i;
const RAM_PATTERN = /\b(\d{1,3})\s*(?:GB|GIG|GIGS?)?\s*(?:RAM|MEMORY)\b/i;
const STORAGE_PATTERN = /\b(\d{3,4})\s*GB\b|\b(\d(?:\.\d)?)\s*TB\b/i;
const SCREEN_PATTERN = /\b(\d{2}(?:\.\d)?)\s*(?:INCH|"|IN\b)/i;
/** A bare "16 gig" with nothing after it is memory; a laptop's other numbers are larger. */
const BARE_MEMORY_PATTERN = /\b(\d{1,3})\s*(?:GB|GIG|GIGS)\b/i;

export function parseProductMention(text: string): ProductMention {
  const mention: ProductMention = {
    brand: null,
    modelTokens: [],
    ramGb: null,
    storageGb: null,
    gpuModel: null,
    gpuGbCandidates: [],
    screenIn: null,
  };

  const raw = text.trim();
  if (raw.length === 0) return mention;

  const brand = BRANDS.find((candidate) => new RegExp(`\\b${candidate}\\b`, "i").test(raw));
  mention.brand = brand ?? null;

  const gpu = GPU_PATTERN.exec(raw);
  if (gpu) {
    mention.gpuModel = `RTX ${gpu[1]}`;
    mention.gpuGbCandidates = GPU_MEMORY[gpu[1]!] ?? [];
  }

  const screen = SCREEN_PATTERN.exec(raw);
  if (screen) {
    const value = Number(screen[1]);
    if (value >= 10 && value <= 20) mention.screenIn = value;
  }

  const storage = STORAGE_PATTERN.exec(raw);
  if (storage) {
    if (storage[2]) mention.storageGb = Math.round(Number(storage[2]) * 1024);
    else if (storage[1]) {
      const value = Number(storage[1]);
      // 256 and up is a drive; below that it is memory being said with "GB".
      if (value >= 128) mention.storageGb = value;
    }
  }

  const explicitRam = RAM_PATTERN.exec(raw);
  if (explicitRam) {
    const value = Number(explicitRam[1]);
    if (PLAUSIBLE_RAM.has(value)) mention.ramGb = value;
  } else {
    // "16 gig" with no other clue. Only accepted at a size laptops are sold
    // with, and never when it is the number already read as the drive.
    const bare = BARE_MEMORY_PATTERN.exec(raw);
    if (bare) {
      const value = Number(bare[1]);
      if (PLAUSIBLE_RAM.has(value) && value !== mention.storageGb) mention.ramGb = value;
    }
  }

  // What is left, once the brand and every number are removed, is the model.
  const withoutNumbers = raw
    .replace(GPU_PATTERN, " ")
    .replace(/\b\d+(?:\.\d+)?\s*(?:GB|TB|GIG|GIGS|INCH|IN)\b/gi, " ")
    .replace(/\b(?:i[3579]|R[3579]|M[1234])(?:-\w+)?\b/gi, " ");
  mention.modelTokens = withoutNumbers
    .split(/[^A-Za-z0-9+]+/)
    .map((token) => token.toUpperCase())
    .filter(
      (token) =>
        token.length >= 2 &&
        !NOISE.has(token) &&
        token !== (brand ?? "").toUpperCase() &&
        // A bare number left over is a size or a year, not a model word.
        !/^\d+$/.test(token),
    );

  return mention;
}

/** Whether a mention says enough to look anything up at all. */
export function isResolvable(mention: ProductMention): boolean {
  return mention.brand !== null || mention.modelTokens.length > 0;
}
