import { describe, expect, it } from "vitest";

import {
  judgeColumn,
  parseMoney,
  resolveConflicts,
  type ColumnVerdict,
  type ProposedColumn,
} from "@/modules/catalogue/column-roles";

const propose = (role: ProposedColumn["role"], overrides: Partial<ProposedColumn> = {}) => ({
  column: "c",
  role,
  ...overrides,
});

describe("reading money out of a cell", () => {
  it("takes the figure whatever decoration surrounds it", () => {
    expect(parseMoney("27418")).toBe(27418);
    expect(parseMoney("$27,418")).toBe(27418);
    expect(parseMoney("₹1,99,999")).toBe(199999);
    expect(parseMoney(" 33248.00 ")).toBe(33248);
  });

  it("refuses anything that is not a figure", () => {
    expect(parseMoney("Carbonized Gray Metallic")).toBeNull();
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("3FTTW8A30SRA79739")).toBeNull();
  });
});

describe("checking a proposed role against the column itself", () => {
  it("rejects an identifier whose values repeat", () => {
    // Believing this collapses many products into one.
    const values = ["a", "a", "b", "b", "c", "c"];
    expect(judgeColumn(propose("identifier"), { column: "c", values }).reason).toBe("not_unique");
  });

  it("accepts an identifier that names each row", () => {
    const values = Array.from({ length: 200 }, (_, index) => `VIN${index}`);
    expect(judgeColumn(propose("identifier"), { column: "c", values }).accepted).toBe(true);
  });

  it("rejects a price column that does not hold money", () => {
    const values = Array.from({ length: 50 }, () => "Gasoline Fuel");
    expect(judgeColumn(propose("price"), { column: "c", values }).reason).toBe("not_numeric");
  });

  it("accepts a real price column", () => {
    const values = Array.from({ length: 50 }, (_, index) => `$${27000 + index * 100}`);
    expect(judgeColumn(propose("price"), { column: "c", values }).accepted).toBe(true);
  });

  it("rejects a category with a distinct value for every row", () => {
    // A serial number wearing a category's name. Grouping by it produces a
    // report with one row per product.
    const values = Array.from({ length: 100 }, (_, index) => `code-${index}`);
    expect(judgeColumn(propose("category_1"), { column: "c", values }).reason).toBe(
      "too_many_values_for_a_category",
    );
  });

  it("rejects an attribute that never varies", () => {
    // The Delaware feed's mileage column is 0 on all 726 rows, and its onlot
    // column is 1 on all of them. Neither narrows anything.
    const values = Array.from({ length: 100 }, () => "0");
    expect(
      judgeColumn(propose("attribute", { valueKind: "numeric" }), { column: "c", values }).reason,
    ).toBe("no_variation");
  });

  it("rejects a role the column is mostly empty for", () => {
    const values = [...Array.from({ length: 90 }, () => ""), ...["1", "2", "3", "4", "5"]];
    expect(judgeColumn(propose("price"), { column: "c", values }).reason).toBe("mostly_empty");
  });
});

describe("choosing between columns that claim the same role", () => {
  const verdict = (column: string, sampleValues: string[]): ColumnVerdict => ({
    column,
    role: "category_1",
    valueKind: "categorical",
    unit: null,
    accepted: true,
    reason: "accepted",
    distinctValues: 10,
    nullShare: 0,
    sampleValues,
  });

  it("prefers the column a person can read over the code beside it", () => {
    // Retailers ship both. Picking on completeness alone is a coin toss they
    // both win, and it put R0101 on a dashboard instead of Televisions.
    const resolved = resolveConflicts([
      verdict("DEPT_ID", ["R01", "R02", "R03"]),
      verdict("DEPT_NAME", ["Electronics", "Telecom", "Information Technology"]),
    ]);
    expect(resolved.find((v) => v.column === "DEPT_NAME")!.role).toBe("category_1");
    expect(resolved.find((v) => v.column === "DEPT_ID")!.role).toBe("attribute");
  });
});
