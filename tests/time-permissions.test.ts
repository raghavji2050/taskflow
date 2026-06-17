import { describe, expect, it } from "vitest";
import { canEditWorkspaceTasks, canManageWorkspace, canViewWorkspace } from "@/lib/workspace-permissions";

describe("time-related workspace permissions", () => {
  it("allows members and admins to edit tasks", () => {
    expect(canEditWorkspaceTasks({ role: "MEMBER", canInviteMembers: false })).toBe(true);
    expect(canEditWorkspaceTasks({ role: "ADMIN", canInviteMembers: false })).toBe(true);
    expect(canEditWorkspaceTasks({ role: "OWNER", canInviteMembers: false })).toBe(true);
  });

  it("blocks viewers from editing tasks", () => {
    expect(canEditWorkspaceTasks({ role: "VIEWER", canInviteMembers: false })).toBe(false);
  });

  it("allows admins to manage workspace", () => {
    expect(canManageWorkspace({ role: "ADMIN", canInviteMembers: false })).toBe(true);
    expect(canManageWorkspace({ role: "MEMBER", canInviteMembers: false })).toBe(false);
  });

  it("allows any member to view workspace", () => {
    expect(canViewWorkspace({ role: "VIEWER", canInviteMembers: false })).toBe(true);
    expect(canViewWorkspace(null)).toBe(false);
  });
});
