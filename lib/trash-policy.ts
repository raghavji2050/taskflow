export const TRASH_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export function trashPurgeCutoff(now: Date, retentionDays = TRASH_RETENTION_DAYS): Date {
  return new Date(now.getTime() - retentionDays * DAY_MS);
}

export function trashPurgeAt(deletedAt: Date, retentionDays = TRASH_RETENTION_DAYS): Date {
  return new Date(deletedAt.getTime() + retentionDays * DAY_MS);
}

/** Label shown in Trash, e.g. "Deletes on Nov 27, 2026" (deletedAt + retention, matches the purge cron). */
export function trashPurgeLabel(deletedAt: Date | string, retentionDays = TRASH_RETENTION_DAYS): string {
  const at = trashPurgeAt(new Date(deletedAt), retentionDays);
  const date = at.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `Deletes on ${date}`;
}

/** A task is visible when it is not in Trash and its project is not in Trash. */
export function isTaskVisible(task: {
  deletedAt: Date | string | null;
  projectDeletedAt?: Date | string | null;
}): boolean {
  return task.deletedAt == null && (task.projectDeletedAt ?? null) == null;
}
