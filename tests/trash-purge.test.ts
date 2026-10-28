import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { trashPurgeCutoff } from "@/lib/trash-policy";
import {
  TRASH_PURGE_BATCH_SIZE,
  expiredDeletedAtWhere,
  selectExpiredTrashIds,
  taskIdsInProjects,
} from "@/lib/trash-purge";

const now = new Date("2026-10-27T12:00:00.000Z");
const cutoff = trashPurgeCutoff(now);

describe("trash purge selection", () => {
  it("keeps rows that are still inside the 30 day window, including the cutoff instant", () => {
    const ids = selectExpiredTrashIds(
      [
        { id: "fresh", deletedAt: new Date("2026-10-01T00:00:00.000Z") },
        { id: "exact", deletedAt: cutoff },
        { id: "active", deletedAt: null },
        { id: "old", deletedAt: new Date(cutoff.getTime() - 1) },
      ],
      cutoff
    );
    expect(ids).toEqual(["old"]);
    expect(expiredDeletedAtWhere(cutoff)).toEqual({ not: null, lt: cutoff });
  });

  it("purges the oldest rows first and stops at the batch size", () => {
    const rows = Array.from({ length: TRASH_PURGE_BATCH_SIZE + 5 }, (_, index) => ({
      id: `task-${String(index).padStart(3, "0")}`,
      deletedAt: new Date(cutoff.getTime() - (TRASH_PURGE_BATCH_SIZE + 5 - index) * 1000),
    }));
    rows.push({ id: "same-time-b", deletedAt: new Date(cutoff.getTime() - 1) });
    rows.push({ id: "same-time-a", deletedAt: new Date(cutoff.getTime() - 1) });

    const ids = selectExpiredTrashIds(rows, cutoff);
    expect(ids).toHaveLength(TRASH_PURGE_BATCH_SIZE);
    expect(ids[0]).toBe("task-000");
    expect(ids).not.toContain("same-time-a");
    expect(ids).not.toContain("same-time-b");

    const tied = selectExpiredTrashIds(
      [
        { id: "b", deletedAt: new Date(cutoff.getTime() - 1) },
        { id: "a", deletedAt: new Date(cutoff.getTime() - 1) },
      ],
      cutoff
    );
    expect(tied).toEqual(["a", "b"]);
  });

  it("selects every task in an expired project, including tasks that were not themselves trashed", () => {
    const ids = taskIdsInProjects(
      [
        { id: "hidden", projectId: "project-old" },
        { id: "trashed-too", projectId: "project-old" },
        { id: "other", projectId: "project-fresh" },
        { id: "personal", projectId: null },
      ],
      ["project-old"],
      10
    );
    expect(ids).toEqual(["hidden", "trashed-too"]);
  });

  it("caps project-task deletes at the batch size", () => {
    const tasks = Array.from({ length: 5 }, (_, index) => ({
      id: `task-${index}`,
      projectId: "project-old",
    }));
    expect(taskIdsInProjects(tasks, ["project-old"], 2)).toEqual(["task-0", "task-1"]);
  });
});

describe("hobby cron registration", () => {
  it("schedules only the daily trash purge and the daily maintenance job", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8"));
    expect(config.buildCommand).toBe("npm run vercel-build");
    expect(config.installCommand).toBe("npm install");
    expect(config.regions).toEqual(["sin1"]);
    expect(config.crons).toEqual([
      { path: "/api/cron/trash", schedule: "30 3 * * *" },
      { path: "/api/cron/reminders", schedule: "0 8 * * *" },
    ]);
  });
});
