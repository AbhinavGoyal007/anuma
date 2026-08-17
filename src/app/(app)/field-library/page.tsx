import { redirect } from "next/navigation";

import {
  createCustomField,
  deleteCustomField,
  toggleFieldEnabled,
  updateFieldDefinition,
} from "@/app/(app)/field-library/actions";
import { PageHeader } from "@/components/ui/page-header";
import { listFieldLibrary } from "@/modules/field-library/repository";
import type { FieldDefinition } from "@/modules/field-library/mapping";
import { getApplicationContext } from "@/modules/identity/application-context";

type PageProps = { searchParams: Promise<{ saved?: string; error?: string }> };

const SAVED_MESSAGE: Record<string, string> = {
  field: "Field updated.",
  enabled: "Field switched on.",
  disabled: "Field switched off.",
  created: "Custom tag added.",
  removed: "Custom tag removed.",
};

/** The provenance of a field's value, in plain words for a business reader. */
const SOURCE_LABEL: Record<string, string> = {
  verified: "From a system",
  evidence_extracted: "Heard in the conversation",
  evaluated: "Judged from the conversation",
  inferred: "Inferred across facts",
};

function FieldCard({ field, isAdmin }: { field: FieldDefinition; isAdmin: boolean }) {
  return (
    <article className={`field-card${field.isEnabled ? "" : " field-card--off"}`}>
      <div className="field-card-head">
        <div className="field-card-title">
          <h3>{field.label}</h3>
          <code className="field-key">{field.key}</code>
        </div>
        <div className="field-badges">
          {!field.isEnabled ? <span className="field-badge field-badge--off">Off</span> : null}
          <span className="field-badge">{field.isSystem ? "Standard" : "Custom"}</span>
          <span className="field-badge field-badge--muted">
            {SOURCE_LABEL[field.sourceClass] ?? field.sourceClass}
          </span>
        </div>
      </div>

      <p className="field-def">{field.definition}</p>

      {isAdmin ? (
        <div className="field-actions">
          <details className="field-edit">
            <summary>Edit</summary>
            <form action={updateFieldDefinition} className="field-edit-form">
              <input type="hidden" name="id" value={field.id} />
              <label>
                <span>Display name</span>
                <input name="label" defaultValue={field.label} maxLength={80} required />
              </label>
              <label>
                <span>Definition — the exact instruction the model is given</span>
                <textarea
                  name="definition"
                  defaultValue={field.definition}
                  maxLength={1200}
                  rows={4}
                  required
                />
              </label>
              <button type="submit" className="button button-primary">
                Save changes
              </button>
            </form>
          </details>

          <form action={toggleFieldEnabled} className="field-toggle">
            <input type="hidden" name="id" value={field.id} />
            <input type="hidden" name="enabled" value={field.isEnabled ? "false" : "true"} />
            <button type="submit" className="button button-secondary">
              {field.isEnabled ? "Switch off" : "Switch on"}
            </button>
            {field.isSystem && field.isEnabled ? (
              <span className="field-toggle-note">
                A standard field — switching it off stops the dashboard measure that uses it.
              </span>
            ) : null}
          </form>

          {field.isSystem ? null : (
            <form action={deleteCustomField} className="field-delete">
              <input type="hidden" name="id" value={field.id} />
              <button type="submit" className="button button-danger">
                Delete
              </button>
            </form>
          )}
        </div>
      ) : null}
    </article>
  );
}

export default async function FieldLibraryPage({ searchParams }: PageProps) {
  const [context, params] = await Promise.all([getApplicationContext(), searchParams]);
  if (!context) redirect("/sign-in");
  if (!context.current) redirect("/setup");

  const { organization, membership } = context.current;
  const isAdmin = membership.role === "admin";
  const fields = await listFieldLibrary(organization.id);

  const custom = fields.filter((field) => !field.isSystem);
  const standard = fields.filter((field) => field.isSystem);
  const enabledCount = fields.filter((field) => field.isEnabled).length;

  return (
    <>
      <PageHeader eyebrow="Extraction fields" title="Field Library" />

      {params.error ? (
        <p className="auth-message auth-message-error" role="alert">
          {params.error}
        </p>
      ) : null}
      {params.saved ? (
        <p className="auth-message" role="status">
          {SAVED_MESSAGE[params.saved] ?? "Saved."}
        </p>
      ) : null}

      <p className="field-intro">
        These are the tags extracted from every customer conversation. Each one carries the exact
        definition the model is given — edit a definition to change what it looks for, add a tag of
        your own, or switch a field off to stop extracting it.
        {isAdmin ? null : " Only administrators can make changes."}
      </p>

      {fields.length === 0 ? (
        <div className="editorial-empty">
          <p className="eyebrow">Nothing to show</p>
          <h3>The field library has not been set up yet.</h3>
          <p>Reload the page — the standard fields are created automatically on first view.</p>
        </div>
      ) : (
        <>
          <dl className="field-stats">
            <div className="field-stat">
              <dt>Fields</dt>
              <dd>{fields.length}</dd>
            </div>
            <div className="field-stat">
              <dt>Extracted now</dt>
              <dd>{enabledCount}</dd>
            </div>
            <div className="field-stat">
              <dt>Your custom tags</dt>
              <dd>{custom.length}</dd>
            </div>
          </dl>

          <section className="field-section" aria-labelledby="custom-tags-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Yours to shape</p>
                <h2 id="custom-tags-title">Custom tags</h2>
              </div>
            </div>

            {isAdmin ? (
              <form action={createCustomField} className="field-add">
                <div className="field-add-row">
                  <label>
                    <span>Tag name</span>
                    <input
                      name="label"
                      placeholder="e.g. Wall-mount interest"
                      maxLength={80}
                      required
                    />
                  </label>
                </div>
                <label>
                  <span>Definition — what the model should look for</span>
                  <textarea
                    name="definition"
                    placeholder="Whether the customer asks about wall-mounting the television."
                    maxLength={1200}
                    rows={3}
                    required
                  />
                </label>
                <button type="submit" className="button button-primary">
                  Add tag
                </button>
              </form>
            ) : null}

            {custom.length === 0 ? (
              <p className="field-empty">
                No custom tags yet.{" "}
                {isAdmin ? "Add one above to capture something specific to your business." : ""}
              </p>
            ) : (
              <div className="field-list">
                {custom.map((field) => (
                  <FieldCard key={field.id} field={field} isAdmin={isAdmin} />
                ))}
              </div>
            )}
          </section>

          <section className="field-section" aria-labelledby="standard-fields-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">The standard record</p>
                <h2 id="standard-fields-title">Standard fields</h2>
              </div>
            </div>
            <div className="field-list">
              {standard.map((field) => (
                <FieldCard key={field.id} field={field} isAdmin={isAdmin} />
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}
