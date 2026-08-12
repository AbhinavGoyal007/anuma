/**
 * Resolving the app's `@/…` imports outside Next.
 *
 * The catalogue modules are ordinary server code, but they address each other
 * through the `@/*` path alias that tsconfig and Next understand and plain Node
 * does not. Rather than give operational scripts their own copy of the logic —
 * which is how a script and the product quietly stop agreeing — this teaches the
 * loader the same alias.
 *
 * Run alongside `--conditions=react-server`, so that `server-only` resolves to
 * its empty build instead of the module whose whole purpose is to throw.
 */

import { existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";

const SOURCE_ROOT = resolvePath(import.meta.dirname, "..", "src");

/** The extensions a bundler would try, in the order tsconfig implies. */
const CANDIDATES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const base = resolvePath(SOURCE_ROOT, specifier.slice(2));
    for (const suffix of CANDIDATES) {
      const candidate = `${base}${suffix}`;
      if (existsSync(candidate) && !candidate.endsWith("/")) {
        return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
  }
  return nextResolve(specifier, context);
}
