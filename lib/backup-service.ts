import { backupConfig } from "@/lib/backup-rules";
import { selectBackupsToPrune } from "@/lib/backup-rules";
import { deleteBackups, listBackups, publicBackup } from "@/lib/backup-store";

/** Apply retention to one source; returns what was removed and what's left. */
export async function pruneBackups(source: string) {
  const { retention, maxTotalBytes } = backupConfig();
  const items = await listBackups(source);
  const prune = selectBackupsToPrune(items, retention, maxTotalBytes);
  await deleteBackups(prune);
  const left = items.length - prune.length;
  return { pruned: prune.map((p) => p.filename), kept: left, retention, maxTotalBytes };
}

export async function backupSummary(source?: string) {
  const items = await listBackups(source);
  const totalBytes = items.reduce((n, i) => n + i.size, 0);
  const cfg = backupConfig();
  return {
    backups: items.map(publicBackup),
    count: items.length,
    totalBytes,
    retention: cfg.retention,
    maxTotalBytes: cfg.maxTotalBytes,
    latest: items[0] ? publicBackup(items[0]) : null,
  };
}
