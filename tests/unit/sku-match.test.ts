import { describe, expect, it } from "vitest";

import { isResolvable, parseProductMention } from "@/modules/catalogue/product-mention";
import {
  matchConfidence,
  matchMention,
  rankMatches,
  type CandidateItem,
} from "@/modules/catalogue/sku-match";

/**
 * The mentions here are the shapes representatives actually use on the floor,
 * and the catalogue rows are real lines from AG LLC's export. The behaviour
 * being pinned throughout is the refusal to guess: a wrong SKU is worse than no
 * SKU, because it puts a confident answer under a question nobody re-checks.
 */

function item(overrides: Partial<CandidateItem> = {}): CandidateItem {
  return {
    id: "1",
    itemId: "1",
    description: "Lenovo LOQ 83DV0007AX i7/16/512/6/15.6/G",
    brandName: "Lenovo",
    groupName: "Notebooks",
    subgroupName: "Gaming PC",
    ramGb: 16,
    storageGb: 512,
    gpuGb: 6,
    screenIn: 15.6,
    specIssues: [],
    ...overrides,
  };
}

describe("reading a product as it was said", () => {
  it("separates the brand, the model words and the numbers", () => {
    const mention = parseProductMention("Lenovo LOQ with RTX 4060 and 16GB RAM");
    expect(mention.brand).toBe("Lenovo");
    expect(mention.modelTokens).toEqual(["LOQ"]);
    expect(mention.ramGb).toBe(16);
    expect(mention.gpuModel).toBe("RTX 4060");
  });

  it("knows what memory a named graphics chip actually carries", () => {
    expect(parseProductMention("RTX 4050").gpuGbCandidates).toEqual([6]);
    expect(parseProductMention("RTX 4060").gpuGbCandidates).toEqual([8]);
  });

  it("tells a drive from memory when both are said in GB", () => {
    const mention = parseProductMention("Acer Swift Go 16GB 512GB");
    expect(mention.ramGb).toBe(16);
    expect(mention.storageGb).toBe(512);
    expect(mention.modelTokens).toEqual(["SWIFT", "GO"]);
  });

  it("keeps multi-word models whole", () => {
    expect(parseProductMention("IdeaPad Slim 5").modelTokens).toEqual(["IDEAPAD", "SLIM"]);
  });

  it("says when a mention carries nothing to look up", () => {
    // Only category words and numbers: there is no identity here at all.
    expect(isResolvable(parseProductMention("a laptop"))).toBe(false);
    expect(isResolvable(parseProductMention("16GB gaming laptop"))).toBe(false);
    expect(isResolvable(parseProductMention("the Lenovo one"))).toBe(true);
  });

  it("lets an unrecognised word be looked up and find nothing, rather than guessing", () => {
    // "Whatever" is not a product, but the safe failure is an empty result from
    // the catalogue — not a decision here that some other row was probably meant.
    const mention = parseProductMention("Whatever 16GB");
    expect(mention.modelTokens).toEqual(["WHATEVER"]);
    const match = matchMention(mention, item());
    expect(match.facets.find((f) => f.name === "model")?.verdict).toBe("conflicts");
    expect(matchConfidence([match])).toBe("none");
  });
});

describe("matching a mention to a catalogue row", () => {
  it("identifies the row when everything stated agrees", () => {
    const match = matchMention(parseProductMention("Lenovo LOQ 16GB RTX 4050"), item());
    expect(match.conflicts).toBe(0);
    expect(matchConfidence([match])).toBe("exact");
  });

  it("rejects the neighbouring variant rather than calling it close", () => {
    // The row is a 4050 machine: 6GB of graphics memory. The customer asked for
    // a 4060, which is 8GB. Similarity would rank these as near-identical.
    const match = matchMention(parseProductMention("Lenovo LOQ RTX 4060"), item({ gpuGb: 6 }));
    expect(match.conflicts).toBe(1);
    expect(match.facets.find((f) => f.name === "graphics")).toMatchObject({
      wanted: "RTX 4060",
      found: "6GB",
      verdict: "conflicts",
    });
    expect(matchConfidence([match])).toBe("none");
  });

  it("does not accept a different model that shares a word", () => {
    const match = matchMention(
      parseProductMention("Acer Swift Go"),
      item({ description: "Acer Swift 3 SF314", brandName: "Acer" }),
    );
    expect(match.facets.find((f) => f.name === "model")?.verdict).toBe("conflicts");
  });

  it("separates a row that disagrees from one whose text was cut off", () => {
    // Truncation is the source data's fault, not the product's. Treating an
    // unreadable field as a disagreement would erase most of the range from
    // every answer.
    const damaged = matchMention(
      parseProductMention("Lenovo LOQ 16GB"),
      item({
        description: "Lenovo 83DV00ULPS LOQ 15IRX9 Gaming i7/2",
        ramGb: null,
        specIssues: ["truncated"],
      }),
    );
    expect(damaged.conflicts).toBe(0);
    expect(damaged.unreadable).toBe(1);
    expect(matchConfidence([damaged])).toBe("ambiguous");

    const disagrees = matchMention(parseProductMention("Lenovo LOQ 16GB"), item({ ramGb: 8 }));
    expect(disagrees.conflicts).toBe(1);
  });

  it("will not call it an identification when several rows fit equally", () => {
    const mention = parseProductMention("Lenovo LOQ");
    const ranked = rankMatches([
      matchMention(mention, item({ id: "a" })),
      matchMention(mention, item({ id: "b", description: "Lenovo LOQ 83GS00F6AX i5/16/1TB/15.6" })),
    ]);
    expect(matchConfidence(ranked)).toBe("likely");
  });

  it("ranks a contradicted row below an incomplete one, never above", () => {
    const mention = parseProductMention("Lenovo LOQ 16GB RTX 4060");
    const ranked = rankMatches([
      matchMention(mention, item({ id: "wrong-gpu", gpuGb: 6 })),
      matchMention(mention, item({ id: "right-gpu", gpuGb: 8 })),
    ]);
    expect(ranked[0]!.item.id).toBe("right-gpu");
    expect(ranked[0]!.conflicts).toBe(0);
  });

  it("reports nothing rather than a best guess when every row conflicts", () => {
    const mention = parseProductMention("Lenovo LOQ RTX 4090");
    const ranked = rankMatches([matchMention(mention, item({ gpuGb: 6 }))]);
    expect(matchConfidence(ranked)).toBe("none");
  });
});

describe("words that are not model words", () => {
  it("ignores the chip maker, which no catalogue description carries", () => {
    // Real mention. Treating NVIDIA as a model word ruled out all 67 LOQ rows.
    const mention = parseProductMention("Lenovo LOQ with NVIDIA RTX 4060");
    expect(mention.modelTokens).toEqual(["LOQ"]);
    expect(mention.gpuGbCandidates).toEqual([8]);
  });

  it("ignores processor words that the shorthand writes differently", () => {
    expect(parseProductMention("Lenovo LOQ Intel Core i7").modelTokens).toEqual(["LOQ"]);
  });
});
