/** Rows locked and deleted per statement, so one tick never issues an unbounded delete. */
export const TRASH_PURGE_BATCH_SIZE = 100;

/** Stop after this many batches. The next daily run continues; the job is idempotent. */
export const TRASH_PURGE_MAX_BATCHES = 50;

export type TrashPurgeCandidate = {
  id: string;
  deletedAt: Date | null;
};

/** Prisma filter for soft-deleted rows strictly older than the retention cutoff. */
export function expiredDeletedAtWhere(cutoff: Date) {
  return { not: null, lt: cutoff } as const;
}

/**
 * Oldest rows whose deletedAt is strictly before the cutoff, capped per batch.
 * A timestamp equal to the cutoff stays in Trash until the next instant.
 */
export function selectExpiredTrashIds(
  rows: readonly TrashPurgeCandidate[],
  cutoff: Date,
  limit = TRASH_PURGE_BATCH_SIZE
): string[] {
  const cutoffMs = cutoff.getTime();
  return rows
    .filter((row): row is { id: string; deletedAt: Date } => {
      return row.deletedAt != null && row.deletedAt.getTime() < cutoffMs;
    })
    .sort((a, b) => {
      const byTime = a.deletedAt.getTime() - b.deletedAt.getTime();
      if (byTime !== 0) return byTime;
      return a.id.localeCompare(b.id);
    })
    .slice(0, Math.max(0, limit))
    .map((row) => row.id);
}

/**
 * Tasks that belong to projects about to be hard-deleted.
 * Task.projectId is ON DELETE SET NULL, so these rows must be removed first
 * even when the task itself was never soft-deleted (a trashed project hides them).
 */
export function taskIdsInProjects(
  tasks: readonly { id: string; projectId: string | null }[],
  projectIds: readonly string[],
  limit = TRASH_PURGE_BATCH_SIZE
): string[] {
  const expired = new Set(projectIds);
  const ids: string[] = [];
  for (const task of tasks) {
    if (task.projectId == null || !expired.has(task.projectId)) continue;
    ids.push(task.id);
    if (ids.length >= limit) break;
  }
  return ids;
}
