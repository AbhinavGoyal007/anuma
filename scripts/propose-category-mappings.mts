/**
 * Queueing category labels for confirmation.
 *
 * Runs the same functions the administration screen's "Check for new labels"
 * button runs. It exists as a script because the first run for an organization
 * happens right after a catalogue load, before anyone has opened the screen —
 * and because embedding a few hundred labels takes longer than a server action
 * comfortably holds a request open.
 *
 * Proposes only. Nothing here confirms anything, and no rollup in the product
 * reads a proposal.
 *
 * Usage:
 *   node --env-file=.env.local --experimental-strip-types \
 *     --conditions=react-server --import ./scripts/register-alias.mjs \
 *     scripts/propose-category-mappings.mts --org "AG LLC"
 */

import { parseArgs } from "node:util";

import postgres from "postgres";

import {
  proposeCategoryMappings,
  proposeSpokenCategoryMappings,
} from "@/modules/catalogue/category-mapping";

const { values } = parseArgs({
  options: { org: { type: "string" }, repropose: { type: "boolean", default: false } },
});
if (!values.org) {
  console.error('Usage: --org "<organization name>" [--repropose]');
  process.exit(1);
}

const databaseUrl = process.env.SUPABASE_DB_URL;
if (!databaseUrl) {
  console.error("SUPABASE_DB_URL is not set. Run with --env-file=.env.local");
  process.exit(1);
}

const sql = postgres(databaseUrl, { prepare: false, max: 1, connect_timeout: 30 });
let organizationId: string;
try {
  const [organization] = await sql<{ id: string }[]>`
    select id from organizations where name = ${values.org} order by created_at limit 1
  `;
  if (!organization) throw new Error(`No organization named ${values.org}.`);
  organizationId = organization.id;

  // Re-proposing discards suggestions nobody has acted on so the ontology's
  // current wording is used. Anything confirmed or marked not relevant is a
  // person's decision and is never touched.
  if (values.repropose) {
    const labels = await sql`
      delete from category_mappings
      where organization_id = ${organizationId} and status = 'proposed'
    `;
    const phrases = await sql`
      delete from spoken_category_mappings
      where organization_id = ${organizationId} and status = 'proposed'
    `;
    console.log(
      `Cleared ${labels.count} undecided label proposals and ${phrases.count} phrase proposals.`,
    );
  }
} finally {
  await sql.end();
}

const startedAt = Date.now();
const labels = await proposeCategoryMappings(organizationId);
console.log(
  `Catalogue labels: ${labels.labelsSeen} seen, ${labels.proposed} newly queued, ${labels.alreadyMapped} already decided.`,
);

const phrases = await proposeSpokenCategoryMappings(organizationId);
console.log(
  `Spoken categories: ${phrases.labelsSeen} seen, ${phrases.proposed} newly queued, ${phrases.alreadyMapped} already decided.`,
);
console.log(`Done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s.`);
