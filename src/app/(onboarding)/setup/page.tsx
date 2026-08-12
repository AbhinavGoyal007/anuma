import { redirect } from "next/navigation";

import { setupOrganization } from "@/app/(onboarding)/setup/actions";
import { getApplicationContext } from "@/modules/identity/application-context";

type SetupPageProps = { searchParams: Promise<{ error?: string }> };

export default async function SetupPage({ searchParams }: SetupPageProps) {
  const [context, { error }] = await Promise.all([getApplicationContext(), searchParams]);
  if (!context) redirect("/sign-in");
  if (context.current) redirect("/conversations");

  return (
    <main className="setup-page">
      <section className="setup-card">
        <div>
          <p className="eyebrow">Create your workspace</p>
          <h1>Set up your ANUMA workspace</h1>
          <p className="section-copy">
            Set up the organization where your interactions, teams and intelligence will live.
          </p>
        </div>
        {error ? (
          <p className="auth-message auth-message-error" role="alert">
            {error}
          </p>
        ) : null}
        <form action={setupOrganization} className="product-form">
          <label className="form-field form-field-wide">
            <span>Organization name</span>
            <input autoComplete="organization" maxLength={120} name="name" required />
          </label>
          <label className="form-field">
            <span>Country</span>
            <select defaultValue="IN" name="country_code">
              <option value="IN">India (IN)</option>
              <option value="AE">United Arab Emirates (AE)</option>
              <option value="US">United States (US)</option>
            </select>
          </label>
          <label className="form-field">
            <span>Default currency</span>
            <select defaultValue="INR" name="default_currency">
              <option value="INR">Indian rupee (INR)</option>
              <option value="AED">UAE dirham (AED)</option>
              <option value="USD">US dollar (USD)</option>
            </select>
          </label>
          <label className="form-field form-field-wide">
            <span>Display timezone</span>
            <select defaultValue="Asia/Kolkata" name="timezone">
              <option value="Asia/Kolkata">Asia/Kolkata</option>
              <option value="Asia/Dubai">Asia/Dubai</option>
              <option value="UTC">UTC</option>
              <option value="America/New_York">America/New_York</option>
            </select>
          </label>
          <button className="button button-primary form-field-wide" type="submit">
            Create workspace
          </button>
        </form>
      </section>
    </main>
  );
}
