import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  TRASH_RETENTION_DAYS,
  isTaskVisible,
  trashPurgeAt,
  trashPurgeCutoff,
} from "@/lib/trash-policy";
import { trashedProjectActions, trashedTaskActions } from "@/lib/trash";
import { visibleProjectWhere, visibleTaskSql, visibleTaskWhere } from "@/lib/visible-records";

describe("trash retention", () => {
  const now = new Date("2026-10-27T12:00:00.000Z");

  it("purges items deleted more than 30 days ago", () => {
    const cutoff = trashPurgeCutoff(now);
    expect(cutoff.toISOString()).toBe("2026-09-27T12:00:00.000Z");
    expect(TRASH_RETENTION_DAYS).toBe(30);
    expect(trashPurgeAt(cutoff).toISOString()).toBe(now.toISOString());
  });

  it("keeps an item deleted 30 days ago until the cutoff instant passes", () => {
    const deletedAt = new Date("2026-09-27T12:00:00.000Z");
    const cutoff = trashPurgeCutoff(now);
    expect(deletedAt.getTime() < cutoff.getTime()).toBe(false);
    expect(new Date(deletedAt.getTime() - 1).getTime() < cutoff.getTime()).toBe(true);
  });
});

describe("visibility", () => {
  it("hides a trashed task and any task in a trashed project", () => {
    expect(isTaskVisible({ deletedAt: null, projectDeletedAt: null })).toBe(true);
    expect(isTaskVisible({ deletedAt: null })).toBe(true);
    expect(isTaskVisible({ deletedAt: new Date(), projectDeletedAt: null })).toBe(false);
    expect(isTaskVisible({ deletedAt: null, projectDeletedAt: new Date() })).toBe(false);
  });

  it("filters task queries without dropping the caller's own conditions", () => {
    const where = visibleTaskWhere({
      archived: false,
      OR: [{ title: { contains: "ship" } }, { description: { contains: "ship" } }],
    });
    expect(where).toEqual({
      AND: [
        {
          archived: false,
          OR: [{ title: { contains: "ship" } }, { description: { contains: "ship" } }],
        },
        {
          deletedAt: null,
          OR: [{ projectId: null }, { project: { is: { deletedAt: null } } }],
        },
      ],
    });
  });

  it("filters project queries to rows that are not in Trash", () => {
    expect(visibleProjectWhere({ workspaceId: "ws", archived: false })).toEqual({
      AND: [{ workspaceId: "ws", archived: false }, { deletedAt: null }],
    });
  });

  it("builds SQL that ignores trashed tasks and tasks in trashed projects", () => {
    const sql = visibleTaskSql("t").strings.join("?");
    expect(sql).toContain("t.deletedAt IS NULL");
    expect(sql).toContain("t.projectId IS NULL");
    expect(sql).toContain("p.deletedAt IS NULL");
  });
});

describe("trash permissions", () => {
  it("lets the owner of a personal task restore and purge it", () => {
    expect(trashedTaskActions(null)).toEqual({ canRestore: true, canPurge: true });
  });

  it("lets workspace members change task trash and blocks viewers", () => {
    expect(trashedTaskActions("MEMBER")).toEqual({ canRestore: true, canPurge: true });
    expect(trashedTaskActions("ADMIN")).toEqual({ canRestore: true, canPurge: true });
    expect(trashedTaskActions("VIEWER")).toEqual({ canRestore: false, canPurge: false });
  });

  it("uses the project manage permission for project trash", () => {
    expect(trashedProjectActions({ workspaceRole: "ADMIN", projectRole: null })).toEqual({
      canRestore: true,
      canPurge: true,
    });
    expect(trashedProjectActions({ workspaceRole: "MEMBER", projectRole: "MEMBER" })).toEqual({
      canRestore: false,
      canPurge: false,
    });
    expect(trashedProjectActions({ workspaceRole: "MEMBER", projectRole: "ADMIN" })).toEqual({
      canRestore: true,
      canPurge: true,
    });
    expect(trashedProjectActions({ workspaceRole: "VIEWER", projectRole: "VIEWER" })).toEqual({
      canRestore: false,
      canPurge: false,
    });
  });
});

describe("trash migration and wiring", () => {
  const sql = readFileSync(
    "prisma/migrations/20261027120000_task_project_trash/migration.sql",
    "utf8"
  );

  it("adds deletedAt to Task and Project", () => {
    expect(sql).toContain("ALTER TABLE `Task` ADD COLUMN `deletedAt`");
    expect(sql).toContain("ALTER TABLE `Project` ADD COLUMN `deletedAt`");
    expect(sql).toContain("Task_deletedAt_idx");
    expect(sql).toContain("Project_workspaceId_deletedAt_idx");
  });

  it("soft-deletes tasks and projects instead of removing them", () => {
    const taskRoute = readFileSync("app/api/tasks/[id]/route.ts", "utf8");
    const bulkRoute = readFileSync("app/api/tasks/bulk/route.ts", "utf8");
    const projects = readFileSync("lib/projects.ts", "utf8");
    expect(taskRoute).toContain("deletedAt: new Date()");
    expect(taskRoute).not.toContain("prisma.task.delete(");
    expect(bulkRoute).toContain("deletedAt: new Date()");
    expect(bulkRoute).not.toContain("deleteMany");
    expect(projects).toContain("deletedAt: new Date()");
    expect(projects).not.toContain("prisma.project.delete(");
  });

  it("keeps trashed rows out of lists, boards, search, stats, inbox, cron, and automations", () => {
    const files = [
      "app/api/tasks/route.ts",
      "app/api/tasks/my-work/route.ts",
      "app/api/tasks/reorder/route.ts",
      "app/api/workspaces/[id]/tasks/route.ts",
      "app/api/workspaces/[id]/workload/route.ts",
      "app/api/workspaces/route.ts",
      "app/api/categories/route.ts",
      "app/api/tags/route.ts",
      "app/api/admin/users/route.ts",
      "app/api/share/[token]/route.ts",
      "app/api/documents/[id]/links/route.ts",
      "app/api/cron/reminders/route.ts",
      "app/api/cron/timer-reminders/route.ts",
      "lib/projects.ts",
      "lib/daily-update.ts",
      "lib/documents.ts",
      "lib/automations.ts",
      "lib/auto-archive.ts",
      "lib/workspace.ts",
      "lib/time-analytics.ts",
      "lib/time-tracking.ts",
      "lib/mom-tasks.ts",
    ];
    for (const file of files) {
      expect(readFileSync(file, "utf8"), file).toContain("visibleTaskWhere");
    }
    expect(readFileSync("app/api/cron/reminders/route.ts", "utf8")).toContain("visibleTaskSql");
    expect(readFileSync("lib/time-analytics.ts", "utf8")).toContain("visibleTaskSql");
    expect(readFileSync("lib/projects.ts", "utf8")).toContain("visibleProjectWhere");
  });

  it("purges expired trash from a cron route registered like the other jobs", () => {
    const route = readFileSync("app/api/cron/trash/route.ts", "utf8");
    expect(route).toContain("CRON_SECRET");
    expect(route).toContain("purgeExpiredTrash");
    const crons = readFileSync("vercel.crons.example.json", "utf8");
    expect(crons).toContain("/api/cron/trash");
    expect(crons).toContain("30 3 * * *");
  });
});
