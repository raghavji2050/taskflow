import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DatabaseBackup, Download } from "lucide-react";
import { auth } from "@/lib/auth";
import { getBackupViewer } from "@/lib/backup-auth";
import { backupStorageAvailable } from "@/lib/backup-store";
import { backupSummary } from "@/lib/backup-service";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { appPageMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";
export const metadata: Metadata = appPageMetadata("Backups", "Off-site database backups stored privately in Taskflow.");

function formatBytes(n: number) {
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function formatIst(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso)) + " IST";
}

export default async function BackupsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const viewer = await getBackupViewer();
  if (!viewer) redirect("/dashboard");

  const data = backupStorageAvailable()
    ? await backupSummary()
    : { backups: [], count: 0, totalBytes: 0, retention: 0, maxTotalBytes: 0, latest: null };
  const latestAgeH = data.latest ? (Date.now() - new Date(data.latest.uploadedAt).getTime()) / 3_600_000 : null;
  const stale = latestAgeH !== null && latestAgeH > 36;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:py-8">
      <PageHeader
        eyebrow="Admin"
        title="Database backups"
        subtitle="Daily off-site copies of the cpdl database, stored privately. Only allow-listed admins can see or download them."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="backup-stats">
        <Card className="p-3">
          <p className="text-xs text-[var(--muted)]">Backups</p>
          <p className="text-lg font-semibold" data-testid="backup-count">{data.count}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-[var(--muted)]">Total size</p>
          <p className="text-lg font-semibold">{formatBytes(data.totalBytes)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-[var(--muted)]">Keeps newest</p>
          <p className="text-lg font-semibold">{data.retention}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-[var(--muted)]">Last backup</p>
          <p className={`text-sm font-semibold ${stale ? "text-red-500" : ""}`} data-testid="backup-latest">
            {data.latest ? (stale ? `Stale · ${Math.round(latestAgeH!)}h ago` : latestAgeH! < 1 ? "Under 1h ago" : `${Math.round(latestAgeH!)}h ago`) : "None yet"}
          </p>
        </Card>
      </div>

      <Card className="overflow-hidden">
        {data.backups.length === 0 ? (
          <EmptyState
            icon={DatabaseBackup}
            testId="backups-empty"
            title="No backups yet"
            description="The cpdl server uploads one after its nightly dump (3:15 AM IST). They will show up here."
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]" data-testid="backup-list">
            {data.backups.map((b) => (
              <li key={b.pathname} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" data-testid="backup-row">
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm font-medium" title={b.filename}>{b.filename}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {formatBytes(b.size)} · uploaded {formatIst(b.uploadedAt)} · {b.source}
                  </p>
                </div>
                <a
                  href={`/api/backups/download?pathname=${encodeURIComponent(b.pathname)}`}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-sm font-medium hover:bg-[var(--surface-hover)]"
                  aria-label={`Download ${b.filename}`}
                  download
                >
                  <Download className="h-4 w-4" aria-hidden="true" /> Download
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
