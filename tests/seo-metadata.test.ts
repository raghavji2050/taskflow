import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPageMetadata,
  getAppUrl,
  getSiteVerification,
  HOME_TITLE_ABSOLUTE,
  PRODUCTION_APP_URL,
  ROBOTS_DISALLOW,
} from "@/lib/metadata";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getAppUrl", () => {
  it("prefers NEXT_PUBLIC_APP_URL and strips a trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://public.example/");
    vi.stubEnv("NODE_ENV", "production");
    expect(getAppUrl()).toBe("https://public.example");
  });

  it("falls back to the production domain when env is missing in production", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "");
    expect(getAppUrl()).toBe(PRODUCTION_APP_URL);
  });

  it("falls back to the production domain on Vercel even if NODE_ENV is not production", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL", "1");
    expect(getAppUrl()).toBe(PRODUCTION_APP_URL);
  });

  it("falls back to localhost outside production when env is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL", "");
    expect(getAppUrl()).toBe("http://localhost:3000");
  });
});

describe("robots.txt", () => {
  it("allows the home page, disallows private prefixes, and points sitemap at the app URL", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://taskflow-vault.vercel.app");
    const doc = robots();
    const rules = Array.isArray(doc.rules) ? doc.rules[0] : doc.rules;
    expect(rules.userAgent).toBe("*");
    expect(rules.allow).toBe("/");
    expect(rules.disallow).toEqual([...ROBOTS_DISALLOW]);
    expect(rules.disallow).toEqual([
      "/dashboard",
      "/settings",
      "/admin",
      "/api",
      "/oauth",
      "/join",
      "/share",
      "/reset-password",
      "/forgot-password",
    ]);
    expect(doc.sitemap).toBe("https://taskflow-vault.vercel.app/sitemap.xml");
  });
});

describe("sitemap.xml", () => {
  it("lists the public home page and help center", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://taskflow-vault.vercel.app");
    const entries = sitemap();
    expect(entries).toHaveLength(2);
    expect(entries[0].url).toBe("https://taskflow-vault.vercel.app/");
    expect(entries[0].changeFrequency).toBe("weekly");
    expect(entries[0].priority).toBe(1);
    expect(entries[0].lastModified).toBeInstanceOf(Date);
    expect(entries[1].url).toBe("https://taskflow-vault.vercel.app/help");
    expect(entries[1].changeFrequency).toBe("monthly");
    expect(entries[1].priority).toBe(0.7);
    const urls = entries.map((e) => e.url);
    expect(urls.some((url) => url.includes("/register"))).toBe(false);
    expect(urls.some((url) => url.includes("/login"))).toBe(false);
    expect(urls.some((url) => url.includes("/docs"))).toBe(false);
  });
});

describe("home metadata", () => {
  it("uses an absolute branded title and keeps the site description", () => {
    const metadata = createPageMetadata({
      title: "Task & team management",
      absoluteTitle: HOME_TITLE_ABSOLUTE,
      description:
        "Plan work, collaborate with your team, and stay on top of tasks with list, board, calendar, timeline, chat, and docs in one place.",
    });
    expect(metadata.title).toEqual({ absolute: HOME_TITLE_ABSOLUTE });
    expect(HOME_TITLE_ABSOLUTE).toBe(
      "TaskFlow – Simple task & team management for small teams",
    );
    expect(metadata.description).toContain("Plan work, collaborate with your team");
    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(metadata.openGraph?.title).toBe(HOME_TITLE_ABSOLUTE);
    expect(metadata.twitter?.title).toBe(HOME_TITLE_ABSOLUTE);
  });
});

describe("getSiteVerification", () => {
  it("omits verification when env vars are unset", () => {
    vi.stubEnv("GOOGLE_SITE_VERIFICATION", "");
    vi.stubEnv("BING_SITE_VERIFICATION", "");
    expect(getSiteVerification()).toBeUndefined();
  });

  it("emits google and msvalidate.01 only when the env vars are set", () => {
    vi.stubEnv("GOOGLE_SITE_VERIFICATION", " google-token ");
    vi.stubEnv("BING_SITE_VERIFICATION", " bing-token ");
    expect(getSiteVerification()).toEqual({
      google: "google-token",
      other: { "msvalidate.01": "bing-token" },
    });
  });

  it("emits only the providers that have a value", () => {
    vi.stubEnv("GOOGLE_SITE_VERIFICATION", "only-google");
    vi.stubEnv("BING_SITE_VERIFICATION", "");
    expect(getSiteVerification()).toEqual({ google: "only-google" });
  });
});
