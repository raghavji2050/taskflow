"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2, Lock, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

type DepTask = { id: string; title: string; status: string };
type Deps = { blockedBy: DepTask[]; blocking: DepTask[]; openBlockerCount: number };

/** "Blocked by" / "Blocking" links for a task, with a search box to add a blocker. */
export function TaskDependencies({
  taskId,
  workspaceId,
  readOnly = false,
}: {
  taskId: string;
  workspaceId: string | null;
  readOnly?: boolean;
}) {
  const [deps, setDeps] = useState<Deps>({ blockedBy: [], blocking: [], openBlockerCount: 0 });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DepTask[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tasks/${taskId}/dependencies`);
    if (res.ok) setDeps(await res.json());
  }, [taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      const params = new URLSearchParams({ search: q, limit: "8" });
      if (workspaceId) params.set("workspaceId", workspaceId);
      const res = await fetch(`/api/tasks?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      const taken = new Set([taskId, ...deps.blockedBy.map((d) => d.id)]);
      setResults(((data.tasks ?? []) as DepTask[]).filter((t) => !taken.has(t.id)));
    }, 250);
    return () => clearTimeout(handle);
  }, [query, workspaceId, taskId, deps.blockedBy]);

  const add = async (dependsOnId: string) => {
    setBusy(true);
    const res = await fetch(`/api/tasks/${taskId}/dependencies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dependsOnId }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Could not add blocker");
      return;
    }
    setDeps(data);
    setQuery("");
    setResults([]);
  };

  const remove = async (dependsOnId: string) => {
    const res = await fetch(
      `/api/tasks/${taskId}/dependencies?dependsOnId=${encodeURIComponent(dependsOnId)}`,
      { method: "DELETE" }
    );
    if (res.ok) setDeps(await res.json());
    else toast.error("Could not remove blocker");
  };

  const row = (t: DepTask, onRemove?: () => void) => (
    <li key={t.id} className="flex items-center gap-2 rounded-lg bg-[var(--surface-hover)] px-3 py-1.5 text-sm">
      <span
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          t.status === "COMPLETED" ? "bg-emerald-500" : t.status === "IN_PROGRESS" ? "bg-amber-500" : "bg-slate-400"
        )}
        aria-hidden
      />
      <span className={cn("min-w-0 flex-1 truncate", t.status === "COMPLETED" && "text-[var(--muted)] line-through")}>
        {t.title}
      </span>
      {onRemove && !readOnly && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove blocker ${t.title}`}
          className="rounded p-0.5 text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
  );

  return (
    <div className="mt-4 border-t border-[var(--card-border)] pt-4" data-testid="task-dependencies">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[var(--muted)]">
        <Link2 className="h-3.5 w-3.5" /> Dependencies
      </p>
      {deps.openBlockerCount > 0 && (
        <p
          role="status"
          className="mb-2 flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400"
        >
          <Lock className="h-3.5 w-3.5" />
          Blocked: waiting on {deps.openBlockerCount} open task{deps.openBlockerCount === 1 ? "" : "s"}
        </p>
      )}
      <p className="mb-1 text-xs text-[var(--muted)]">Blocked by</p>
      {deps.blockedBy.length === 0 ? (
        <p className="mb-2 text-xs text-[var(--muted)]">Nothing is blocking this task</p>
      ) : (
        <ul className="mb-2 space-y-1">{deps.blockedBy.map((t) => row(t, () => remove(t.id)))}</ul>
      )}
      {!readOnly && (
        <div className="relative mb-3">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Add a blocking task (type to search)"
            aria-label="Add a blocking task"
            className="h-9 text-sm"
            disabled={busy}
          />
          {results.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-1 shadow-lg" role="listbox">
              {results.map((t) => (
                <li key={t.id}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start truncate"
                    onClick={() => add(t.id)}
                    role="option"
                    aria-selected={false}
                  >
                    {t.title}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {deps.blocking.length > 0 && (
        <>
          <p className="mb-1 text-xs text-[var(--muted)]">Blocking</p>
          <ul className="space-y-1">{deps.blocking.map((t) => row(t))}</ul>
        </>
      )}
    </div>
  );
}
