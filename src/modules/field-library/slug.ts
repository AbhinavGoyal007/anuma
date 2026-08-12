/**
 * Turns a display name into a stable field key.
 *
 * "Wall mount interest" → "wall_mount_interest". The key is the identity the
 * record and dashboards join on, so it is derived once at creation and never
 * changes, even as the display name is edited. Returns null when nothing usable
 * remains, so the caller rejects the name rather than storing an invalid key.
 */
export function slugifyFieldKey(name: string): string | null {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^[^a-z]+/, "")
    .replace(/_+/g, "_")
    .replace(/_+$/g, "")
    .slice(0, 63);
  return /^[a-z][a-z0-9_]{1,63}$/.test(slug) ? slug : null;
}
