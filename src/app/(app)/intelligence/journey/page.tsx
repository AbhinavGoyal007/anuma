import { redirect } from "next/navigation";

import { IntelligenceDrawer } from "@/components/intelligence/intelligence-drawer";
import { IntelligenceFilterBar, IntelligenceHead } from "@/components/intelligence/filter-bar";
import { JourneyView } from "@/components/intelligence/journey-view";
import { cohortPath, valueCohortKey } from "@/modules/intelligence/cohorts";
import {
  FILTER_PARAM_KEYS,
  intelligenceHref,
  single,
  windowLabel,
} from "@/modules/intelligence/filters";
import {
  interventions,
  journeyBreakdown,
  journeyDiagnosis,
  DIAGNOSIS_ROWS,
  journeyLeakageCohorts,
  journeyStages,
  outcomeDistributions,
  productPath,
  JOURNEY_COHORTS,
  selectCohort,
  type JourneyCohortKey,
} from "@/modules/intelligence/journey";

import { resolveIntelligencePage } from "@/modules/intelligence/page-context";
import { scopeFingerprint } from "@/modules/intelligence/canonical";
import { readFindingReviews } from "@/modules/intelligence/pilot-store";
import {
  reviewableCohortKeys,
  reviewFindingKey,
} from "@/modules/intelligence/reviewable";
import { IntelligencePageTracker } from "@/components/intelligence/telemetry";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const BASE = "/intelligence/journey";

export default async function CustomerJourneyPage({ searchParams }: PageProps) {
  const raw = await searchParams;
  const page = await resolveIntelligencePage(raw);
  if ("redirect" in page) redirect(page.redirect);

  const {
    organizationId,
    filters,
    current,
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

  const cohortKey: JourneyCohortKey =
    JOURNEY_COHORTS.find((key) => key === single(raw, "cohort")) ?? "high_intent";
  const cohort = selectCohort(current.rows, cohortKey);
  // Computed once and shared, so the count on a gap in the rail is the count of
  // interactions its link opens.
  const leakage = journeyLeakageCohorts(cohort);
  const storeName = new Map(stores.map((item) => [item.id, item.name]));

  // The breakdown dimension is the reader's choice. Switching it because one
  // had more rows moved the page under them between mornings.
  const dimension = single(raw, "dimension") === "categories" ? "categories" : "stores";

  const sizes = Object.fromEntries(
    JOURNEY_COHORTS.map((key) => [key, selectCohort(current.rows, key).length]),
  ) as Record<JourneyCohortKey, number>;

  const stages = journeyStages(cohort, leakage);
  // Page-local: which node's diagnosis is showing. Never carried to another
  // page, where it would mean nothing.
  const selectedStage =
    stages.find((stage) => stage.key === single(raw, "stage"))?.key ?? "entered";

  const openDrawer = single(raw, "drawer");
  // The same registry the save path uses, so a manager cannot answer a
  // finding the page never offered.
  const reviewableKeys = new Set(reviewableCohortKeys("journey", current.rows));
}
