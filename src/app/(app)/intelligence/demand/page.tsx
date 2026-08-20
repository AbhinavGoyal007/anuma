import { redirect } from "next/navigation";

import {
  DemandView,
  NEED_FIELD_KEYS,
  NEED_TABS,
  VOICE_TABS,
  type VoicePanel,
} from "@/components/intelligence/demand-view";
import { IntelligenceFilterBar, IntelligenceHead } from "@/components/intelligence/filter-bar";
import {
  budgetPicture,
  clarityMatrix,
  computeDemand,
  contextPrices,
  distribution,
  nonConversionReasons,
  originStrip,
  partySizeDistribution,
  rankedShare,
} from "@/modules/intelligence/demand";
import { valueCohortKey } from "@/modules/intelligence/cohorts";
import { intelligenceHref, single } from "@/modules/intelligence/filters";
import { isUnresolved } from "@/modules/intelligence/outcome";
import { IntelligenceDrawer } from "@/components/intelligence/intelligence-drawer";
import { cohortPath } from "@/modules/intelligence/cohorts";
import { windowLabel } from "@/modules/intelligence/filters";
import { resolveIntelligencePage } from "@/modules/intelligence/page-context";
import type { PopulationRow } from "@/modules/intelligence/population";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const BASE = "/intelligence/demand";

function voicePanels(tab: string, rows: readonly PopulationRow[]): VoicePanel[] {
  const list = (fieldKeys: string[]) => rankedShare(rows, fieldKeys, 40);
  const unit = (label: string) => `of ${rows.length} interactions · ${label}`;

  switch (tab) {
    case "competitors":
      return [
        {
          key: "competitor_named",
          title: "Competitors named",
          list: list(["competitor_named"]),
          unit: unit("named by the customer"),
          controlled: false,
          fieldKey: "competitor_named",
        },
        {
          key: "competitor_product",
          title: "Competitor products",
          list: list(["competitor_product"]),
          unit: unit("as described"),
          controlled: false,
          fieldKey: "competitor_product",
        },
        {
          key: "competitor_price_claim",
          title: "Customer-stated competitor price",
          list: list(["competitor_price_claim"]),
          unit: unit("claimed, never verified"),
          controlled: false,
          fieldKey: "competitor_price_claim",
        },
      ];
    case "stock":
      return [
        {
          key: "stock_status",
          title: "Stock status",
          list: list(["stock_status"]),
          unit: unit("as recorded"),
          controlled: true,
          fieldKey: "stock_status",
        },
        {
          key: "promotion_discussed",
          title: "Promotions discussed",
          list: list(["promotion_discussed"]),
          unit: unit("as recorded"),
          controlled: false,
          fieldKey: "promotion_discussed",
        },
        {
          key: "finance_requested",
          title: "Finance raised",
          list: list(["finance_requested"]),
          unit: unit("as recorded"),
          controlled: true,
          fieldKey: "finance_requested",
        },
      ];
    case "questions":
      return [
        {
          key: "customer_questions",
          title: "Question topics",
          list: list(["customer_questions"]),
          unit: unit("asked"),
          controlled: false,
          fieldKey: "customer_questions",
        },
        {
          key: "question_response_status",
          title: "Response status",
          list: list(["question_response_status"]),
          unit: unit("recorded against a question"),
          controlled: true,
          fieldKey: "question_response_status",
        },
      ];
    case "objections":
      return [
        {
          key: "objections",
          title: "Objections raised",
          list: list(["objections"]),
          unit: unit("raised by the customer"),
          controlled: false,
          fieldKey: "objections",
        },
      ];
    case "conditions":
      return [
        {
          key: "customer_purchase_conditions",
          title: "What customers said would close it",
          // Only from interactions that did not close: a customer who bought had
          // no condition left to state.
          list: rankedShare(
            rows.filter((row) => isUnresolved(row.outcome)),
            ["customer_purchase_conditions"],
            40,
          ),
          unit: "of unresolved interactions · stated explicitly, not our guess",
          controlled: false,
        },
      ];
    default:
      return [
        {
          key: "language_mix",
          title: "Language",
          list: list(["language_mix"]),
          unit: unit("as spoken"),
          controlled: false,
          fieldKey: "language_mix",
        },
        {
          key: "customer_party_size",
          title: "Party size",
          list: partySizeDistribution(rows),
          unit: unit("with a readable party size"),
          controlled: false,
          fieldKey: "customer_party_size",
        },
        {
          key: "purchase_timing",
          title: "Purchase timing",
          list: list(["purchase_timing"]),
          unit: unit("as stated"),
          controlled: true,
          fieldKey: "purchase_timing",
        },
      ];
  }
}

export default async function CustomerDemandPage({ searchParams }: PageProps) {
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
    selectedStoreName,
    directoryError,
  } = page;
  const rows = current.rows;

  // Which panel is showing, and whether it is expanded. Both live in the URL
  // like every other selection here, so a narrowed view stays shareable and the
  // control works without JavaScript.
  const need = NEED_TABS.find((tab) => tab.key === single(raw, "need"))?.key ?? "use_cases";
  const voiceTab = VOICE_TABS.find((tab) => tab.key === single(raw, "voice"))?.key ?? "context";
  const expanded = single(raw, "all") === "1";
  const allCategories = single(raw, "cats") === "1";
  // Expanding has to mean everything, or "Show all 10" is a promise the page
  // does not keep when the underlying list is longer than ten.
  const listLimit = expanded ? Number.MAX_SAFE_INTEGER : 40;
  const openDrawer = single(raw, "drawer");
  const carry: Record<string, string> = {
    need,
    voice: voiceTab,
    ...(expanded ? { all: "1" } : {}),
    ...(allCategories ? { cats: "1" } : {}),
  };

  return (
    <>
      <IntelligenceHead title="Demand" />
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
        directoryError={directoryError}
        carry={carry}
      />
      <DemandView
        metrics={computeDemand(rows)}
        previous={previous ? computeDemand(previous.rows) : null}
        budget={budgetPicture(rows)}
        prices={contextPrices(rows)}
        clarity={clarityMatrix(rows)}
        origins={originStrip(rows)}
        categories={distribution(rows, (row) => row.purchaseCategory)}
        categoryExpandHref={
          allCategories ? null : intelligenceHref(BASE, filters, { ...carry, cats: "1" })
        }
        intents={distribution(rows, (row) => row.arrivalIntent)}
        // Every panel, computed from rows already in memory. Switching a tab
        // then costs nothing and never blanks the page.
        needs={Object.fromEntries(
          NEED_TABS.map((tab) => [
            tab.key,
            rankedShare(rows, NEED_FIELD_KEYS[tab.key]!, listLimit),
          ]),
        )}
        need={need}
        needHref={(key) => intelligenceHref(BASE, filters, { ...carry, need: key, all: null })}
        expandHref={expanded ? null : intelligenceHref(BASE, filters, { ...carry, all: "1" })}
        voice={Object.fromEntries(VOICE_TABS.map((tab) => [tab.key, voicePanels(tab.key, rows)]))}
        voiceTab={voiceTab}
        voiceHref={(key) => intelligenceHref(BASE, filters, { ...carry, voice: key })}
        blockers={nonConversionReasons(rows)}
        categoryHref={(value) => intelligenceHref(BASE, { ...filters, category: value }, carry)}
        intentHref={(value) => intelligenceHref(BASE, { ...filters, intent: value }, carry)}
        evidenceHref={(fieldKey, value) =>
          intelligenceHref(BASE, filters, { ...carry, drawer: valueCohortKey(fieldKey, value) })
        }
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
        />
      ) : null}
    </>
  );
}
