import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { getRepProfile } from "@/modules/frontline/data";
import { getApplicationContext } from "@/modules/identity/application-context";
import { roleLabel } from "@/modules/identity/roles";

type PageProps = {
  params: Promise<{ membershipId: string }>;
  searchParams: Promise<{ store?: string }>;
};

/** Outcome label + badge tone, mirroring the conversations list. */
const OUTCOME: Record<string, { label: string; tone: string }> = {
  purchased: { label: "Purchased", tone: "outcome--won" },
  follow_up_scheduled: { label: "Follow-up", tone: "outcome--open" },
  researching: { label: "Researching", tone: "outcome--open" },
  deferred: { label: "Deferred", tone: "outcome--cool" },
  rejected: { label: "No sale", tone: "outcome--lost" },
};

function displayName(email: string | null): string {
  if (!email) return "Unknown rep";
  return email.split("@")[0] ?? email;
}

function pct(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

export default async function RepProfilePage({ params, searchParams }: PageProps) {
  const [context, { membershipId }, query] = await Promise.all([
    getApplicationContext(),
    params,
    searchParams,
  ]);
  if (!context) redirect("/sign-in");
  if (!context.current) redirect("/setup");

  const { organization, membership, assignments, locations } = context.current;

  // A representative may only ever open their own page; managers and admins see
  // anyone within their RLS scope. The data layer is already scoped, but this
  // keeps a rep from even loading a colleague's name and an empty history.
  if (membership.role === "representative" && membership.id !== membershipId) {
    redirect("/frontline-performance");
  }

  // The store filter carries over from the roster; only a store the viewer may
  // see counts, otherwise the whole (scoped) history is shown.
  const assignedLocationIds = new Set(
    assignments.flatMap((item) => (item.locationId ? [item.locationId] : [])),
  );
  const stores =
    membership.role === "admin"
      ? locations
      : locations.filter((item) => assignedLocationIds.has(item.id));
  const selectedStore = stores.find((item) => item.id === query.store) ?? null;

  const profile = await getRepProfile(
    organization.id,
    membershipId,
    selectedStore ? { locationId: selectedStore.id } : {},
  );
  if (!profile) notFound();

  const purchased = profile.interactions.filter((i) => i.outcome === "purchased").length;
  const dateFormatter = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: organization.timezone,
  });
  const timeFormatter = new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: organization.timezone,
  });

  const storeQuery = selectedStore ? `?store=${selectedStore.id}` : "";

  return (
    <>
      <Link href={`/frontline-performance${storeQuery}`} className="back-link">
        ← All salespeople{selectedStore ? ` · ${selectedStore.name}` : ""}
      </Link>
      <PageHeader eyebrow="Salesperson" title={displayName(profile.email)} />

      <dl className="pulse-strip">
        <div className="pulse-stat">
          <dt>Role</dt>
          <dd className="pulse-role">{roleLabel(profile.role)}</dd>
        </div>
        <div className="pulse-stat">
          <dt>Interactions</dt>
          <dd>{profile.interactions.length}</dd>
        </div>
        <div className="pulse-stat">
          <dt>Purchased</dt>
          <dd className="pulse-won">{purchased}</dd>
        </div>
      </dl>

      <section className="conversation-section" aria-labelledby="rep-performance-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">How they sold{selectedStore ? ` · ${selectedStore.name}` : ""}</p>
            <h2 id="rep-performance-title">Execution</h2>
          </div>
          <span className="record-count">{profile.performance.measured} measured</span>
        </div>

        {profile.performance.measured === 0 ? (
          <p className="field-empty">
            No processed interactions with metrics yet — these fill in as records are built.
          </p>
        ) : (
          <>
            <dl className="rep-perf-grid">
              <div>
                <dt>Objection coverage</dt>
                <dd>{pct(profile.performance.objectionCoverage)}</dd>
              </div>
              <div>
                <dt>Clarified need</dt>
                <dd>
                  {profile.performance.clarityLift.measured > 0
                    ? `${profile.performance.clarityLift.improved}/${profile.performance.clarityLift.measured}`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>Alternative offered</dt>
                <dd>{pct(profile.performance.alternativeOfferRate)}</dd>
              </div>
              <div>
                <dt>Product demoed</dt>
                <dd>{pct(profile.performance.demoRate)}</dd>
              </div>
              <div>
                <dt>Cross-sell offered</dt>
                <dd>{pct(profile.performance.crossSellRate)}</dd>
              </div>
              <div>
                <dt>Flagged for review</dt>
                <dd>{pct(profile.performance.redFlagRate)}</dd>
              </div>
              <div>
                <dt>Finance interest</dt>
                <dd>{profile.performance.financeInterest}</dd>
              </div>
              <div>
                <dt>SOP score</dt>
                <dd>
                  {profile.performance.sopScore !== null
                    ? `${Math.round(profile.performance.sopScore)}%`
                    : "—"}
                </dd>
              </div>
            </dl>

            {profile.performance.outcomes.length ? (
              <div className="rep-outcomes">
                {profile.performance.outcomes.map((outcome) => (
                  <span key={outcome.key} className="rep-outcome-chip">
                    {outcome.key.replaceAll("_", " ")} <strong>{outcome.count}</strong>
                  </span>
                ))}
              </div>
            ) : null}
          </>
        )}
      </section>

      <section className="conversation-section" aria-labelledby="rep-history-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              Interaction history{selectedStore ? ` · ${selectedStore.name}` : ""}
            </p>
            <h2 id="rep-history-title">Every interaction, most recent first</h2>
          </div>
        </div>

        {profile.interactions.length === 0 ? (
          <p className="field-empty">No interactions attributed to this rep in your scope yet.</p>
        ) : (
          <ol className="interaction-list">
            {profile.interactions.map((interaction) => {
              const badge = interaction.outcome ? OUTCOME[interaction.outcome] : null;
              return (
                <li key={interaction.id}>
                  <time dateTime={interaction.startedAt}>
                    <strong>{timeFormatter.format(new Date(interaction.startedAt))}</strong>
                    <span>{dateFormatter.format(new Date(interaction.startedAt))}</span>
                  </time>
                  <div className="interaction-main">
                    <h3>
                      <a href={`/conversations/${interaction.id}`}>
                        {interaction.title ?? "Untitled interaction"}
                      </a>
                    </h3>
                    <p>{interaction.vertical}</p>
                  </div>
                  <div className="interaction-status">
                    {badge ? (
                      <span className={`outcome-badge ${badge.tone}`}>{badge.label}</span>
                    ) : (
                      <span className="status-badge status-badge-neutral">
                        {interaction.lifecycleStatus.replaceAll("_", " ")}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </>
  );
}
