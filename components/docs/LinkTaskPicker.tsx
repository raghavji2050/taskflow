"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckSquare2 } from "lucide-react";
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

interface LinkTaskPickerProps {
  workspaceId?: string | null;
  linkedTaskIds: string[];
  onLink: (taskId: string) => void | Promise<void>;
  disabled?: boolean;
}

const statusLabel: Record<string, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In progress",
  COMPLETED: "Done",
};

export function LinkTaskPicker({
  workspaceId,
  linkedTaskIds,
  onLink,
  disabled,
}: LinkTaskPickerProps) {
  const [query, setQuery] = useState("");
  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  const linkedSet = new Set(linkedTaskIds);

  const fetchTasks = useCallback(async (search: string) => {
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
        (data.tasks as TaskOption[]).filter((t) => !linkedSet.has(t.id))
      );
    } finally {
      setLoading(false);
    }
  }, [workspaceId, linkedTaskIds.join(",")]);

  useEffect(() => {
    const t = setTimeout(() => void fetchTasks(query), 300);
    return () => clearTimeout(t);
  }, [query, fetchTasks]);

  const handlePick = async (taskId: string) => {
    setLinkingId(taskId);
    try {
      await onLink(taskId);
      setQuery("");
      void fetchTasks("");
    } finally {
      setLinkingId(null);
    }
  };

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-dashed border-[var(--card-border)] bg-[var(--surface-hover)]/40 p-3">
      <LinkSearchInput
        value={query}
        onChange={setQuery}
        placeholder="Search tasks to link…"
        disabled={disabled}
      />
      <LinkPickerHint>Pick a task below to attach it to this doc</LinkPickerHint>
      <LinkPickerList>
        <LinkPickerScroll>
          {loading && <LinkPickerLoading />}
          {!loading && tasks.length === 0 && (
            <LinkPickerEmpty
              message={query.trim() ? "No tasks match your search" : "No tasks available to link"}
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
