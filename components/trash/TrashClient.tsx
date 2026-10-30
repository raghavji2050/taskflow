"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { FolderKanban, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/Button";
import { PageLoader } from "@/components/ui/PageLoader";
import { TRASH_RETENTION_DAYS, trashPurgeLabel } from "@/lib/trash-policy";
import { formatRelativeDate } from "@/lib/utils";

type TrashItem = {
  kind: "task" | "project";
  id: string;
  title: string;
  deletedAt: string;
  detail: string | null;
  canRestore: boolean;
  canPurge: boolean;
};

export function TrashClient() {
  const router = useRouter();
  const { status } = useSession();
  const { selectedWorkspaceId, selectedWorkspace, isPersonal } = useWorkspace();
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<{ key: string; action: "restore" | "purge" } | null>(null);

  const endpoint = selectedWorkspaceId
    ? `/api/workspaces/${selectedWorkspaceId}/trash`
    : "/api/trash";

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    setLoading(true);
    setItems([]);
    void (async () => {
      const res = await fetch(endpoint);
      const data = await res.json();
      if (cancelled) return;
      if (!res.ok) {
        toast.error(data.error ?? "Could not load trash");
        setItems([]);
      } else {
        setItems(data.items ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [status, endpoint]);

  const runAction = async (item: TrashItem, action: "restore" | "purge") => {
    if (action === "purge") {
      const noun = item.kind === "project" ? "project and its tasks" : "task";
      const ok = window.confirm(`Permanently delete this ${noun}? This cannot be undone.`);
      if (!ok) return;
    }
    const key = `${item.kind}:${item.id}`;
    setPending({ key, action });
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, kind: item.kind, id: item.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not update trash");
      toast.success(action === "restore" ? "Restored" : "Permanently deleted");
      setItems((current) => current.filter((entry) => !(entry.kind === item.kind && entry.id === item.id)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update trash");
    } finally {
      setPending(null);
    }
  };

  if (status === "loading" || (status === "authenticated" && loading && items.length === 0)) {
    return <PageLoader />;
  }

  const projects = items.filter((item) => item.kind === "project");
  const tasks = items.filter((item) => item.kind === "task");

  return (
    <div>
      <PageHeader
        eyebrow={isPersonal ? "Personal" : selectedWorkspace?.name}
        title="Trash"
        subtitle={`Deleted tasks and projects stay here for ${TRASH_RETENTION_DAYS} days. Restoring a project brings its tasks back.`}
      />

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--card-border)] py-16 text-center text-sm text-[var(--muted)]">
          Trash is empty.
        </div>
      ) : (
        <div className="space-y-8">
          {projects.length > 0 && (
            <TrashSection title="Projects" items={projects} pending={pending} onAction={runAction} />
          )}
          {tasks.length > 0 && (
            <TrashSection title="Tasks" items={tasks} pending={pending} onAction={runAction} />
          )}
        </div>
      )}
    </div>
  );
}

function TrashSection({
  title,
  items,
  pending,
  onAction,
}: {
  title: string;
  items: TrashItem[];
  pending: { key: string; action: "restore" | "purge" } | null;
  onAction: (item: TrashItem, action: "restore" | "purge") => void;
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-[var(--foreground)]">{title}</h2>
      <ul className="space-y-2">
        {items.map((item) => {
          const purgeLabel = trashPurgeLabel(item.deletedAt);
          const key = `${item.kind}:${item.id}`;
          const busy = pending?.key === key;
          return (
            <li
              key={`${item.kind}:${item.id}`}
              className="surface-panel flex flex-col gap-3 rounded-2xl border border-[var(--border)] p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {item.kind === "project" ? (
                    <FolderKanban className="h-4 w-4 shrink-0 text-[var(--muted)]" aria-hidden="true" />
                  ) : (
                    <Trash2 className="h-4 w-4 shrink-0 text-[var(--muted)]" aria-hidden="true" />
                  )}
                  <h3 className="truncate text-sm font-semibold">{item.title}</h3>
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Deleted {formatRelativeDate(item.deletedAt)}
                  {item.detail ? ` · ${item.detail}` : ""}
                  {" · "}
                  {purgeLabel}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!item.canRestore || busy}
                  title={item.canRestore ? "Restore" : "You do not have permission to restore this"}
                  isLoading={busy && pending?.action === "restore"}
                  onClick={() => onAction(item, "restore")}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Restore
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={!item.canPurge || busy}
                  title={item.canPurge ? "Delete forever" : "You do not have permission to delete this"}
                  onClick={() => onAction(item, "purge")}
                >
                  Delete forever
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
