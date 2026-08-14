import "server-only";

import OpenAI from "openai";

import { getOpenAIEnvironment } from "@/lib/env";
import { cosineSimilarity } from "@/modules/catalogue/similarity";
import type { Requirement } from "@/modules/catalogue/missed-opportunity";

/**
 * Joining what a customer said to what a retailer stocks.
 *
 * This is the join the product turns on, and until now it did not exist. A
 * customer asks for a hybrid; the Delaware feed writes `Gas/Electric Hybrid`,
 * `Hybrid Fuel` and `PHEV`. Those are one thing and share almost no characters,
 * so the exact matching used everywhere else binds none of them — against a real
 * feed it bound nothing at all, three requirements out of three.
 *
 * The rule this system was built on says match deterministically, never by
 * similarity, because RTX 4050 and RTX 4060 are one character apart and a
 * confident wrong answer about which one you stocked is worse than none. That
 * rule is right, and I applied it one level too far. It is a rule about
 * *identity* — which physical product is this — and identity is still exact.
 * What a customer *wants* is meaning, and meaning is exactly what an embedding
 * measures. Two tracks, never mixed: codes and model numbers stay literal,
 * requirements are matched semantically.
 *
 * The safeguard is the one already proven on this retailer's category labels:
 * the *margin* to the runner-up, not the top score. A phrase whose two best
 * values are neck and neck is one the catalogue cannot settle, and saying so
 * beats picking.
 *
 * Cost is bounded by the catalogue's vocabulary, not its size. Distinct values
 * per attribute are in the dozens — twelve fuel types across 726 vehicles — and
 * are embedded once and cached. Nothing here runs per row, and nothing per
 * conversation beyond embedding the handful of phrases a customer said.
 */

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBED_BATCH = 256;

async function embed(texts: readonly string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const client = new OpenAI({ apiKey: getOpenAIEnvironment().OPENAI_API_KEY });
  const vectors: number[][] = [];
  for (let start = 0; start < texts.length; start += EMBED_BATCH) {
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: [...texts.slice(start, start + EMBED_BATCH)],
    });
    for (const item of response.data) vectors.push(item.embedding);
  }
  return vectors;
}

/** One value a retailer's catalogue actually holds, on one attribute. */
export type CatalogueValue = {
  attributeKey: string;
  value: string;
  /** How the attribute is compared, carried from its definition. */
  comparison: "at_least" | "at_most" | "equals";
};

/**
 * How clearly a phrase must beat the runner-up value to be bound.
 *
 * The same threshold that separated right from wrong category proposals on this
 * retailer's own labels, where every wrong call sat below 0.10 and every right
 * one at or above it. A phrase whose two best matches are within that of each
 * other has not identified anything.
 */
export const BINDING_MARGIN = 0.1;

/**
 * Below this the best match is not a match at all.
 *
 * "Back-seat space for two children in car seats" has a nearest value in any
 * vocabulary, and without a floor it would bind to whichever one happened to be
 * closest — reporting a checked requirement that was never checked.
 */
export const BINDING_FLOOR = 0.35;

/**
 * How well two attributes must both score before their agreement counts.
 *
 * Corroboration is two sources confidently saying the same thing. Two sources
 * each barely clearing the floor and landing a hundredth apart are not agreeing;
 * they are both guessing, and treating that as agreement bound "back-seat space
 * for two children in car seats" to a two-door car and excluded every vehicle on
 * the lot. Set well above the floor so only confident pairs qualify.
 */
export const CORROBORATION_FLOOR = 0.55;

export type SemanticBinding =
  | {
      bound: true;
      phrase: string;
      requirement: Requirement;
      score: number;
      margin: number;
      runnerUp: string | null;
    }
  | {
      bound: false;
      phrase: string;
      reason: "nothing_close_enough" | "two_values_too_alike";
      best: string | null;
      score: number;
      margin: number;
    };

/**
 * The catalogue value each phrase means, where the catalogue can settle it.
 *
 * Values are passed in rather than fetched so the caller decides the scope — one
 * node, one department, or the whole catalogue — and so this stays testable
 * against a fixed vocabulary.
 */
export async function bindPhrasesToValues(
  phrases: readonly string[],
  values: readonly CatalogueValue[],
): Promise<SemanticBinding[]> {
  if (phrases.length === 0 || values.length === 0) {
    return phrases.map((phrase) => ({
      bound: false,
      phrase,
      reason: "nothing_close_enough",
      best: null,
      score: 0,
      margin: 0,
    }));
  }

  // A bare value embeds poorly on its own: "Gas" and "New" are words before they
  // are fuel types. Naming the attribute alongside it gives the vector the
  // context a reader would have.
  const valueVectors = await embed(
    values.map((value) => `${value.attributeKey.replace(/_/g, " ")}: ${value.value}`),
  );
  const phraseVectors = await embed(phrases);

  return phrases.map((phrase, index): SemanticBinding => {
    const query = phraseVectors[index]!;
    const ranked = values
      .map((value, position) => ({
        value,
        score: cosineSimilarity(query, valueVectors[position]!),
      }))
      .sort((a, b) => b.score - a.score);

    const best = ranked[0]!;
    // The contest is between *attributes*, not between values. "Hybrid",
    // "Hybrid Fuel" and "Gas/Electric Hybrid" are one retailer's three
    // spellings of one idea, and scoring them against each other made the
    // margin between two spellings look like uncertainty about what the
    // customer meant — it rejected "hybrid powertrain" outright.
    // Against the best value of a *different* attribute where there is one:
    // values of the same attribute are usually one retailer's several spellings
    // of one idea, and scoring those against each other reads as uncertainty.
    //
    // Where every value shares one key they are not spellings, they are rivals —
    // a list of categories competing for the same phrase — and there is no other
    // attribute to measure against. Falling back to zero made the margin equal
    // the score, which is no check at all: it let "2 bhk flat" resolve to "Flat
    // Monitor" at 0.37 in an electronics catalogue, on the word flat. The
    // second-best value is the honest comparison there.
    const runnerUp =
      ranked.find((entry) => entry.value.attributeKey !== best.value.attributeKey) ?? ranked[1];
    const margin = best.score - (runnerUp?.score ?? 0);

    if (best.score < BINDING_FLOOR) {
      return {
        bound: false,
        phrase,
        reason: "nothing_close_enough",
        best: best.value.value,
        score: best.score,
        margin,
      };
    }
    // A close second from another attribute is only a problem when it is a
    // different idea. Two attributes both scoring high on the same phrase are
    // usually two records of one fact — a dealer's bodystyle column saying SUVs
    // and world knowledge about a Ford Escape saying SUV — and treating that
    // agreement as a tie made the requirement vanish the moment a second source
    // confirmed it. Corroboration is carried as an alternative instead.
    const corroborating =
      runnerUp !== undefined &&
      best.score >= CORROBORATION_FLOOR &&
      runnerUp.score >= CORROBORATION_FLOOR &&
      margin < BINDING_MARGIN;

    if (margin < BINDING_MARGIN && !corroborating) {
      return {
        bound: false,
        phrase,
        reason: "two_values_too_alike",
        best: best.value.value,
        score: best.score,
        margin,
      };
    }

    // Every value of the winning attribute that still beats the best value of
    // any other attribute. A value that outscores everything the catalogue
    // records about anything else is about this attribute, whatever its
    // spelling.
    //
    // A fixed window around the top score was too tight for the case that
    // matters. Three dealers in one feed write "SUVs" and the fourth writes
    // "Sport Utility"; the second scored just outside a tenth of the first and
    // was dropped, which excluded that dealer's own cars from a report about
    // that dealer's own missed sale. Retailers disagree with themselves about
    // wording constantly, and a customer asking for an SUV means both.
    const ceiling = Math.max(BINDING_FLOOR, runnerUp?.score ?? BINDING_FLOOR);
    const acceptable = ranked
      .filter(
        (entry) => entry.value.attributeKey === best.value.attributeKey && entry.score > ceiling,
      )
      .map((entry) => entry.value.value);

    // Every other attribute whose best value also clears the floor and sits
    // close to the winner: the same fact recorded twice.
    const alternatives = corroborating
      ? [...new Set(ranked.map((entry) => entry.value.attributeKey))]
          .filter((key) => key !== best.value.attributeKey)
          .map((key) => ({
            key,
            valueTextAnyOf: ranked
              .filter(
                (entry) =>
                  entry.value.attributeKey === key &&
                  entry.score >= Math.max(BINDING_FLOOR, best.score - BINDING_MARGIN),
              )
              .map((entry) => entry.value.value),
          }))
          .filter((alternative) => alternative.valueTextAnyOf.length > 0)
      : undefined;

    return {
      bound: true,
      phrase,
      score: best.score,
      margin,
      runnerUp: runnerUp?.value.value ?? null,
      requirement: {
        key: best.value.attributeKey,
        comparison: "equals",
        valueText: best.value.value,
        valueNumeric: null,
        valueTextAnyOf: acceptable,
        ...(alternatives && alternatives.length > 0 ? { alternatives } : {}),
      },
    };
  });
}
