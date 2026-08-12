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

/**
 * Which set of rules produced a stored spec.
 *
 * Bumped whenever a change here would read an existing description differently,
 * so a stored row can say what read it and the catalogue can be re-parsed
 * selectively rather than wholesale.
 */
export const SPEC_PARSER_VERSION = "sp.v3";

/**
 * Where this retailer's export cuts a description off.
 *
 * 57% of AG LLC's rows are exactly 40 characters, which is not a coincidence but
 * a column width — and it lands mid-number often enough to matter: "HP Victus
 * 16R1060NE A57E4EA i7-14700HX/3" ends on the first digit of 32GB. A row at the
 * limit is reported as truncated rather than believed.
 */
export const DESCRIPTION_TRUNCATED_AT = 40;

export type SpecIssue = "truncated" | "no_spec_section" | "implausible_ram" | "nothing_parsed";

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
export const PLAUSIBLE_RAM = new Set([2, 3, 4, 6, 8, 12, 16, 18, 24, 32, 36, 48, 64, 96, 128]);

const CPU =
  /\b(i[3579]|R[3579]|M[1234]|Ryzen\s*[3579]|Ultra\s*[3579]|Celeron|Pentium|Athlon|Snapdragon)[\w-]*/i;
const CPU_FAMILY =
  /\b(i[3579]|R[3579]|M[1234]|Ryzen\s*[3579]|Ultra\s*[3579]|Celeron|Pentium|Athlon|Snapdragon)/i;

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
  const truncated = cap !== undefined && text.length >= cap;
  if (truncated) spec.issues.push("truncated");

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

  // A cut-off description ends mid-value, so its final segment is a fragment
  // rather than a number. Real rows from this catalogue:
  //
  //   Lenovo 83DV000AAX LOQ i5-13450HX/16GB/51   the 51 is the start of 512
  //   Lenovo 83DV00ULPS LOQ 15IRX9 Gaming i7/2   the 2 is the start of 16 or 24
  //   Lenovo 83GS001LAX LOQ15IAX9 Gaming i5/51   the 51 is the start of 512
  //
  // Everything before the last slash survived the cut, so it is read normally
  // and only the fragment is discarded. Keeping it would be worse than having
  // nothing: a machine recorded as 2GB of memory does not merely fail to answer
  // "did we stock 16GB" — it answers it wrongly, and no one reading the result
  // would know the number came from a severed string.
  const readable = truncated ? segments.slice(1, -1) : segments.slice(1);

  for (const token of readable) {
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
    const isLastNumber = token === readable[readable.length - 1];
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
    } else if (
      // A single bare number at the very end, in the range screens come in, is
      // a screen. The canonical shorthand runs cpu/ram/storage/gpu/screen, so a
      // trailing value could be either — but rows omit the graphics far more
      // often than the size, and "Acer AV16-51P-7063 U7-155U/64GB/4TB/16" is a
      // sixteen-inch laptop, not one with sixteen gigabytes of video memory.
      spec.screenIn === null &&
      isLastNumber &&
      value >= 10 &&
      value <= 20
    ) {
      spec.screenIn = value;
    } else if (spec.gpuGb === null && value <= 24) {
      spec.gpuGb = value;
    } else if (spec.screenIn === null && value >= 10 && value <= 20) {
      spec.screenIn = value;
    }
  }

  if (spec.ramGb !== null && !PLAUSIBLE_RAM.has(spec.ramGb)) {
    // Report it and discard it. "i3/88GB/256GB" and "15ITL05/81x800ecus/i3/1"
    // both yield a memory size no machine ships with, and the second is not even
    // a memory size — it is a model code the shorthand happened to split. Keeping
    // the number would put those two rows at the top of "laptops with the most
    // memory", which is precisely where a category manager would trust it.
    spec.issues.push("implausible_ram");
    spec.ramGb = null;
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
