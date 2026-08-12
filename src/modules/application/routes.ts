export type ApplicationRoute = {
  href:
    | "/conversations"
    | "/customer-intelligence"
    | "/frontline-performance"
    | "/outcome-intelligence"
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
    href: "/customer-intelligence",
    label: "Customer Intelligence",
    group: "Intelligence",
    eyebrow: "Customer intelligence",
    title: "Customer Intelligence",
    description:
      "Customer needs, questions, objections and competitive signals will appear after interactions are processed.",
    signal: "customer",
  },
  {
    href: "/frontline-performance",
    label: "Frontline Performance",
    group: "Intelligence",
    eyebrow: "Frontline intelligence",
    title: "Frontline Performance",
    description:
      "Evidence-backed interaction and process measures will appear as eligible conversations accumulate.",
    signal: "performance",
  },
  {
    href: "/outcome-intelligence",
    label: "Outcome Intelligence",
    group: "Intelligence",
    eyebrow: "Outcome intelligence",
    title: "Outcome Intelligence",
    description:
      "Outcome comparisons will become available after sufficient labelled interactions exist.",
    signal: "outcome",
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
