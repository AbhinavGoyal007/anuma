import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { defaultFieldDefinitions } from "@/modules/field-library/defaults";
import {
  rowToDefinition,
  rowToExtractionField,
  type FieldDefinition,
} from "@/modules/field-library/mapping";
import type { ExtractionField } from "@/modules/interaction-record/extraction-contract";

/**
 * Reads over the per-organization field library.
 *
 * Two readers with two clients on purpose: the settings page reads through the
 * cookie client so RLS scopes it to the viewer's organization, while the
 * pipeline reads through the service-role client because it runs with no user.
 * Both seed the defaults first, so an organization that has never opened the
 * page still extracts against the full registry.
 */

const COLUMNS =
  "id, key, label, definition, source_class, alternate_source_class, value_kind, cardinality, enum_values, labelled, requires_evidence, is_system, is_enabled, sort_order, task, scope, speaker_source";

/**
 * Seeds the default library for an organization that has none.
 *
 * Idempotent and safe to call on every read: a key that already exists is left
 * untouched, and a concurrent first call collides harmlessly on the unique
 * (organization_id, key). Uses the service-role client because populating an
 * organization's defaults is a system action, not an administrator's edit.
 */
export async function ensureFieldLibrarySeeded(organizationId: string): Promise<void> {
  const db = createAdminClient();
  const rows = defaultFieldDefinitions().map((seed) => ({
    ...seed,
    organization_id: organizationId,
  }));
  // Upsert every default with ignoreDuplicates, so an organization that has
  // never been seeded gets the full set, and one that was seeded before a new
  // standard field existed picks it up on next access — while a key it already
  // has (edited, disabled, whatever) is left exactly as the business left it.
  await db
    .from("interaction_field_definitions")
    .upsert(rows, { onConflict: "organization_id,key", ignoreDuplicates: true });

  // Backfill the properties a row can only have gained by the registry changing
  // under it. `ignoreDuplicates` protects a business's edits, which is right —
  // but it also means an organization seeded before task and scope existed keeps
  // extracting against a prompt that never mentions them, silently and for ever.
  // Only system-owned rows are touched, and only where the value is still unset,
  // so an edit is never overwritten.
  await Promise.all(
    rows
      .filter((row) => row.is_system && (row.task || row.scope || row.speaker_source))
      .map((row) =>
        db
          .from("interaction_field_definitions")
          .update({ task: row.task, scope: row.scope, speaker_source: row.speaker_source })
          .eq("organization_id", organizationId)
          .eq("key", row.key)
          .eq("is_system", true)
          .is("task", null),
      ),
  );
}

/** The full library for the settings page, in display order. RLS-scoped. */
export async function listFieldLibrary(organizationId: string): Promise<FieldDefinition[]> {
  await ensureFieldLibrarySeeded(organizationId);
  const db = await createClient();
  const { data } = await db
    .from("interaction_field_definitions")
    .select(COLUMNS)
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: true });
  return (data ?? []).map(rowToDefinition);
}

/**
 * The enabled fields the extractor asks the model to produce.
 *
 * Disabled fields are left out — that is how disabling one switches its metric
 * off. Read with the service-role client because it runs inside the processing
 * pipeline, which has no authenticated user to satisfy RLS.
 */
export async function resolveExtractionFields(
  organizationId: string,
): Promise<ExtractionField[]> {
  await ensureFieldLibrarySeeded(organizationId);
  const db = createAdminClient();
  const { data } = await db
    .from("interaction_field_definitions")
    .select(COLUMNS)
    .eq("organization_id", organizationId)
    .eq("is_enabled", true)
    .order("sort_order", { ascending: true });
  return (data ?? []).map(rowToExtractionField);
}
