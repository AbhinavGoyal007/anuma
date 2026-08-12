/**
 * Comparing two pieces of meaning as vectors.
 *
 * Used for exactly one thing: proposing which ANUMA category a retailer's own
 * label probably means. "Clamshell" shares no characters with "laptop", so no
 * amount of string matching finds it — but their descriptions sit close together
 * in meaning, and that is what this measures.
 *
 * Pure and tiny on purpose. It ranks a dropdown for a person to confirm; it
 * never decides anything, and no figure a dashboard shows is ever derived from
 * a similarity score.
 */

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export type Candidate<T> = { item: T; score: number };

/** The closest options, best first. */
export function rankBySimilarity<T>(
  query: readonly number[],
  options: readonly { item: T; vector: readonly number[] }[],
  limit = 3,
): Candidate<T>[] {
  return options
    .map((option) => ({ item: option.item, score: cosineSimilarity(query, option.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
