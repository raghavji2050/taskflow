import type { Metadata } from "next";

export const SITE_NAME = "TaskFlow";

export const SITE_DESCRIPTION =
  "Plan work, collaborate with your team, and stay on top of tasks with list, board, calendar, timeline, chat, and docs in one place.";

/** Unique branded document title for the public home page (does not use the "%s · TaskFlow" template). */
export const HOME_TITLE_ABSOLUTE =
  "TaskFlow – Simple task & team management for small teams";

export const PRODUCTION_APP_URL = "https://taskflow-vault.vercel.app";

/** Default social preview. Relative path is resolved against metadataBase. */
export const OG_IMAGE = {
  url: "/og.png",
  width: 1200,
  height: 630,
  alt: HOME_TITLE_ABSOLUTE,
} as const;

const LOCAL_APP_URL = "http://localhost:3000";

/**
 * Public site origin for metadata, robots.txt, and sitemap.xml.
 * Prefers NEXT_PUBLIC_APP_URL; if it is missing, uses the production domain
 * on Vercel / production builds instead of localhost.
 */
export function getAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
    return PRODUCTION_APP_URL;
  }
  return LOCAL_APP_URL;
}

const appUrl = getAppUrl();

export const siteMetadataBase = new URL(appUrl);

type PageMetadataOptions = {
  title: string;
  description?: string;
  /** Private/authenticated pages should not be indexed. */
  noIndex?: boolean;
  /** When set, used as the document title without the "%s · TaskFlow" template. */
  absoluteTitle?: string;
  /** Public path for the self-canonical and openGraph.url, e.g. "/" or "/help". */
  path?: string;
};

/** Absolute URL for a public page, used as canonical and og:url. */
export function absolutePageUrl(path: string): string {
  const origin = getAppUrl();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (normalized === "/") return `${origin}/`;
  return `${origin}${normalized.replace(/\/$/, "")}`;
}

export function createPageMetadata({
  title,
  description = SITE_DESCRIPTION,
  noIndex = false,
  absoluteTitle,
  path,
}: PageMetadataOptions): Metadata {
  const fullTitle = absoluteTitle ?? `${title} · ${SITE_NAME}`;
  const pageUrl = path !== undefined ? absolutePageUrl(path) : getAppUrl();

  return {
    title: absoluteTitle ? { absolute: absoluteTitle } : title,
    description,
    ...(noIndex
      ? { robots: { index: false, follow: false } }
      : { robots: { index: true, follow: true } }),
    ...(path !== undefined ? { alternates: { canonical: pageUrl } } : {}),
    openGraph: {
      title: fullTitle,
      description,
      siteName: SITE_NAME,
      type: "website",
      url: pageUrl,
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [OG_IMAGE],
    },
  };
}

/** Optional Search Console / Bing verification tags. Never hardcode values. */
export function getSiteVerification(): Metadata["verification"] | undefined {
  const google = process.env.GOOGLE_SITE_VERIFICATION?.trim();
  const bing = process.env.BING_SITE_VERIFICATION?.trim();
  if (!google && !bing) return undefined;
  return {
    ...(google ? { google } : {}),
    ...(bing ? { other: { "msvalidate.01": bing } } : {}),
  };
}

/** Paths search engines should not crawl (authenticated, API, or tokenized). */
export const ROBOTS_DISALLOW = [
  "/dashboard",
  "/settings",
  "/admin",
  "/api",
  "/oauth",
  "/join",
  "/share",
  "/reset-password",
  "/forgot-password",
] as const;

/** Default metadata for the root layout. */
export const rootMetadata: Metadata = {
  metadataBase: siteMetadataBase,
  title: {
    default: SITE_NAME,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
    type: "website",
    url: appUrl,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
  robots: { index: true, follow: true },
  verification: getSiteVerification(),
};

/** Authenticated app pages — not indexed by search engines. */
export function appPageMetadata(title: string, description?: string): Metadata {
  return createPageMetadata({ title, description, noIndex: true });
}
