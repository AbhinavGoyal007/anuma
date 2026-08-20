import { createHash } from "node:crypto";

/**
 * Deterministic identity for a scope and for a finding.
 *
 * The old implementation concatenated `key=value&key=value` and called the
 * result a hash. It was neither: two different selections could produce the same
 * string, it ignored the absolute dates a relative period resolves to, and it
 * bound a manager's answer to nothing about the interactions they were actually
 * looking at. A review saved against "last 30 days" meant something different a
 * week later and nothing said so.
 *
 * Canonical serialisation here follows the JSON Canonicalization Scheme's rule
 * that matters for this purpose — keys sorted, no incidental whitespace — so the
 * same inputs always serialise identically regardless of the order they were
 * applied in, and the digest is a real SHA-256.
 */

type Canonical = string | number | boolean | null | Canonical[] | { [key: string]: Canonical };

/** Sorted keys, no whitespace, nulls preserved: byte-identical for equal input. */
export function canonicalize(value: Canonical): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key]!)}`).join(",")}}`;
}

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * The population a number was read from, as a stable fingerprint.
 *
 * Includes the resolved absolute period rather than the relative window, so
 * "last 30 days" on Monday and on the following Monday are different scopes —
 * which they are.
 */
export function scopeFingerprint(input: {
  from: string;
  to: string;
  filters: Record<string, string | null>;
}): string {
  const filters: Record<string, Canonical> = {};
  for (const key of Object.keys(input.filters).sort()) {
    const value = input.filters[key];
    if (value !== null && value !== "") filters[key] = value;
  }
  return sha256(canonicalize({ from: input.from, to: input.to, filters }));
}

/**
 * A specific finding as it stood when somebody judged it.
 *
 * The cohort's membership is part of the identity. Without it, "was this
 * useful?" answered about eighteen interactions would silently attach itself to
 * a different eighteen tomorrow, and the pilot's central question would be
 * measuring something nobody answered.
 */
export function findingFingerprint(input: {
  scopeFingerprint: string;
  page: string;
  findingKey: string;
  cohortKey: string;
  recordIds: readonly string[];
}): string {
  return sha256(
    canonicalize({
      scopeFingerprint: input.scopeFingerprint,
      page: input.page,
      findingKey: input.findingKey,
      cohortKey: input.cohortKey,
      recordIds: [...input.recordIds].sort(),
    }),
  );
}
