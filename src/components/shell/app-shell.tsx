"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { applicationRoutes } from "@/modules/application/routes";
import { roleLabel, type MembershipRole } from "@/modules/identity/roles";
import { createClient } from "@/lib/supabase/client";

type ShellContext = {
  assignmentCount: number;
  currentOrganization: { id: string; name: string; role: MembershipRole };
  organizations: Array<{ id: string; name: string; role: MembershipRole }>;
  userEmail: string | null;
};

type AppShellProps = {
  children: ReactNode;
  context: ShellContext;
  switchOrganization: (formData: FormData) => Promise<void>;
};

export function AppShell({ children, context, switchOrganization }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentOrganization } = context;
  const navigationGroups = ["Interactions", "Intelligence", "Configure"] as const;
  const assignmentSummary =
    context.assignmentCount > 0
      ? `${context.assignmentCount} active scope assignment${context.assignmentCount === 1 ? "" : "s"}`
      : currentOrganization.role === "admin"
        ? "Organization-wide administration"
        : "No active location/team assignment";

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/sign-in");
    router.refresh();
  }

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link className="wordmark wordmark-inverse" href="/conversations">
          ANUMA
        </Link>
        <p className="sidebar-kicker">Frontline Interaction Intelligence</p>
        <nav aria-label="Primary navigation" className="primary-navigation">
          {navigationGroups.map((group) => (
            <div className="navigation-group" key={group}>
              <p>{group}</p>
              {applicationRoutes
                .filter((route) => route.group === group)
                .map((route) => {
                  const active = pathname === route.href;
                  return (
                    <Link
                      aria-current={active ? "page" : undefined}
                      className={active ? "nav-link nav-link-active" : "nav-link"}
                      href={route.href}
                      key={route.href}
                    >
                      {route.label}
                    </Link>
                  );
                })}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="context-dot" aria-hidden="true" />
          <span>
            <strong>{currentOrganization.name}</strong>
            <small>{roleLabel(currentOrganization.role)}</small>
          </span>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="context-label">{currentOrganization.name}</p>
            <p className="context-copy">
              {roleLabel(currentOrganization.role)} {"\u00b7"} {assignmentSummary}
            </p>
          </div>
          <details className="user-menu">
            <summary aria-label="Open user menu">
              {context.userEmail ?? "Authenticated user"}
            </summary>
            <div className="user-menu-panel">
              <p>{context.userEmail ?? "Authenticated user"}</p>
              {context.organizations.length > 1 ? (
                <form action={switchOrganization} className="organization-switcher">
                  <label htmlFor="organization_id">Organization</label>
                  <select
                    defaultValue={currentOrganization.id}
                    id="organization_id"
                    name="organization_id"
                  >
                    {context.organizations.map((organization) => (
                      <option key={organization.id} value={organization.id}>
                        {organization.name} {"\u00b7"} {roleLabel(organization.role)}
                      </option>
                    ))}
                  </select>
                  <button className="button button-secondary" type="submit">
                    Switch
                  </button>
                </form>
              ) : null}
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void signOut();
                }}
              >
                <button className="button button-quiet" type="submit">
                  Sign out
                </button>
              </form>
            </div>
          </details>
        </header>
        <nav aria-label="Primary navigation on small screens" className="mobile-navigation">
          {applicationRoutes.map((route) => {
            const active = pathname === route.href;
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={active ? "mobile-nav-link mobile-nav-link-active" : "mobile-nav-link"}
                href={route.href}
                key={route.href}
              >
                {route.label}
              </Link>
            );
          })}
        </nav>
        <div className="page-content">{children}</div>
      </main>
    </div>
  );
}
