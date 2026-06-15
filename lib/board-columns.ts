import type { TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const DEFAULT_BOARD_COLUMNS: {
  name: string;
  color: string;
  position: number;
  status: TaskStatus;
}[] = [
  { name: "To Do", color: "#38bdf8", position: 0, status: "PENDING" },
  { name: "In Progress", color: "#8b5cf6", position: 1, status: "IN_PROGRESS" },
  { name: "Done", color: "#10b981", position: 2, status: "COMPLETED" },
];

export function boardColumnScope(userId: string, workspaceId: string | null) {
  return workspaceId
    ? { workspaceId, userId: null as string | null }
    : { userId, workspaceId: null as string | null };
}

export async function ensureBoardColumns(userId: string, workspaceId: string | null) {
  const where = boardColumnScope(userId, workspaceId);
  const existing = await prisma.boardColumn.findMany({
    where,
    orderBy: { position: "asc" },
  });
  if (existing.length > 0) return existing;

  await prisma.boardColumn.createMany({
    data: DEFAULT_BOARD_COLUMNS.map((col) => ({
      name: col.name,
      color: col.color,
      position: col.position,
      status: col.status,
      userId: workspaceId ? null : userId,
      workspaceId: workspaceId ?? null,
    })),
  });

  return prisma.boardColumn.findMany({ where, orderBy: { position: "asc" } });
}

/** Resolve which column a task belongs to for display */
export function resolveTaskColumnId(
  task: { boardColumnId?: string | null; status: TaskStatus },
  columns: { id: string; status: TaskStatus | null }[]
): string | null {
  if (task.boardColumnId && columns.some((c) => c.id === task.boardColumnId)) {
    return task.boardColumnId;
  }
  const byStatus = columns.find((c) => c.status === task.status);
  return byStatus?.id ?? columns[0]?.id ?? null;
}
