import { afterEach, describe, expect, it, vi } from "vitest";
import {
  absolutePageUrl,
  appPageMetadata,
  createPageMetadata,
  getAppUrl,
  getSiteVerification,
  HOME_TITLE_ABSOLUTE,
  OG_IMAGE,
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
  it("lists the public home page, help center, compare pages and template guides", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://taskflow-vault.vercel.app");
    const entries = sitemap();
    expect(entries).toHaveLength(11);
    expect(entries[0].url).toBe("https://taskflow-vault.vercel.app/");
    expect(entries[0].changeFrequency).toBe("weekly");
    expect(entries[0].priority).toBe(1);
    expect(entries[0].lastModified).toBeInstanceOf(Date);
    expect(entries[1].url).toBe("https://taskflow-vault.vercel.app/help");
    expect(entries[1].changeFrequency).toBe("monthly");
    expect(entries[1].priority).toBe(0.7);
    const urls = entries.map((e) => e.url);
    for (const slug of ["trello", "asana", "todoist"]) {
      expect(urls).toContain(`https://taskflow-vault.vercel.app/compare/${slug}`);
    }
    for (const slug of ["", "/sprint-planning", "/client-projects", "/content-calendar", "/bug-tracking", "/daily-todo"]) {
      expect(urls).toContain(`https://taskflow-vault.vercel.app/templates${slug}`);
    }
    expect(urls.some((url) => url.includes("/register"))).toBe(false);
    expect(urls.some((url) => url.includes("/login"))).toBe(false);
    expect(urls.some((url) => url.includes("/docs"))).toBe(false);
  });
});

describe("home metadata", () => {
  it("uses an absolute branded title and keeps the site description", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://taskflow-vault.vercel.app");
    const metadata = createPageMetadata({
      title: "Task & team management",
      absoluteTitle: HOME_TITLE_ABSOLUTE,
      description:
        "Plan work, collaborate with your team, and stay on top of tasks with list, board, calendar, timeline, chat, and docs in one place.",
      path: "/",
    });
    expect(metadata.title).toEqual({ absolute: HOME_TITLE_ABSOLUTE });
    expect(HOME_TITLE_ABSOLUTE).toBe(
      "TaskFlow – Simple task & team management for small teams",
    );
    expect(metadata.description).toContain("Plan work, collaborate with your team");
    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(metadata.openGraph?.title).toBe(HOME_TITLE_ABSOLUTE);
    expect(metadata.twitter?.title).toBe(HOME_TITLE_ABSOLUTE);
    expect(metadata.alternates?.canonical).toBe("https://taskflow-vault.vercel.app/");
    expect(metadata.openGraph?.url).toBe("https://taskflow-vault.vercel.app/");
    expect(metadata.openGraph?.images).toEqual([OG_IMAGE]);
    expect(metadata.twitter?.images).toEqual([OG_IMAGE]);
    expect(OG_IMAGE).toEqual({
      url: "/og.png",
      width: 1200,
      height: 630,
      alt: HOME_TITLE_ABSOLUTE,
    });
  });
});

describe("help metadata", () => {
  it("uses a self-canonical and og:url pointing at /help, not the homepage", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://taskflow-vault.vercel.app");
    const description =
      "Guides for getting started with TaskFlow: workspaces, team invites, views, billing, API and security.";
    const metadata = createPageMetadata({
      title: "Help center",
      description,
      path: "/help",
    });
    expect(metadata.title).toBe("Help center");
    expect(metadata.description).toBe(description);
    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(metadata.openGraph?.title).toBe("Help center · TaskFlow");
    expect(metadata.openGraph?.description).toBe(description);
    expect(metadata.alternates?.canonical).toBe("https://taskflow-vault.vercel.app/help");
    expect(metadata.openGraph?.url).toBe("https://taskflow-vault.vercel.app/help");
    expect(metadata.openGraph?.url).not.toBe("https://taskflow-vault.vercel.app/");
    expect(metadata.openGraph?.url).not.toBe("https://taskflow-vault.vercel.app");
    expect(metadata.alternates?.canonical).not.toBe("https://taskflow-vault.vercel.app/");
    expect(metadata.openGraph?.images).toEqual([OG_IMAGE]);
    expect(metadata.twitter?.images).toEqual([OG_IMAGE]);
  });
});

describe("absolutePageUrl", () => {
  it("builds home and help URLs without a trailing slash on inner paths", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://taskflow-vault.vercel.app");
    expect(absolutePageUrl("/")).toBe("https://taskflow-vault.vercel.app/");
    expect(absolutePageUrl("/help")).toBe("https://taskflow-vault.vercel.app/help");
    expect(absolutePageUrl("help")).toBe("https://taskflow-vault.vercel.app/help");
  });
});

describe("login and register noindex", () => {
  it("keeps robots noindex and does not add a canonical", () => {
    const login = appPageMetadata("Sign in", "Sign in to your TaskFlow account.");
    const register = appPageMetadata(
      "Create account",
      "Register for a new TaskFlow account.",
    );
    expect(login.robots).toEqual({ index: false, follow: false });
    expect(register.robots).toEqual({ index: false, follow: false });
    expect(login.alternates?.canonical).toBeUndefined();
    expect(register.alternates?.canonical).toBeUndefined();
    expect(login.description).toBe("Sign in to your TaskFlow account.");
    expect(register.description).toBe("Register for a new TaskFlow account.");
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
