import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROJECT_NAME,
  DEFAULT_SECTION_NAME,
  ProjectError,
  canCreateProject,
  canEditProjectContent,
  canManageProject,
  canViewProject,
  planSectionReorder,
  planTaskMove,
  validateMemberChange,
  workspaceRoleToProjectRole,
} from "@/lib/project-sections";
import { projectMemberSchema, projectSchema, projectTaskMoveSchema } from "@/lib/validations";

const task = (id: string, sectionId: string, position: number) => ({ id, sectionId, position });

describe("project access", () => {
  it("lets workspace admins see and manage every project", () => {
    const access = { workspaceRole: "ADMIN" as const, projectRole: null };
    expect(canViewProject(access)).toBe(true);
    expect(canEditProjectContent(access)).toBe(true);
    expect(canManageProject(access)).toBe(true);
  });

  it("hides projects from workspace members who are not on the project", () => {
    const access = { workspaceRole: "MEMBER" as const, projectRole: null };
    expect(canViewProject(access)).toBe(false);
    expect(canEditProjectContent(access)).toBe(false);
    expect(canManageProject(access)).toBe(false);
  });

  it("lets project viewers read without editing", () => {
    const access = { workspaceRole: "MEMBER" as const, projectRole: "VIEWER" as const };
    expect(canViewProject(access)).toBe(true);
    expect(canEditProjectContent(access)).toBe(false);
    expect(canManageProject(access)).toBe(false);
  });

  it("lets project members edit content and project admins manage members", () => {
    expect(canEditProjectContent({ workspaceRole: "MEMBER", projectRole: "MEMBER" })).toBe(true);
    expect(canManageProject({ workspaceRole: "MEMBER", projectRole: "MEMBER" })).toBe(false);
    expect(canManageProject({ workspaceRole: "MEMBER", projectRole: "ADMIN" })).toBe(true);
    expect(canManageProject({ workspaceRole: "VIEWER", projectRole: "OWNER" })).toBe(true);
  });

  it("blocks viewers from creating projects", () => {
    expect(canCreateProject(null)).toBe(false);
    expect(canCreateProject("VIEWER")).toBe(false);
    expect(canCreateProject("MEMBER")).toBe(true);
    expect(workspaceRoleToProjectRole("OWNER")).toBe("OWNER");
  });
});

describe("planTaskMove", () => {
  const tasks = [
    task("a", "todo", 0),
    task("b", "todo", 1),
    task("c", "todo", 2),
    task("d", "doing", 0),
  ];

  it("reorders a task inside its section", () => {
    expect(planTaskMove(tasks, "c", "todo", 0)).toEqual([
      task("c", "todo", 0),
      task("a", "todo", 1),
      task("b", "todo", 2),
    ]);
  });

  it("moves a task to another section and closes the gap", () => {
    const planned = planTaskMove(tasks, "b", "doing", 0);
    expect(planned).toEqual(expect.arrayContaining([
      task("a", "todo", 0),
      task("c", "todo", 1),
      task("b", "doing", 0),
      task("d", "doing", 1),
    ]));
    expect(planned).toHaveLength(4);
  });

  it("clamps an index past the end", () => {
    const planned = planTaskMove(tasks, "a", "doing", 20);
    expect(planned.find((item) => item.id === "a")).toEqual(task("a", "doing", 1));
  });

  it("rejects a task that is not in the list", () => {
    expect(() => planTaskMove(tasks, "missing", "todo", 0)).toThrow(ProjectError);
  });
});

describe("planSectionReorder", () => {
  it("assigns positions from the requested order", () => {
    expect(planSectionReorder(["s1", "s2", "s3"], ["s3", "s1", "s2"])).toEqual([
      { id: "s3", position: 0 },
      { id: "s1", position: 1 },
      { id: "s2", position: 2 },
    ]);
  });

  it("rejects a partial order", () => {
    expect(() => planSectionReorder(["s1", "s2"], ["s1"])).toThrow(/every section/);
  });
});

describe("validateMemberChange", () => {
  const members = [
    { id: "m1", userId: "u1", role: "OWNER" as const },
    { id: "m2", userId: "u2", role: "MEMBER" as const },
  ];

  it("rejects a duplicate member and the last owner", () => {
    expect(validateMemberChange(members, { type: "add", userId: "u2", role: "MEMBER" }).ok).toBe(false);
    expect(validateMemberChange(members, { type: "remove", memberId: "m1" }).ok).toBe(false);
    expect(validateMemberChange(members, { type: "update", memberId: "m1", role: "ADMIN" }).ok).toBe(false);
  });

  it("allows adding someone new and removing a non-owner", () => {
    expect(validateMemberChange(members, { type: "add", userId: "u3", role: "VIEWER" }).ok).toBe(true);
    expect(validateMemberChange(members, { type: "remove", memberId: "m2" }).ok).toBe(true);
  });
});

describe("project validation", () => {
  it("accepts a project and a task move", () => {
    expect(projectSchema.safeParse({ name: "Launch", color: "#10b981" }).success).toBe(true);
    expect(projectSchema.safeParse({ name: "  " }).success).toBe(false);
    const move = projectTaskMoveSchema.safeParse({ taskId: "t1", sectionId: "s1", position: 0 });
    expect(move.success).toBe(true);
    const member = projectMemberSchema.safeParse({ userId: "u1" });
    expect(member.success).toBe(true);
    if (member.success) expect(member.data.role).toBe("MEMBER");
  });
});

describe("projects migration", () => {
  const sql = readFileSync(
    "prisma/migrations/20261025120000_projects_sections/migration.sql",
    "utf8"
  );

  it("backfills a default project, section, and membership for each workspace", () => {
    expect(sql).toContain(`'${DEFAULT_PROJECT_NAME}'`);
    expect(sql).toContain(`'${DEFAULT_SECTION_NAME}'`);
    expect(sql).toContain("INSERT INTO `Project`");
    expect(sql).toContain("INSERT INTO `ProjectSection`");
    expect(sql).toContain("INSERT INTO `ProjectMember`");
    expect(sql).toContain("UPDATE `Task`");
    expect(sql).toContain("t.`projectId`");
    expect(sql).toContain("t.`sectionId`");
  });
});
