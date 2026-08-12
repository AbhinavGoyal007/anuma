import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { contentHash, type CatalogueRow } from "@/modules/catalogue/csv";

/**
 * Loading a catalogue file into the versioned item table.
 *
 * The file lands in a staging table first and the diff is then done in one
 * set-based step in the database. Comparing 180,000 rows from here would mean
 * 180,000 round trips; staging turns the whole daily import into four
 * statements, and the common case — an unchanged row — costs a hash comparison.
 *
 * Uses the service-role client because an import is a system action running on
 * behalf of an administrator, not a query the viewer's own permissions scope.
 */

/** Rows per insert. Large enough to be few round trips, small enough to fit a request. */
const CHUNK = 2_000;

export type ImportResult = {
  importId: string;
  rowCount: number;
  added: number;
  changed: number;
  delisted: number;
  unchanged: number;
};

export async function importCatalogue(input: {
  organizationId: string;
  membershipId: string | null;
  filename: string;
  rows: readonly CatalogueRow[];
}): Promise<ImportResult> {
  const db = createAdminClient();

  const { data: created, error: createError } = await db
    .from("catalogue_imports")
    .insert({
      organization_id: input.organizationId,
      filename: input.filename,
      row_count: input.rows.length,
      imported_by_membership_id: input.membershipId,
      status: "processing",
    })
    .select("id")
    .single();
  if (createError || !created) throw new Error("The catalogue import could not be opened.");

  try {
    for (let start = 0; start < input.rows.length; start += CHUNK) {
      const chunk = input.rows.slice(start, start + CHUNK).map((row) => ({
        organization_id: input.organizationId,
        import_id: created.id,
        item_id: row.itemId,
        description: row.description,
        brand_id: row.brandId,
        brand_name: row.brandName,
        dept_id: row.deptId,
        dept_name: row.deptName,
        group_id: row.groupId,
        group_name: row.groupName,
        subgroup_id: row.subgroupId,
        subgroup_name: row.subgroupName,
        content_hash: contentHash(row),
      }));
      const { error } = await db.from("catalogue_staging").insert(chunk);
      if (error) throw new Error(`Staging failed at row ${start}: ${error.message}`);
    }

    const { data: applied, error: applyError } = await db
      .rpc("apply_catalogue_import", { p_import_id: created.id })
      .single();
    if (applyError) throw new Error(applyError.message);

    return {
      importId: created.id,
      rowCount: input.rows.length,
      added: applied?.added ?? 0,
      changed: applied?.changed ?? 0,
      delisted: applied?.delisted ?? 0,
      unchanged: applied?.unchanged ?? 0,
    };
  } catch (error) {
    // A half-loaded staging table must not be mistaken for a real file next
    // time, and an import stuck in `processing` is indistinguishable from one
    // still running.
    await db.from("catalogue_staging").delete().eq("import_id", created.id);
    await db
      .from("catalogue_imports")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: (error instanceof Error ? error.message : "Import failed.").slice(0, 500),
      })
      .eq("id", created.id);
    throw error;
  }
}
