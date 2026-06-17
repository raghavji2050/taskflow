"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckSquare2, Link2, X } from "lucide-react";
import { cn, getStatusColor } from "@/lib/utils";
import {
  LinkPickerEmpty,
  LinkPickerHint,
  LinkPickerList,
  LinkPickerLoading,
  LinkPickerRow,
  LinkPickerScroll,
  LinkSearchInput,
} from "@/components/docs/link-picker-ui";

interface TaskOption {
  id: string;
  title: string;
  status: string;
}

interface MomActionTaskPickerProps {
  workspaceId?: string | null;
  excludeTaskIds?: string[];
  disabled?: boolean;
  defaultOpen?: boolean;
  onSelect: (taskId: string) => void | Promise<void>;
}

const statusLabel: Record<string, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In progress",
  COMPLETED: "Done",
};

export function MomActionTaskPicker({
  workspaceId,
  excludeTaskIds = [],
  disabled,
  defaultOpen = false,
  onSelect,
}: MomActionTaskPickerProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState("");
  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  const excludeSet = new Set(excludeTaskIds);

  const fetchTasks = useCallback(
    async (search: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          archived: "false",
          limit: "15",
          page: "1",
        });
        if (workspaceId) params.set("workspaceId", workspaceId);
        if (search.trim()) params.set("search", search.trim());

        const res = await fetch(`/api/tasks?${params}`);
        const data = await res.json();
        if (!res.ok) {
          setTasks([]);
          return;
        }
        setTasks(
          (data.tasks as TaskOption[]).filter((t) => !excludeSet.has(t.id))
        );
      } finally {
        setLoading(false);
      }
    },
    [workspaceId, excludeTaskIds.join(",")]
  );

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void fetchTasks(query), 300);
    return () => clearTimeout(t);
  }, [query, fetchTasks, open]);

  const handlePick = async (taskId: string) => {
    setLinkingId(taskId);
    try {
      await onSelect(taskId);
      setOpen(false);
      setQuery("");
    } finally {
      setLinkingId(null);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--card-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--muted)] transition-colors hover:border-[var(--accent)]/40 hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] disabled:opacity-50"
      >
        <Link2 className="h-3.5 w-3.5" />
        Link existing task
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--card-border)] bg-[var(--surface-hover)]/30 p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          Link existing task
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded p-1 text-[var(--muted)] hover:bg-[var(--card)] hover:text-[var(--foreground)]"
          aria-label="Close task picker"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <LinkSearchInput
        value={query}
        onChange={setQuery}
        placeholder="Search tasks…"
        disabled={disabled}
      />
      <LinkPickerHint>Status, priority, and due date will sync from the task</LinkPickerHint>
      <LinkPickerList>
        <LinkPickerScroll>
          {loading && <LinkPickerLoading />}
          {!loading && tasks.length === 0 && (
            <LinkPickerEmpty
              message={query.trim() ? "No tasks match your search" : "No tasks available"}
            />
          )}
          {!loading &&
            tasks.map((task) => (
              <LinkPickerRow
                key={task.id}
                disabled={disabled}
                linking={linkingId === task.id}
                onClick={() => void handlePick(task.id)}
              >
                <div className="flex items-center gap-2">
                  <CheckSquare2 className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                  <span className="truncate text-xs font-medium text-[var(--foreground)]">
                    {task.title}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                      getStatusColor(task.status)
                    )}
                  >
                    {statusLabel[task.status] ?? task.status}
                  </span>
                </div>
              </LinkPickerRow>
            ))}
        </LinkPickerScroll>
      </LinkPickerList>
    </div>
  );
}
