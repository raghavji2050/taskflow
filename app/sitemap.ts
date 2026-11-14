import type { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/metadata";

/**
 * Public indexable routes only.
 * /login, /register, /docs, /forgot-password and tokenized pages stay noindex
 * and are omitted here: they are auth, API-reference, or private-link pages.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getAppUrl();
  return [
    {
      url: `${origin}/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${origin}/help`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];
}
