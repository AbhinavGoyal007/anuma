/**
 * Reading a retailer's product shorthand.
 *
 * Catalogue descriptions are not prose — they are a compressed convention:
 *
 *   Lenovo LOQ 83DV0007AX i7/16/512/6/15.6/G
 *                         └ cpu ┘ ram storage gpu screen colour
 *
 * A person reads that instantly, because they know 16 is a normal amount of
 * memory, 512 a normal drive, 6 a normal amount of graphics memory, and 15.6 a
 * normal screen. This writes those judgements down as rules so the same reading
 * can be applied to a hundred and eighty thousand rows.
 *
 * Nothing here guesses. Where a value cannot be placed with confidence the field
 * is left null and the reason is recorded, because the review screen groups
 * products by *why* they could not be read — one rule then fixes thousands of
 * rows at once, rather than a person correcting them one by one.
 */

export type SpecIssue =
  | "truncated"
  | "no_spec_section"
  | "implausible_ram"
  | "nothing_parsed";

export type ParsedSpec = {
  cpu: string | null;
  /** The processor tier alone — i7, R7, M2 — for comparing across brands. */
  cpuFamily: string | null;
  ramGb: number | null;
  storageGb: number | null;
  gpuGb: number | null;
  screenIn: number | null;
  colour: string | null;
  issues: SpecIssue[];
};

/** Memory sizes laptops are actually sold with. Anything else is a misread. */
const PLAUSIBLE_RAM = new Set([2, 3, 4, 6, 8, 12, 16, 18, 24, 32, 36, 48, 64, 96, 128]);

const CPU = /\b(i[3579]|R[3579]|M[1234]|Ryzen\s*[3579]|Ultra\s*[3579]|Celeron|Pentium|Athlon|Snapdragon)[\w-]*/i;
const CPU_FAMILY = /\b(i[3579]|R[3579]|M[1234]|Ryzen\s*[3579]|Ultra\s*[3579]|Celeron|Pentium|Athlon|Snapdragon)/i;

/** A screen size, in the range laptops are actually made in. */
function isScreen(value: number, token: string): boolean {
  if (value < 10 || value > 20) return false;
  // A decimal or an inch mark is decisive; a bare integer is not.
  return /[.'"]/.test(token);
}

function numberIn(token: string): { value: number; unit: string } | null {
  const match = /^(\d+(?:\.\d+)?)\s*(TB|T|GB|G|MB|B)?/i.exec(token.trim());
  if (!match) return null;
  return { value: Number(match[1]), unit: (match[2] ?? "").toUpperCase() };
}

export function parseSpec(
  description: string,
  options: { truncatedAtLength?: number } = {},
): ParsedSpec {
  const spec: ParsedSpec = {
    cpu: null,
    cpuFamily: null,
    ramGb: null,
    storageGb: null,
    gpuGb: null,
    screenIn: null,
    colour: null,
    issues: [],
  };

  const text = description.trim();
  const cap = options.truncatedAtLength;
  if (cap !== undefined && text.length >= cap) spec.issues.push("truncated");

  const segments = text.split("/").map((part) => part.trim());
  if (segments.length < 2) {
    spec.issues.push("no_spec_section");
    // The processor may still be readable from a description with no shorthand.
    const loose = CPU.exec(text);
    if (loose) {
      spec.cpu = loose[0];
      spec.cpuFamily = CPU_FAMILY.exec(loose[0])?.[0] ?? null;
    }
    if (!spec.cpu) spec.issues.push("nothing_parsed");
    return spec;
  }

  // The processor sits at the end of the segment before the first slash.
  const head = CPU.exec(segments[0]!);
  if (head) {
    spec.cpu = head[0];
    spec.cpuFamily = CPU_FAMILY.exec(head[0])?.[0] ?? null;
  }

  for (const token of segments.slice(1)) {
    if (token.length === 0) continue;

    // A processor can appear after the first slash too: "HP Victus/i7-12700H/16".
    if (!spec.cpu && CPU.test(token) && !/^\d/.test(token)) {
      const found = CPU.exec(token)!;
      spec.cpu = found[0];
      spec.cpuFamily = CPU_FAMILY.exec(found[0])?.[0] ?? null;
      continue;
    }

    const parsed = numberIn(token);
    if (!parsed) {
      // A short all-letters token after the numbers is the colour.
      if (!spec.colour && /^[A-Za-z]{1,4}$/.test(token) && spec.ramGb !== null) {
        spec.colour = token.toUpperCase();
      }
      continue;
    }

    const { value, unit } = parsed;
    if (unit === "TB" || unit === "T") {
      spec.storageGb ??= value * 1024;
    } else if (value >= 128) {
      spec.storageGb ??= value;
    } else if (isScreen(value, token) && spec.screenIn === null) {
      spec.screenIn = value;
    } else if (spec.ramGb === null) {
      spec.ramGb = value;
    } else if (spec.storageGb === null) {
      spec.storageGb = value;
    } else if (spec.gpuGb === null && value <= 24) {
      spec.gpuGb = value;
    } else if (spec.screenIn === null && value >= 10 && value <= 20) {
      spec.screenIn = value;
    }
  }

  if (spec.ramGb !== null && !PLAUSIBLE_RAM.has(spec.ramGb)) {
    spec.issues.push("implausible_ram");
  }
  if (
    spec.cpu === null &&
    spec.ramGb === null &&
    spec.storageGb === null &&
    spec.screenIn === null
  ) {
    spec.issues.push("nothing_parsed");
  }

  return spec;
}

/** How many of the six attributes were read. Used to rank what needs review. */
export function specCompleteness(spec: ParsedSpec): number {
  return [spec.cpu, spec.ramGb, spec.storageGb, spec.gpuGb, spec.screenIn, spec.colour].filter(
    (value) => value !== null,
  ).length;
}
