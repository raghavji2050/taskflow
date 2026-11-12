import { describe, expect, it } from "vitest";
import { AUDIT_ACTIONS, actionsForCategory, auditActionLabel, auditCsv, clientIpFrom } from "@/lib/audit-labels";

describe("audit labels", () => {
  it("labels known and unknown actions", () => {
    expect(auditActionLabel("member.removed")).toBe("Removed member");
    expect(auditActionLabel("x.some_thing")).toBe("x some thing");
  });
  it("maps categories to actions", () => {
    expect(actionsForCategory("security")).toEqual(["token.created", "token.revoked", "account.signed_out_everywhere", "account.password_changed"]);
    expect(actionsForCategory("members")).toContain("project.member_added");
    expect(actionsForCategory("projects")).not.toContain("project.member_added");
    expect(actionsForCategory("nope")).toBeNull();
    expect(actionsForCategory(null)).toBeNull();
    const all = Object.keys(AUDIT_ACTIONS);
    const covered = new Set(["members", "projects", "tasks", "workspace", "security"].flatMap((c) => actionsForCategory(c)!));
    expect(all.filter((a) => !covered.has(a))).toEqual([]);
  });
  it("reads the first forwarded ip", () => {
    const h = (m: Record<string, string>) => ({ get: (k: string) => m[k] ?? null });
    expect(clientIpFrom(h({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(clientIpFrom(h({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(clientIpFrom(h({}))).toBeNull();
  });
  it("builds safe CSV", () => {
    const csv = auditCsv([{ createdAt: "2026-11-12T00:00:00.000Z", actor: "Ann <a@x.com>", action: "task.created", targetType: "task", targetLabel: '=HYPERLINK("x"), "quoted"', details: { a: 1 }, ip: "1.2.3.4" }]);
    const [head, row] = csv.trim().split("\n");
    expect(head).toBe("Time (UTC),Who,Action,Target type,Target,Details,IP");
    expect(row).toContain("Created task");
    expect(row).toContain(`"'=HYPERLINK(""x""), ""quoted"""`);
    expect(row).toContain(`"{""a"":1}"`);
  });
});
