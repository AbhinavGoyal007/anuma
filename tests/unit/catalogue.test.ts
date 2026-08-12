import { describe, expect, it } from "vitest";

import { contentHash, parseDelimited, toCatalogueRows } from "@/modules/catalogue/csv";
import { parseSpec, specCompleteness } from "@/modules/catalogue/spec-parser";

/**
 * Every example here is a real line from a retailer's export. The parser's job
 * is to be right about the ones it can read and honest about the ones it cannot,
 * because a misread specification becomes a wrong "we had it in stock".
 */

describe("reading the export", () => {
  it("keeps a quoted description containing commas and escaped quotes intact", () => {
    // The real first row of the file: a 65-inch TV, where 65" is an escaped quote.
    const sheet = parseDelimited(
      'ITEM_ID,ITEM_DESC\n1328869,"TCL 65P755 4K UHD Smart Android TV 65"""\n',
    );
    expect(sheet[1]![1]).toBe('TCL 65P755 4K UHD Smart Android TV 65"');
  });

  it("tolerates a byte order mark and CRLF line endings", () => {
    const sheet = parseDelimited('﻿ITEM_ID,ITEM_DESC\r\n1,Widget\r\n');
    expect(sheet[0]![0]).toBe("ITEM_ID");
    expect(sheet[1]).toEqual(["1", "Widget"]);
  });

  it("reports missing columns instead of importing a wrong file", () => {
    const result = toCatalogueRows(parseDelimited("SKU,NAME\n1,Widget\n"));
    expect(result.rows).toHaveLength(0);
    expect(result.missingColumns).toContain("ITEM_ID");
  });

  it("skips rows with no identity and keeps the first of a duplicate", () => {
    const header =
      "ITEM_ID,ITEM_DESC,DEPT_ID,DEPT_NAME,BRAND_ID,BRAND_NAME,GROUP_ID,GROUP_NAME,SUBGROUP_ID,SUBGROUP_NAME";
    const result = toCatalogueRows(
      parseDelimited(`${header}\n,No id,,,,,,,,\n7,First,,,,,,,,\n7,Second,,,,,,,,\n`),
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.description).toBe("First");
    expect(result.skipped).toHaveLength(2);
  });

  it("hashes content but not identity, so an unchanged row is recognised", () => {
    const base = {
      itemId: "1",
      description: "Lenovo LOQ",
      brandId: "L1",
      brandName: "Lenovo",
      deptId: null,
      deptName: null,
      groupId: null,
      groupName: null,
      subgroupId: null,
      subgroupName: null,
    };
    expect(contentHash(base)).toBe(contentHash({ ...base, itemId: "999" }));
    expect(contentHash(base)).not.toBe(contentHash({ ...base, description: "Lenovo LOQ 2" }));
  });
});

describe("reading the product shorthand", () => {
  it("decodes a full specification", () => {
    const spec = parseSpec("Lenovo LOQ 83DV0007AX i7/16/512/6/15.6/G");
    expect(spec.cpu).toBe("i7");
    expect(spec.ramGb).toBe(16);
    expect(spec.storageGb).toBe(512);
    expect(spec.gpuGb).toBe(6); // this is what makes it an RTX 4050 machine
    expect(spec.screenIn).toBe(15.6);
    expect(spec.colour).toBe("G");
    expect(spec.issues).toEqual([]);
  });

  it("handles AMD processors and terabyte drives", () => {
    expect(parseSpec("Lenovo LOQ 83TN0019AX R7-2/16/512/8/15/G").cpuFamily).toBe("R7");
    expect(parseSpec("Lenovo LOQ 83GS00F6AX i5/16GB/1TB/15.6").storageGb).toBe(1024);
  });

  it("does not invent a graphics chip when the machine has none", () => {
    // i5 / 16GB / 1TB / 15.6 — the last value is a screen, not graphics.
    const spec = parseSpec("Lenovo LOQ 83GS00F6AX i5/16GB/1TB/15.6");
    expect(spec.screenIn).toBe(15.6);
    expect(spec.gpuGb).toBeNull();
  });

  it("flags a cut-off description rather than trusting the fragment", () => {
    // Real row, cut off by the export at 40 characters: that trailing 3 is the
    // first digit of 32GB. The parser cannot know that — which is exactly why
    // truncation is reported, so the row goes to review instead of into stock
    // data claiming a 3GB laptop.
    const spec = parseSpec("HP Victus 16R1060NE A57E4EA i7-14700HX/3", {
      truncatedAtLength: 40,
    });
    expect(spec.issues).toContain("truncated");
    expect(spec.ramGb).toBe(3);
  });

  it("flags memory no machine is sold with", () => {
    const spec = parseSpec("Some Laptop i7/7/512/15.6");
    expect(spec.issues).toContain("implausible_ram");
  });

  it("reports a description it cannot read at all", () => {
    const spec = parseSpec("HP Pavilion X360 11U002NEP3T60EA Convert");
    expect(spec.issues).toContain("nothing_parsed");
    expect(specCompleteness(spec)).toBe(0);
  });

  it("still finds the processor when there is no shorthand section", () => {
    const spec = parseSpec("HP EliteBook with i7-1165G7 processor");
    expect(spec.cpuFamily).toBe("i7");
    expect(spec.issues).toContain("no_spec_section");
    expect(spec.issues).not.toContain("nothing_parsed");
  });
});
