import type { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/metadata";

/**
 * Public indexable routes only.
 * /login, /register, /docs, /forgot-password and tokenized pages stay noindex
 * and are omitted here: they are auth, API-reference, or private-link pages,
 * and the home page already covers the signup CTA.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${getAppUrl()}/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
