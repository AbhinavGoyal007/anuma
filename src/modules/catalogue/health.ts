import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * What the catalogue says, and what it fails to say.
 *
 * The point of this is not to grade the parser. It is to turn "some of the data
 * is bad" into a sentence a buyer can take to the retailer: 73,173 rows arrive
 * cut off at exactly forty characters, and that is a column width in an export,
 * not a fact about the products. One conversation fixes all of them; correcting
 * them by hand fixes none.
 *
 * Counted through an RPC because the answer is a handful of rows aggregated from
 * a hundred and eighty thousand, and PostgREST would cap the read at a thousand
 * long before it finished.
 */

export type SpecIssueKey =
  "readable" | "truncated" | "no_spec_section" | "implausible_ram" | "nothing_parsed";

export type SpecIssueSummary = {
  key: SpecIssueKey;
  /** What it means for a person, not the code name. */
  title: string;
  /** Why it happens and what would fix it. */
  explanation: string;
  itemCount: number;
  exampleDescription: string | null;
  /** Whether this is a fault in the data rather than a limit of the reading. */
  isDataFault: boolean;
};

const ISSUE_COPY: Record<
  SpecIssueKey,
  { title: string; explanation: string; isDataFault: boolean }
> = {
  readable: {
    title: "Read in full",
    explanation:
      "Every attribute the description carries was understood, so these products can be matched on their specification.",
    isDataFault: false,
  },
  truncated: {
    title: "Cut off by the export",
    explanation:
      "The description stops at the column width, mid-value. “…LOQ i5-13450HX/16GB/51” ends on the first two digits of 512GB. Everything before the cut is kept and the fragment is discarded, because a product recorded as 51GB of storage answers a stock question wrongly rather than not at all. Ask the retailer to export the full description field.",
    isDataFault: true,
  },
  no_spec_section: {
    title: "No specification written",
    explanation:
      "The description names the product but carries no specification shorthand at all. Common and usually correct — an accessory or a phone has nothing of this shape to state.",
    isDataFault: false,
  },
  implausible_ram: {
    title: "Memory that no machine is sold with",
    explanation:
      "A memory figure outside every size laptops actually ship in. Usually a misplaced value in the source row rather than a reading error.",
    isDataFault: true,
  },
  nothing_parsed: {
    title: "Nothing could be read",
    explanation:
      "Neither a processor nor any specification could be recognised. Expected across most of a general catalogue; only worth acting on within categories where a specification should exist.",
    isDataFault: false,
  },
};

export type CatalogueHealth = {
  currentItems: number;
  parsedItems: number;
  issues: SpecIssueSummary[];
  lastImport: {
    filename: string | null;
    status: string;
    addedCount: number;
    changedCount: number;
    delistedCount: number;
    unchangedCount: number;
    createdAt: string;
  } | null;
};

export async function getCatalogueHealth(organizationId: string): Promise<CatalogueHealth> {
  const supabase = await createClient();

  const [items, parsed, health, lastImport] = await Promise.all([
    supabase
      .from("catalogue_items")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("valid_to", null),
    supabase
      .from("catalogue_items")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("valid_to", null)
      .not("spec_parsed_at", "is", null),
    supabase.rpc("catalogue_spec_health", { p_organization_id: organizationId }),
    supabase
      .from("catalogue_imports")
      .select(
        "filename, status, added_count, changed_count, delisted_count, unchanged_count, created_at",
      )
      .eq("organization_id", organizationId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const issues = (health.data ?? [])
    .map((row) => {
      const key = row.issue as SpecIssueKey;
      const copy = ISSUE_COPY[key];
      // An issue the parser learns to report before this list knows about it
      // should still appear, rather than vanishing from the count silently.
      return {
        key,
        title: copy?.title ?? key,
        explanation: copy?.explanation ?? "",
        isDataFault: copy?.isDataFault ?? false,
        itemCount: Number(row.item_count),
        exampleDescription: row.example_description,
      };
    })
    .sort((a, b) => b.itemCount - a.itemCount);

  return {
    currentItems: items.count ?? 0,
    parsedItems: parsed.count ?? 0,
    issues,
    lastImport: lastImport.data
      ? {
          filename: lastImport.data.filename,
          status: lastImport.data.status,
          addedCount: lastImport.data.added_count,
          changedCount: lastImport.data.changed_count,
          delistedCount: lastImport.data.delisted_count,
          unchangedCount: lastImport.data.unchanged_count,
          createdAt: lastImport.data.created_at,
        }
      : null,
  };
}
