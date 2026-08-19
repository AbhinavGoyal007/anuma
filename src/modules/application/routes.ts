export type ApplicationRoute = {
  href:
    | "/conversations"
    | "/intelligence/overview"
    | "/intelligence/demand"
    | "/intelligence/journey"
    | "/intelligence/frontline"
    | "/field-library"
    | "/administration";
  label: string;
  group: "Interactions" | "Intelligence" | "Configure";
  eyebrow: string;
  title: string;
  description: string;
  signal: "evidence" | "customer" | "performance" | "outcome" | "administration";
};

export const applicationRoutes: ApplicationRoute[] = [
  {
    href: "/conversations",
    label: "Conversations",
    group: "Interactions",
    eyebrow: "Interaction evidence",
    title: "Conversations",
    description:
      "Prepared interactions appear here. Evidence and structured intelligence will become available after real interactions can be processed.",
    signal: "evidence",
  },
  {
    href: "/intelligence/overview",
    label: "Overview",
    group: "Intelligence",
    eyebrow: "Intelligence",
    title: "What changed, and what needs doing",
    description:
      "The few things worth a manager's morning: what moved since the last period, and which interactions need reviewing.",
    signal: "outcome",
  },
  {
    href: "/intelligence/demand",
    label: "Customer Demand",
    group: "Intelligence",
    eyebrow: "Customer demand",
    title: "Who walked in, and what stopped them",
    description:
      "What customers came for, what they were willing to spend, whether the conversation made their requirement clearer, and what held them back.",
    signal: "customer",
  },
  {
    href: "/intelligence/journey",
    label: "Decision Journey",
    group: "Intelligence",
    eyebrow: "Customer decision journey",
    title: "How far customers got",
    description:
      "How much of a group reached a clear requirement, a chosen product, a buying signal and a sale — and which interactions stopped between each.",
    signal: "outcome",
  },
  {
    href: "/intelligence/frontline",
    label: "Frontline Intelligence",
    group: "Intelligence",
    eyebrow: "Frontline intelligence",
    title: "Where frontline execution needs attention",
    description:
      "The interactions where something was missed — a recommendation with no reason, a finance request with no offer, a buying signal nobody closed on.",
    signal: "performance",
  },
  {
    href: "/field-library",
    label: "Field Library",
    group: "Configure",
    eyebrow: "Extraction fields",
    title: "Field Library",
    description:
      "The tags extracted from every customer conversation, each with the definition the model is given. Edit a definition, add your own tag, or switch a field off.",
    signal: "administration",
  },
  {
    href: "/administration",
    label: "Administration",
    group: "Configure",
    eyebrow: "Organization settings",
    title: "Administration",
    description:
      "Manage the organization context that supports frontline interactions. Additional configuration will appear when it is available.",
    signal: "administration",
  },
];

export function getApplicationRoute(href: ApplicationRoute["href"]) {
  const route = applicationRoutes.find((candidate) => candidate.href === href);

  if (!route) {
    throw new Error(`Unknown application route: ${href}`);
  }

  return route;
}
