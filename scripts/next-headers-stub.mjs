/**
 * A stand-in for `next/headers` when app code runs outside Next.
 *
 * Operational scripts reach into modules that also serve requests, and those
 * modules import the cookie-scoped Supabase client even on paths that never use
 * it. Outside a request there are no cookies to read, so this throws rather than
 * inventing an empty session — a script that silently ran as nobody would read
 * as an organization with no data rather than as a mistake.
 */
const outsideRequest = (name) => () => {
  throw new Error(
    `${name}() was called outside a request. A script must use the service-role client, not the cookie client.`,
  );
};

export const cookies = outsideRequest("cookies");
export const headers = outsideRequest("headers");
export const draftMode = outsideRequest("draftMode");
