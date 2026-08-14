/**
 * Discovering what a retailer's products vary by, with nobody asked.
 *
 * Runs the whole loop for each node of the retailer's own taxonomy: sample the
 * descriptions, ask once what these products vary by, read every product in the
 * node with the answer, then judge the answer by what it actually read. An
 * attribute that describes the products is stored active; one that does not is
 * stored rejected with its reason, so a bad discovery can be read afterwards
 * rather than guessed at.
 *
 * The judging is the part that replaces a person. Nobody here knows what
 * capacities washing machines come in, but a dimension read correctly occupies
 * a band and a model number read by mistake does not, and that holds whether the
 * catalogue is appliances, mattresses or jewellery.
 *
 * Safe to re-run: nodes already decided are skipped unless --redo is passed.
 *
 * Usage:
 *   node --env-file=.env.local --experimental-strip-types --conditions=react-server \
 *     --import ./scripts/register-alias.mjs \
 *     scripts/discover-attributes.mts --org "AG LLC" [--nodes 20] [--match washing] [--redo]
 */

import { parseArgs } from "node:util";

import postgres from "postgres";

import { proposeAttributes } from "@/modules/catalogue/attribute-discovery";
import { extractAttributes } from "@/modules/catalogue/attribute-extract";
import { judgeAttribute } from "@/modules/catalogue/attribute-plausibility";
import {
  ATTRIBUTE_EXTRACTOR_VERSION,
  isUsableDefinition,
  type AttributeDefinition,
} from "@/modules/catalogue/attribute-schema";

const { values } = parseArgs({
  options: {
    org: { type: "string", default: "AG LLC" },
    nodes: { type: "string" },
    match: { type: "string" },
    redo: { type: "boolean", default: false },
  },
});

/**
 * How many descriptions the model is shown per node.
 *
 * Enough to see the convention and the spellings it varies in; not so many that
 * the call is dominated by repetition of the same three shapes.
 */
const SAMPLE_SIZE = 40;

/**
 * The smallest node worth discovering attributes for.
 *
 * Sized to the judge's own floor rather than to a comfortable catalogue. A
 * motorcycle dealer's entire range is fourteen models across four groups, and a
 * threshold set for electronics skipped every one of them while happily
 * describing their helmets — so the nodes that carry the business were the exact
 * ones excluded.
 */
const MINIMUM_NODE_SIZE = 8;

const sql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false, max: 4 });

try {
  const [organization] = await sql<{ id: string }[]>`
    select id from organizations where name = ${values.org!} order by created_at limit 1
  `;
  if (!organization) throw new Error(`No organization named ${values.org}.`);

  const nodes = await sql<{ node_key: string; item_count: number }[]>`
    select
      concat_ws(' > ', dept_name, group_name, subgroup_name) as node_key,
      count(*)::int as item_count
    from public.catalogue_items
    where organization_id = ${organization.id} and valid_to is null
    group by 1
    having count(*) >= ${MINIMUM_NODE_SIZE}
    order by count(*) desc
  `;

  const decided = values.redo
    ? new Set<string>()
    : new Set(
        (
          await sql<{ node_key: string }[]>`
            select distinct node_key from public.category_attributes
            where organization_id = ${organization.id}
          `
        ).map((row) => row.node_key),
      );

  const selected = nodes
    .filter((node) => !decided.has(node.node_key))
    .filter((node) =>
      values.match ? node.node_key.toLowerCase().includes(values.match.toLowerCase()) : true,
    )
    .slice(0, values.nodes ? Number(values.nodes) : nodes.length);

  console.log(
    `${nodes.length} nodes at or above ${MINIMUM_NODE_SIZE} items; ${selected.length} to discover.\n`,
  );

  let active = 0;
  let rejected = 0;
  let valuesWritten = 0;

  for (const node of selected) {
    const items = await sql<{ item_id: string; description: string }[]>`
      select item_id, description from public.catalogue_items
      where organization_id = ${organization.id} and valid_to is null
        and concat_ws(' > ', dept_name, group_name, subgroup_name) = ${node.node_key}
    `;
    // Spread the sample across the node rather than taking the first rows, which
    // in an export sorted by item id are the same product family repeated.
    const step = Math.max(1, Math.floor(items.length / SAMPLE_SIZE));
    const sample = items.filter((_, index) => index % step === 0).slice(0, SAMPLE_SIZE);

    let proposed: AttributeDefinition[];
    try {
      proposed = await proposeAttributes({
        nodeKey: node.node_key,
        descriptions: sample.map((item) => item.description),
      });
    } catch (error) {
      console.log(`  ${node.node_key.slice(0, 52).padEnd(54)} proposal failed: ${String(error).slice(0, 60)}`);
      continue;
    }

    const usable = proposed.filter(isUsableDefinition);
    const readings = items.map((item) => ({
      itemId: item.item_id,
      attributes: extractAttributes(item.description, usable),
    }));
    const flat = readings.flatMap((reading) => reading.attributes);

    const verdicts = usable.map((definition) => ({
      definition,
      verdict: judgeAttribute(definition, flat, items.length),
    }));

    for (const { definition, verdict } of verdicts) {
      await sql`
        insert into public.category_attributes (
          organization_id, node_key, attribute_key, kind, comparison,
          unit_tokens, unit, range_min, range_max, vocabulary,
          status, rejection_reason, coverage, spread, distinct_values,
          extractor_version, judged_at
        ) values (
          ${organization.id}, ${node.node_key}, ${definition.key}, ${definition.kind},
          ${definition.comparison}, ${definition.unitTokens}, ${definition.unit},
          ${definition.range?.min ?? null}, ${definition.range?.max ?? null},
          ${sql.json(definition.vocabulary)},
          ${verdict.usable ? "active" : "rejected"},
          ${verdict.usable ? null : verdict.reason},
          ${verdict.coverage}, ${Number.isFinite(verdict.spread) ? verdict.spread : null},
          ${verdict.distinctValues}, ${ATTRIBUTE_EXTRACTOR_VERSION}, now()
        )
        on conflict (organization_id, node_key, attribute_key) do update set
          status = excluded.status, rejection_reason = excluded.rejection_reason,
          coverage = excluded.coverage, spread = excluded.spread,
          distinct_values = excluded.distinct_values, judged_at = now()
      `;
      if (verdict.usable) active += 1;
      else rejected += 1;
    }

    // Only readings of attributes that survived judging are stored. An attribute
    // the checks could not settle leaves no data behind, which is the whole
    // point: the product says "we could not tell" rather than something wrong.
    const keep = new Set(verdicts.filter((v) => v.verdict.usable).map((v) => v.definition.key));
    const rows = readings.flatMap((reading) =>
      reading.attributes
        .filter((attribute) => keep.has(attribute.key))
        .map((attribute) => ({
          organization_id: organization.id,
          item_id: reading.itemId,
          attribute_key: attribute.key,
          value_text: attribute.valueText,
          value_numeric: attribute.valueNumeric,
          unit: attribute.unit,
          extractor_version: ATTRIBUTE_EXTRACTOR_VERSION,
        })),
    );
    for (let index = 0; index < rows.length; index += 2000) {
      const chunk = rows.slice(index, index + 2000);
      await sql`
        insert into public.catalogue_item_attributes ${sql(chunk)}
        on conflict (organization_id, item_id, attribute_key) do update set
          value_text = excluded.value_text, value_numeric = excluded.value_numeric,
          unit = excluded.unit, extractor_version = excluded.extractor_version,
          extracted_at = now()
      `;
    }
    valuesWritten += rows.length;

    const summary = verdicts
      .map((v) => `${v.definition.key}${v.verdict.usable ? "" : `(${v.verdict.reason})`}`)
      .join(" ");
    console.log(
      `  ${node.node_key.slice(0, 52).padEnd(54)} ${String(items.length).padStart(6)} items  ${summary || "nothing proposed"}`,
    );
  }

  console.log(
    `\n${active} attribute(s) active, ${rejected} rejected, ${valuesWritten.toLocaleString()} values stored.`,
  );
} finally {
  await sql.end();
}
