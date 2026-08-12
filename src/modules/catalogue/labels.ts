/**
 * How a retailer's category label is identified, and how it is put to a model.
 *
 * Pure and server-free: the phrasing decides what every proposal is scored
 * against, so it is testable without standing up a database or a model client.
 */

/** The label's identity, used to tell an already-decided label from a new one. */
export function labelPath(groupName: string, subgroupName: string): string {
  return [groupName, subgroupName].filter((part) => part.trim().length > 0).join(" > ");
}

/**
 * The label as the model sees it.
 *
 * Written as a phrase rather than a path because "Notebooks > Copilot+ PC" is
 * not a thing anyone says, and the model scores it as the fragment it is.
 * Naming the parent as a relation instead measurably helped every label
 * tested — Copilot+ PC 0.420 to 0.579, Gaming PC 0.628 to 0.705, Smart Phones
 * 0.547 to 0.625 — because the subgroup leads and the group qualifies it rather
 * than competing with it.
 */
export function labelSentence(groupName: string, subgroupName: string): string {
  const group = groupName.trim();
  const subgroup = subgroupName.trim();
  if (subgroup.length === 0) return group;
  if (group.length === 0 || group.toLowerCase() === subgroup.toLowerCase()) return subgroup;
  return `${subgroup}, a kind of ${group}`;
}
