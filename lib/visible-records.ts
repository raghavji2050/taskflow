import { Prisma } from "@prisma/client";

/**
 * Tasks shown on lists, boards, search, stats, inbox, cron, and automations.
 * A trashed project hides its tasks even when those tasks have no deletedAt.
 */
export function visibleTaskWhere(where: Prisma.TaskWhereInput = {}): Prisma.TaskWhereInput {
  return {
    AND: [
      where,
      {
        deletedAt: null,
        OR: [{ projectId: null }, { project: { is: { deletedAt: null } } }],
      },
    ],
  };
}

export function visibleProjectWhere(where: Prisma.ProjectWhereInput = {}): Prisma.ProjectWhereInput {
  return {
    AND: [where, { deletedAt: null }],
  };
}

/** SQL predicate for a task row that is not in Trash and whose project is not in Trash. */
export function visibleTaskSql(alias: "t" | "Task"): Prisma.Sql {
  if (alias === "t") {
    return Prisma.sql`t.deletedAt IS NULL AND (t.projectId IS NULL OR EXISTS (SELECT 1 FROM Project p WHERE p.id = t.projectId AND p.deletedAt IS NULL))`;
  }
  return Prisma.sql`deletedAt IS NULL AND (projectId IS NULL OR EXISTS (SELECT 1 FROM Project p WHERE p.id = Task.projectId AND p.deletedAt IS NULL))`;
}
