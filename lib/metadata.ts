import type { Metadata } from "next";

export const SITE_NAME = "TaskFlow";

export const SITE_DESCRIPTION =
  "Plan work, collaborate with your team, and stay on top of tasks with list, board, calendar, timeline, chat, and docs in one place.";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const siteMetadataBase = new URL(appUrl);

type PageMetadataOptions = {
  title: string;
  description?: string;
  /** Private/authenticated pages should not be indexed. */
  noIndex?: boolean;
};

export function createPageMetadata({
  title,
  description = SITE_DESCRIPTION,
  noIndex = false,
}: PageMetadataOptions): Metadata {
  const fullTitle = `${title} · ${SITE_NAME}`;

  return {
    title,
    description,
    ...(noIndex
      ? { robots: { index: false, follow: false } }
      : { robots: { index: true, follow: true } }),
    openGraph: {
      title: fullTitle,
      description,
      siteName: SITE_NAME,
      type: "website",
      url: appUrl,
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
    },
  };
}

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
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

/** Authenticated app pages — not indexed by search engines. */
export function appPageMetadata(title: string, description?: string): Metadata {
  return createPageMetadata({ title, description, noIndex: true });
}
