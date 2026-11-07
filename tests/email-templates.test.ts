import { describe, expect, it, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import {
  digestEmail,
  mentionEmail,
  appBaseUrl,
} from "@/lib/email";
import { maybeSendMentionEmail } from "@/lib/email-notification-prefs";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("digestEmail", () => {
  it("renders layout with real overdue count, ready, mentions, and My Work CTA", () => {
    const html = digestEmail({
      name: "Raghav",
      pending: 7,
      overdue: 3,
      ready: 2,
      mentions: 1,
      taskTitles: ["Pay rent", "Ship Day 11"],
      myWorkUrl: "https://app.example/dashboard/my-work",
    });
    expect(html).toContain("Your TaskFlow Digest");
    expect(html).toContain("Hi Raghav");
    expect(html).toContain("<strong>7</strong> pending");
    expect(html).toContain("<strong>3</strong> overdue");
    expect(html).toContain("<strong>2</strong> ready to start");
    expect(html).toContain("<strong>1</strong> unread @mention");
    expect(html).toContain("Pay rent");
    expect(html).toContain("Ship Day 11");
    expect(html).toContain("https://app.example/dashboard/my-work");
    expect(html).toContain("Open My Work");
    expect(html).toContain("font-family:system-ui");
  });

  it("keeps the legacy positional signature working", () => {
    const html = digestEmail("Ada", 2, 1, ["Overdue task"]);
    expect(html).toContain("Ada");
    expect(html).toContain("<strong>2</strong> pending");
    expect(html).toContain("<strong>1</strong> overdue");
    expect(html).toContain("Overdue task");
  });
});

describe("mentionEmail", () => {
  it("includes actor, preview, and deep link", () => {
    const html = mentionEmail({
      recipientName: "Bob",
      actorName: "Ada",
      preview: "Hey @Bob can you review?",
      contextLabel: 'on task "PR review"',
      actionUrl: "https://app.example/dashboard/my-work",
    });
    expect(html).toContain("You were mentioned");
    expect(html).toContain("Hi Bob");
    expect(html).toContain("Ada");
    expect(html).toContain("Hey @Bob can you review?");
    expect(html).toContain('on task &quot;PR review&quot;');
    expect(html).toContain("https://app.example/dashboard/my-work");
  });
});

describe("maybeSendMentionEmail", () => {
  it("skips when mention emails are disabled", async () => {
    db.user.findUnique.mockResolvedValue({
      email: "a@example.com",
      emailMentionEnabled: false,
    });
    await expect(
      maybeSendMentionEmail({ userId: "u1", subject: "s", html: "<p>x</p>" })
    ).resolves.toEqual({ sent: false, skipped: "prefs_disabled" });
  });

  it("sends in dev mode when SMTP is unset and prefs allow", async () => {
    db.user.findUnique.mockResolvedValue({
      email: "a@example.com",
      emailMentionEnabled: true,
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(
      maybeSendMentionEmail({ userId: "u1", subject: "Mention", html: "<p>hi</p>" })
    ).resolves.toEqual({ sent: true });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("appBaseUrl", () => {
  it("prefers NEXT_PUBLIC_APP_URL", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://public.example/");
    vi.stubEnv("NEXTAUTH_URL", "https://auth.example");
    expect(appBaseUrl()).toBe("https://public.example");
  });
});
