import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { deriveConversationState, listConversations } from "@/modules/conversations/data";
import { getApplicationContext } from "@/modules/identity/application-context";
import { getConversationOutcomes } from "@/modules/interaction-metrics/aggregate";

/** A finished conversation's outcome, as a label and a tone for the badge. */
const OUTCOME: Record<string, { label: string; tone: string }> = {
  purchased: { label: "Purchased", tone: "outcome--won" },
  follow_up_scheduled: { label: "Follow-up", tone: "outcome--open" },
  researching: { label: "Researching", tone: "outcome--open" },
  deferred: { label: "Deferred", tone: "outcome--cool" },
  rejected: { label: "No sale", tone: "outcome--lost" },
};

const PROCESSING_STATUSES = ["draft", "ready_for_recording", "processing"];

export default async function ConversationsPage() {
  const context = await getApplicationContext();
  if (!context) redirect("/sign-in");
  if (!context.current) redirect("/setup");

  const { organization, locations, teams } = context.current;
  const conversations = await listConversations(organization.id);
  const outcomes = await getConversationOutcomes(
    organization.id,
    conversations.map((c) => c.id),
  );

  const locationNames = new Map(locations.map((item) => [item.id, item.name]));
  const teamNames = new Map(teams.map((item) => [item.id, item.name]));

  // A chain is a set of stores, not a flat list, so the page reads the way a
  // regional manager thinks: each store, its activity, then its interactions.
  // Conversations recorded before the rep had a store collect under one group
  // rather than disappearing.
  const groupsByStore = new Map<string, typeof conversations>();
  for (const conversation of conversations) {
    const key = conversation.locationId ?? "__unassigned__";
    const bucket = groupsByStore.get(key);
    if (bucket) bucket.push(conversation);
    else groupsByStore.set(key, [conversation]);
  }
  const storeGroups = [...groupsByStore.entries()]
    .map(([key, items]) => ({
      key,
      name: key === "__unassigned__" ? "No store assigned" : (locationNames.get(key) ?? "Scoped store"),
      unassigned: key === "__unassigned__",
      items,
    }))
    .sort((a, b) => {
      if (a.unassigned !== b.unassigned) return a.unassigned ? 1 : -1;
      return a.name.localeCompare(b.name);
    });

  // The operational pulse: how much, how far along, and what came of it.
  const ready = conversations.filter((c) => c.lifecycleStatus === "ready").length;
  const processing = conversations.filter((c) =>
    PROCESSING_STATUSES.includes(c.lifecycleStatus),
  ).length;
  const outcomeCounts = new Map<string, number>();
  for (const state of outcomes.values()) {
    outcomeCounts.set(state, (outcomeCounts.get(state) ?? 0) + 1);
  }
  const purchased = outcomeCounts.get("purchased") ?? 0;
  const followUp = outcomeCounts.get("follow_up_scheduled") ?? 0;

  const dateFormatter = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: organization.timezone,
  });
  const timeFormatter = new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: organization.timezone,
  });

  return (
    <>
      <PageHeader eyebrow="Interactions" title="Conversations" />

      {conversations.length ? (
        <>
          <dl className="pulse-strip">
            <div className="pulse-stat">
              <dt>Interactions</dt>
              <dd>{conversations.length}</dd>
            </div>
            <div className="pulse-stat">
              <dt>Stores active</dt>
              <dd>{storeGroups.filter((g) => !g.unassigned).length}</dd>
            </div>
            <div className="pulse-stat">
              <dt>Processing</dt>
              <dd>{processing}</dd>
            </div>
            <div className="pulse-stat">
              <dt>Ready</dt>
              <dd>{ready}</dd>
            </div>
            <div className="pulse-stat">
              <dt>Purchased</dt>
              <dd className="pulse-won">{purchased}</dd>
            </div>
            <div className="pulse-stat">
              <dt>Follow-up</dt>
              <dd>{followUp}</dd>
            </div>
          </dl>

          <section className="conversation-section" aria-labelledby="conversation-list-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Your authorized scope</p>
                <h2 id="conversation-list-title">Interactions by store</h2>
              </div>
            </div>

            <div className="store-groups">
              {storeGroups.map((group) => {
                const groupReady = group.items.filter((i) => i.lifecycleStatus === "ready").length;
                const groupProcessing = group.items.filter((i) =>
                  PROCESSING_STATUSES.includes(i.lifecycleStatus),
                ).length;
                return (
                  <div key={group.key} className="store-group">
                    <div className="store-group-head">
                      <h3>{group.name}</h3>
                      <div className="store-group-metrics">
                        <span>
                          <strong>{group.items.length}</strong> interactions
                        </span>
                        <span>
                          <strong>{groupReady}</strong> ready
                        </span>
                        {groupProcessing > 0 ? (
                          <span className="store-group-processing">
                            <strong>{groupProcessing}</strong> processing
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <ol className="interaction-list">
                      {group.items.map((conversation) => {
                        const outcome = outcomes.get(conversation.id);
                        const badge = outcome ? OUTCOME[outcome] : null;
                        return (
                          <li key={conversation.id}>
                            <time dateTime={conversation.startedAt}>
                              <strong>
                                {timeFormatter.format(new Date(conversation.startedAt))}
                              </strong>
                              <span>{dateFormatter.format(new Date(conversation.startedAt))}</span>
                            </time>
                            <div className="interaction-main">
                              <h3>
                                <a href={`/conversations/${conversation.id}`}>
                                  {conversation.title ?? "Untitled interaction"}
                                </a>
                              </h3>
                              <p>
                                {conversation.vertical}
                                {conversation.teamId ? (
                                  <>
                                    {" "}
                                    <span aria-hidden="true">·</span>{" "}
                                    {teamNames.get(conversation.teamId) ?? "Scoped team"}
                                  </>
                                ) : null}
                              </p>
                            </div>
                            <div className="interaction-status">
                              {badge ? (
                                <span className={`outcome-badge ${badge.tone}`}>{badge.label}</span>
                              ) : (
                                <span className="status-badge status-badge-neutral">
                                  {deriveConversationState(conversation)}
                                </span>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      ) : (
        <div className="editorial-empty">
          <p className="eyebrow">No interactions yet</p>
          <h3>Conversations recorded in your stores will appear here.</h3>
          <p>
            Reps record customer conversations on the Anuma app. Each one is transcribed, its
            speakers identified, and turned into an evidence-backed record automatically — then it
            shows up here, grouped by store.
          </p>
        </div>
      )}
    </>
  );
}
