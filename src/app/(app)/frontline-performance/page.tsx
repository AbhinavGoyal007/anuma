import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { getSalespeople } from "@/modules/frontline/data";
import { getApplicationContext } from "@/modules/identity/application-context";
import { roleLabel } from "@/modules/identity/roles";

type PageProps = { searchParams: Promise<{ store?: string }> };

/** "abhinav2002goyal@gmail.com" → "abhinav2002goyal": a readable handle from an email. */
function displayName(email: string | null): string {
  if (!email) return "Unknown rep";
  return email.split("@")[0] ?? email;
}

function pct(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

export default async function FrontlinePerformancePage({ searchParams }: PageProps) {
  const [context, params] = await Promise.all([getApplicationContext(), searchParams]);
  if (!context) redirect("/sign-in");
  if (!context.current) redirect("/setup");

  const { organization, membership, assignments, locations } = context.current;
  // Not in the primary navigation any more — Frontline Intelligence supersedes
  // it — but kept reachable because the per-salesperson roster and detail here
  // are still the only place that view exists. Its header is stated locally
  // rather than read from the route registry, which no longer lists it.
  const route = {
    eyebrow: "Frontline intelligence",
    title: "Salespeople",
  } as const;

  // A rep sees only their assigned stores; an admin sees them all — the same
  // scoping as the Customer Intelligence store filter.
  const assignedLocationIds = new Set(
    assignments.flatMap((item) => (item.locationId ? [item.locationId] : [])),
  );
  const stores =
    membership.role === "admin"
      ? locations
      : locations.filter((item) => assignedLocationIds.has(item.id));
  const selectedStore = stores.find((item) => item.id === params.store) ?? null;

  const salespeople = await getSalespeople(
    organization.id,
    selectedStore ? { locationId: selectedStore.id } : {},
  );

  const totalInteractions = salespeople.reduce((sum, rep) => sum + rep.interactions, 0);
  const storeQuery = selectedStore ? `?store=${selectedStore.id}` : "";
  const dateFormatter = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: organization.timezone,
  });

  return (
    <>
      <PageHeader
        eyebrow={route.eyebrow}
        title={selectedStore ? `${route.title} · ${selectedStore.name}` : route.title}
      />

      {stores.length > 0 ? (
        <nav className="store-filter" aria-label="Filter by store">
          <Link
            href="/frontline-performance"
            className={`store-chip${selectedStore ? "" : " store-chip--active"}`}
          >
            All stores
          </Link>
          {stores.map((store) => (
            <Link
              key={store.id}
              href={`/frontline-performance?store=${store.id}`}
              className={`store-chip${selectedStore?.id === store.id ? " store-chip--active" : ""}`}
            >
              {store.name}
            </Link>
          ))}
        </nav>
      ) : null}

      {salespeople.length === 0 ? (
        <div className="editorial-empty">
          <p className="eyebrow">No salespeople {selectedStore ? "here" : "yet"}</p>
          <h3>
            {selectedStore
              ? `No interactions attributed to a rep at ${selectedStore.name} yet.`
              : "Reps appear here once their conversations are processed."}
          </h3>
          <p>
            Every recorded interaction is attributed to the rep who had it. As those land, each
            salesperson shows up here with their history — and, next, how they sold.
          </p>
        </div>
      ) : (
        <>
          <dl className="pulse-strip">
            <div className="pulse-stat">
              <dt>Salespeople</dt>
              <dd>{salespeople.length}</dd>
            </div>
            <div className="pulse-stat">
              <dt>Interactions</dt>
              <dd>{totalInteractions}</dd>
            </div>
          </dl>

          <section className="conversation-section" aria-labelledby="roster-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Your authorized scope</p>
                <h2 id="roster-title">Salespeople</h2>
              </div>
            </div>

            <ol className="roster-list">
              {salespeople.map((rep) => (
                <li key={rep.membershipId}>
                  <a href={`/frontline-performance/${rep.membershipId}${storeQuery}`}>
                    <div className="roster-main">
                      <h3>{displayName(rep.email)}</h3>
                      <p>
                        <span className="roster-role">{roleLabel(rep.role)}</span>
                        {rep.email ? (
                          <>
                            {" "}
                            <span aria-hidden="true">·</span> {rep.email}
                          </>
                        ) : null}
                      </p>
                    </div>
                    <div className="roster-stats">
                      <span className="roster-count">
                        <strong>{rep.interactions}</strong> interaction
                        {rep.interactions === 1 ? "" : "s"}
                      </span>
                      {rep.lastActiveAt ? (
                        <span className="roster-last">
                          last {dateFormatter.format(new Date(rep.lastActiveAt))}
                        </span>
                      ) : null}
                    </div>
                    <dl className="roster-metrics">
                      <div>
                        <dt>Obj. coverage</dt>
                        <dd>{pct(rep.performance.objectionCoverage)}</dd>
                      </div>
                      <div>
                        <dt>Clarified need</dt>
                        <dd>
                          {rep.performance.clarityLift.measured > 0
                            ? `${rep.performance.clarityLift.improved}/${rep.performance.clarityLift.measured}`
                            : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt>Purchased</dt>
                        <dd className="roster-metric-won">{rep.performance.purchased}</dd>
                      </div>
                      <div>
                        <dt>SOP score</dt>
                        <dd>
                          {rep.performance.sopScore !== null
                            ? `${Math.round(rep.performance.sopScore)}%`
                            : "—"}
                        </dd>
                      </div>
                    </dl>
                  </a>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </>
  );
}
