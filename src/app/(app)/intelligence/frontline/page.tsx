import { redirect } from "next/navigation";

import { IntelligenceDrawer } from "@/components/intelligence/intelligence-drawer";
import { IntelligenceFilterBar, IntelligenceHead } from "@/components/intelligence/filter-bar";
import {
  FrontlineIntelligenceView,
  STAGES,
  type StageKey,
} from "@/components/intelligence/frontline-intelligence-view";
import { cohortPath } from "@/modules/intelligence/cohorts";
import { statedText } from "@/modules/intelligence/effective";
import { distribution, rankedShare } from "@/modules/intelligence/demand";
import {
  FILTER_PARAM_KEYS,
  intelligenceHref,
  single,
  windowLabel,
} from "@/modules/intelligence/filters";
import {
  computeFrontline,
  expandDetail,
  nextActions,
  offerDetail,
  outcomeAssociations,
  questionResponseComposition,
  responseCompositions,
} from "@/modules/intelligence/frontline";
import { frontlinePriorityReviews } from "@/modules/intelligence/overview";
import { resolveIntelligencePage } from "@/modules/intelligence/page-context";
import { scopeFingerprint } from "@/modules/intelligence/canonical";
import { readFindingReviews } from "@/modules/intelligence/pilot-store";
import {
  reviewableCohortKeys,
  reviewFindingKey,
} from "@/modules/intelligence/reviewable";
import { TelemetryScope } from "@/components/intelligence/telemetry";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const BASE = "/intelligence/frontline";

export default async function FrontlineIntelligencePage({ searchParams }: PageProps) {
  const raw = await searchParams;
  const page = await resolveIntelligencePage(raw);
  if ("redirect" in page) redirect(page.redirect);

  const {
    organizationId,
    filters,
    current,
    previous,
    stores,
    representatives,
    categories,
    intents,
    languages,
    storeCount,
    directoryError,
    storeUnavailable,
    representativeUnnamed,
    selectedStoreName,
  } = page;
  const rows = current.rows;

  const stage: StageKey =
    STAGES.find((item) => item.key === single(raw, "stage"))?.key ?? "understand";
  const openDrawer = single(raw, "drawer");
  // The same registry the save path uses, so a manager cannot answer a
  // finding the page never offered.
  const reviewableKeys = new Set(reviewableCohortKeys("frontline", rows));
  // What the reader actually narrowed to, carried with every pilot event so a
  // finding can be traced back to the population it was read from.
  const activeFilters = Object.fromEntries(
    FILTER_PARAM_KEYS.flatMap((key) => {
      const chosen = single(raw, key);
      return chosen ? [[key, chosen] as const] : [];
    }),
  );
  const scope = scopeFingerprint({
    from: page.periods.current.from,
    to: page.periods.current.to,
    filters: Object.fromEntries(FILTER_PARAM_KEYS.map((key) => [key, single(raw, key)])),
  });
  const reviews =
    openDrawer && reviewableKeys.has(openDrawer)
      ? await readFindingReviews(organizationId, page.membershipId, scope)
      : new Map();
  const carry = { stage };

  const compositions = responseCompositions(rows);

  return (
    <TelemetryScope
      page="frontline"
      scopeFingerprint={scope}
      filters={activeFilters}
      drawerKey={openDrawer}
    >
      <IntelligenceHead title="Frontline" />
      <IntelligenceFilterBar
        basePath={BASE}
        filters={filters}
        stores={stores}
        categories={categories}
        representatives={representatives}
        intents={intents}
        languages={languages}
        interactions={rows.length}
        storeCount={storeCount}
        coverage={current.coverage}
        directoryError={directoryError}
        storeUnavailable={storeUnavailable}
        representativeUnnamed={representativeUnnamed}
        carry={carry}
      />
      <FrontlineIntelligenceView
        metrics={computeFrontline(rows)}
        previousMetrics={previous ? computeFrontline(previous.rows) : null}
        actions={frontlinePriorityReviews(rows)}
        actionHref={(cohortKey) => intelligenceHref(BASE, filters, { ...carry, drawer: cohortKey })}
        stage={stage}
        stageHref={(key) => intelligenceHref(BASE, filters, { ...carry, stage: key, drawer: null })}
        detail={{
          questions: rankedShare(rows, ["customer_questions"], 40),
          questionComposition: questionResponseComposition(rows),
          recommended: rankedShare(rows, ["products_recommended"], 40),
          reasons: rankedShare(rows, ["recommendation_reasons"], 40),
          recommendationResponse: distribution(
            rows,
            (row) => statedText(row.values, "recommendation_response")[0] ?? null,
            "recommendation_response",
          ),
          objection: compositions.objection,
          finance: compositions.finance,
          offer: offerDetail(rows, 40),
          expand: expandDetail(rows, 40),
          commitment: rankedShare(rows, ["customer_commitment_signals"], 40),
          closes: rankedShare(rows, ["close_attempts"], 40),
          nextAction: nextActions(rows, 40),
        }}
        associations={outcomeAssociations(rows)}
        analysed={rows.length}
        withoutMetrics={current.withoutMetrics}
      />
      {openDrawer ? (
        <IntelligenceDrawer
          organizationId={organizationId}
          rows={rows}
          cohortKey={openDrawer}
          journeyCohort="all"
          scopeChips={[
            windowLabel(filters.days),
            selectedStoreName ?? `${storeCount} store${storeCount === 1 ? "" : "s"}`,
            filters.category ?? "All categories",
          ]}
          closeHref={intelligenceHref(BASE, filters, { ...carry, drawer: null })}
          fullHref={intelligenceHref(cohortPath(openDrawer), filters)}
          review={
            reviewableKeys.has(openDrawer)
              ? {
                  page: "frontline",
                  filters: activeFilters,
                  returnPath: BASE,
                  existing:
                    reviews.get(reviewFindingKey("frontline", openDrawer)) ?? null,
                }
              : null
          }
        />
      ) : null}
    </TelemetryScope>
  );
}
