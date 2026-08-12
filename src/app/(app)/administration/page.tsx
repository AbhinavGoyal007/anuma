import { redirect } from "next/navigation";

import {
  setCategoryRole,
  createLocation,
  createOrganizationCheck,
  createTeam,
  seedStarterElectronicsChecks,
} from "@/app/(app)/administration/actions";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getApplicationContext } from "@/modules/identity/application-context";
import { roleLabel } from "@/modules/identity/roles";

type AdministrationPageProps = {
  searchParams: Promise<{ created?: string; error?: string }>;
};

export default async function AdministrationPage({ searchParams }: AdministrationPageProps) {
  const [context, message] = await Promise.all([getApplicationContext(), searchParams]);
  if (!context) redirect("/sign-in");
  if (!context.current) redirect("/setup");

  const { organization, membership, locations, teams } = context.current;
  const isAdmin = membership.role === "admin";
  const supabase = await createClient();
  const { data: categoryRoles } = await supabase
    .from("category_roles")
    .select("id,category,intended_role")
    .eq("organization_id", organization.id)
    .order("category");
  const { data: checks } = await supabase
    .from("check_definitions")
    .select(
      "id,name,description,purpose,applicability,evaluation_strategy,weight,active,is_starter",
    )
    .eq("organization_id", organization.id)
    .order("is_starter", { ascending: false })
    .order("created_at");

  return (
    <>
      <PageHeader eyebrow="Organization foundation" title="Administration" />
      {message.error ? (
        <p className="auth-message auth-message-error" role="alert">
          {message.error}
        </p>
      ) : null}
      {message.created ? (
        <p className="auth-message" role="status">
          Saved to {organization.name}.
        </p>
      ) : null}

      <section className="summary-grid" aria-label="Organization summary">
        <article className="summary-card summary-card-primary">
          <p className="eyebrow">Organization</p>
          <h2>{organization.name}</h2>
          <p>
            {organization.countryCode} · {organization.defaultCurrency} · {organization.timezone}
          </p>
        </article>
        <article className="summary-card">
          <p className="eyebrow">Your access</p>
          <h2>{roleLabel(membership.role)}</h2>
          <StatusBadge label="Active membership" tone="verified" />
        </article>
      </section>

      <div className="administration-grid">
        <section className="product-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Physical context</p>
              <h2>Locations</h2>
            </div>
            <span className="count-label">{locations.length}</span>
          </div>
          {locations.length ? (
            <ul className="record-list">
              {locations.map((location) => (
                <li key={location.id}>
                  <div>
                    <strong>{location.name}</strong>
                    <span>{location.locationType}</span>
                  </div>
                  <StatusBadge label="Active" />
                </li>
              ))}
            </ul>
          ) : (
            <p className="section-copy">No locations yet. Add the first store, showroom or site.</p>
          )}
          {isAdmin ? (
            <form action={createLocation} className="compact-form">
              <label className="form-field">
                <span>Name</span>
                <input name="name" required />
              </label>
              <label className="form-field">
                <span>Type</span>
                <select defaultValue="store" name="location_type">
                  <option value="store">Store</option>
                  <option value="showroom">Showroom</option>
                  <option value="office">Office</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="form-field">
                <span>Business code (optional)</span>
                <input name="business_code" />
              </label>
              <label className="form-field">
                <span>Timezone override (optional)</span>
                <input name="timezone" placeholder={organization.timezone} />
              </label>
              <button className="button button-secondary" type="submit">
                Add location
              </button>
            </form>
          ) : null}
        </section>

        <section className="product-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Frontline scope</p>
              <h2>Teams</h2>
            </div>
            <span className="count-label">{teams.length}</span>
          </div>
          {teams.length ? (
            <ul className="record-list">
              {teams.map((team) => (
                <li key={team.id}>
                  <div>
                    <strong>{team.name}</strong>
                    <span>Active team</span>
                  </div>
                  <StatusBadge label="Active" />
                </li>
              ))}
            </ul>
          ) : (
            <p className="section-copy">No teams yet. One level is enough for the MVP.</p>
          )}
          {isAdmin ? (
            <form action={createTeam} className="compact-form">
              <label className="form-field">
                <span>Team name</span>
                <input name="name" required />
              </label>
              <button className="button button-secondary" type="submit">
                Add team
              </button>
            </form>
          ) : null}
        </section>
      </div>

      <section className="product-panel administration-checks" aria-labelledby="checks-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Interaction review</p>
            <h2 id="checks-title">Checks</h2>
          </div>
          <span className="count-label">{checks?.length ?? 0}</span>
        </div>
        {checks?.length ? (
          <ul className="record-list check-configuration-list">
            {checks.map((check) => (
              <li key={check.id}>
                <div>
                  <strong>{check.name}</strong>
                  <span>{check.description}</span>
                  <small>
                    {check.purpose === "scorecard" ? "Included in scorecard" : "Monitor only"} ·{" "}
                    {check.applicability === "when_relevant"
                      ? "When relevant"
                      : "Every interaction"}
                    {check.weight ? ` · Weight ${check.weight}` : ""}
                  </small>
                </div>
                <StatusBadge label={check.active ? "Active" : "Inactive"} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="section-copy">
            <p>No review checks are configured yet.</p>
            {isAdmin ? (
              <form action={seedStarterElectronicsChecks}>
                <button className="button button-secondary" type="submit">
                  Add Starter Electronics checks
                </button>
              </form>
            ) : null}
          </div>
        )}
        {isAdmin ? (
          <form action={createOrganizationCheck} className="compact-form check-create-form">
            <p className="section-copy">
              Add a focused organization check. New checks are versioned and never rewrite past
              reviews.
            </p>
            <label className="form-field">
              <span>Check name</span>
              <input name="name" required />
            </label>
            <label className="form-field form-field-wide">
              <span>What should ANUMA look for?</span>
              <textarea name="description" required rows={3} />
            </label>
            <label className="form-field">
              <span>Purpose</span>
              <select defaultValue="monitor" name="purpose">
                <option value="monitor">Monitor only</option>
                <option value="scorecard">Include in scorecard</option>
              </select>
            </label>
            <label className="form-field">
              <span>Applicability</span>
              <select defaultValue="every_interaction" name="applicability">
                <option value="every_interaction">Every interaction</option>
                <option value="when_relevant">When relevant</option>
              </select>
            </label>
            <label className="form-field">
              <span>How to check</span>
              <select defaultValue="semantic" name="evaluation_strategy">
                <option value="semantic">Review the interaction</option>
                <option value="phrase">Match an exact phrase</option>
              </select>
            </label>
            <label className="form-field">
              <span>Exact phrase (only for phrase matching)</span>
              <input name="phrase" />
            </label>
            <label className="form-field">
              <span>Weight (only for scorecard checks)</span>
              <input min="0.01" name="weight" step="0.01" type="number" />
            </label>
            <button className="button button-primary form-field-wide" type="submit">
              Add check
            </button>
          </form>
        ) : null}
      </section>

      <section className="product-panel" aria-labelledby="category-roles-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Category strategy</p>
            <h2 id="category-roles-title">Category roles</h2>
          </div>
        </div>
        <p className="section-copy">
          What each category is <em>for</em> — a destination customers travel for, a routine repeat,
          a convenience pickup, or an occasional buy. Customer Intelligence measures how customers
          actually behave in each category and flags where the two disagree.
        </p>

        {categoryRoles?.length ? (
          <ul className="category-role-list">
            {categoryRoles.map((role) => (
              <li key={role.id}>
                <span className="category-role-name">{role.category}</span>
                <span className="behaviour-role">{role.intended_role}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="section-copy">
            No category roles set yet. Until one is, the dashboard reports observed behaviour
            without judging it against an intent.
          </p>
        )}

        {isAdmin ? (
          <form action={setCategoryRole} className="category-role-form">
            <label>
              <span>Category</span>
              <input name="category" placeholder="e.g. laptop" maxLength={80} required />
            </label>
            <label>
              <span>Role</span>
              <select name="intended_role" defaultValue="destination">
                <option value="destination">Destination</option>
                <option value="routine">Routine</option>
                <option value="convenience">Convenience</option>
                <option value="occasional">Occasional / seasonal</option>
              </select>
            </label>
            <button type="submit" className="button button-primary">
              Save role
            </button>
          </form>
        ) : null}
      </section>
    </>
  );
}
