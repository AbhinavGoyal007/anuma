import type { NextRequest } from "next/server";

const ANUMA_PRODUCTION_ORIGIN = "https://anumaai-ten.vercel.app";

function isLocalHost(host: string): boolean {
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function normalizeOrigin(value: string): string {
  const candidate = /^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`;
  const url = new URL(candidate);

  if (!isLocalHost(url.host)) {
    url.protocol = "https:";
  }

  return url.origin;
}

export function getSiteOrigin(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    return normalizeOrigin(configured);
  }

  if (process.env.NODE_ENV === "production") {
    const vercelProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
    return normalizeOrigin(vercelProductionUrl || ANUMA_PRODUCTION_ORIGIN);
  }

  const forwardedHost =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    request.headers.get("host")?.trim();

  if (forwardedHost) {
    const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    return `${forwardedProtocol === "https" ? "https" : "http"}://${forwardedHost}`;
  }

  return normalizeOrigin(new URL(request.url).origin);
}

export function getSiteUrl(request: NextRequest, path: string): URL {
  return new URL(path, getSiteOrigin(request));
}
