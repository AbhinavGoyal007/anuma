import "server-only";

import OpenAI from "openai";
import { z } from "zod";

import { getOpenAIEnvironment } from "@/lib/env";

/**
 * Asking what a product is, when the retailer's file does not say.
 *
 * A dealer's export says a Super Meteor 650 exists in Astral Black. It does not
 * say it is the touring bike in the range, and a customer wanting to ride to
 * Coorg with his wife on the back has asked precisely that. A Delaware feed says
 * Escape PHEV and does not say a plug-in hybrid is a hybrid. Everyone on the
 * shop floor knows both. Nothing in the data does.
 *
 * Asked once per distinct product and cached across every tenant, because a
 * Super Meteor is a Super Meteor at every dealer on earth. Fifty-five models
 * covered 726 vehicles; a small client's three hundred products is three hundred
 * calls, once, ever.
 *
 * The model is asked to say when it does not recognise something. An unbranded
 * no-name product has no world knowledge to fetch, and inventing plausible
 * descriptors for it would put confident fiction into the one place the rest of
 * this system cannot check — the retailer's data cannot contradict it, because
 * the retailer's data is what was missing in the first place.
 */

const knowledge = z.object({
  products: z
    .array(
      z.object({
        brand: z.string(),
        model: z.string(),
        recognised: z.boolean(),
        descriptors: z.array(z.string()),
        suitedTo: z.array(z.string()),
      }),
    )
    .max(60),
});

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["products"],
  properties: {
    products: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["brand", "model", "recognised", "descriptors", "suitedTo"],
        properties: {
          brand: { type: "string" },
          model: { type: "string" },
          recognised: { type: "boolean" },
          descriptors: { type: "array", items: { type: "string" } },
          suitedTo: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

const INSTRUCTION = `You are given a list of products by brand and model. For each one, say what it is and what it is for, in the ordinary words a shopper would use.

descriptors — what kind of thing it is. A body style, a segment, a powertrain family, a form factor. For a Royal Enfield Super Meteor 650: cruiser, touring motorcycle, parallel twin. For a Ford Escape PHEV: compact SUV, plug-in hybrid, hybrid. Include the broader word as well as the specific one, because a shopper asking for a hybrid means the plug-in too.

suitedTo — what a shopper would actually use it for, in their words. Long highway rides with a pillion. Daily city commuting. Carrying a family of five. Light off-road touring.

Set recognised to false when you do not know the product specifically, and return empty lists for it. A product you have not seen before is a normal outcome — most of any retailer's catalogue is unremarkable, and guessing at it puts invented facts where nothing can check them. Do not infer from the name: a model number that looks like it should be a truck is not evidence that it is one.

Say nothing about price, availability, or what any particular shop stocks.`;

export type ProductRef = { brand: string; model: string };

export type ProductFacts = ProductRef & {
  recognised: boolean;
  descriptors: string[];
  suitedTo: string[];
};

/** Lower case, single-spaced, so one product is not two rows. */
export function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** What these products are, asked in one batch. */
export async function describeProducts(products: readonly ProductRef[]): Promise<ProductFacts[]> {
  if (products.length === 0) return [];
  const env = getOpenAIEnvironment();
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  const response = await client.responses.create({
    model: env.ANUMA_ANALYSIS_MODEL,
    reasoning: { effort: "low" },
    text: {
      format: { type: "json_schema", name: "product_knowledge", strict: true, schema: jsonSchema },
    },
    input: [
      { role: "system", content: INSTRUCTION },
      {
        role: "user",
        content: products.map((product) => `${product.brand} | ${product.model}`).join("\n"),
      },
    ],
  });

  const parsed = knowledge.parse(JSON.parse(response.output_text));
  return parsed.products.map((product) => ({
    brand: product.brand,
    model: product.model,
    recognised: product.recognised,
    descriptors: product.recognised ? product.descriptors : [],
    suitedTo: product.recognised ? product.suitedTo : [],
  }));
}
