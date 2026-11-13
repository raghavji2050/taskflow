import type { MetadataRoute } from "next";
import { getAppUrl, ROBOTS_DISALLOW } from "@/lib/metadata";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...ROBOTS_DISALLOW],
    },
    sitemap: `${getAppUrl()}/sitemap.xml`,
  };
}
