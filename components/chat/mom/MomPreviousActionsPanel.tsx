"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, History, Link2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { linkedTaskToActionItemFields } from "@/lib/mom-action-task";
import { formatMomDateTime, formatMomDueDate } from "@/lib/document-ui";
import type { MomActionItem } from "@/lib/mom-structured";
import type { PreviousMomActionsGroup } from "@/lib/mom-previous-actions";
import { cn, getStatusColor } from "@/lib/utils";

const momStatusLabel: Record<string, string> = {
  pending: "Pending",
  in_progress: "In progress",
  done: "Done",
};

interface MomPreviousActionsPanelProps {
  conversationId: string;
  currentActionItems: MomActionItem[];
  ownerOptions?: { id: string; name: string }[];
  onAdd: (item: MomActionItem) => void;
}

function actionKey(action: { task: string; owner: string; taskId?: string | null }) {
  if (action.taskId) return `task:${action.taskId}`;
  return `text:${action.task.trim().toLowerCase()}|${action.owner.trim().toLowerCase()}`;
}

export function MomPreviousActionsPanel({
  conversationId,
  currentActionItems,
  ownerOptions = [],
  onAdd,
}: MomPreviousActionsPanelProps) {
  const [open, setOpen] = useState(true);
  const [groups, setGroups] = useState<PreviousMomActionsGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingKey, setAddingKey] = useState<string | null>(null);

  const addedKeys = useMemo(
    () => new Set(currentActionItems.filter((a) => a.task.trim()).map(actionKey)),
    [currentActionItems]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetch(`/api/conversations/${conversationId}/mom/previous-actions`)
      .then((res) => res.json())
      .then((data: { groups?: PreviousMomActionsGroup[] }) => {
        if (cancelled) return;
        setGroups(data.groups ?? []);
      })
      .catch(() => {
        if (!cancelled) setGroups([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  const totalActions = groups.reduce((sum, g) => sum + g.actions.length, 0);
  const availableCount = groups.reduce(
    (sum, g) => sum + g.actions.filter((a) => !addedKeys.has(actionKey(a))).length,
    0
  );

  const handleAdd = async (action: PreviousMomActionsGroup["actions"][number]) => {
    const key = actionKey(action);
    if (addedKeys.has(key)) {
      toast.message("Already added to this MoM");
      return;
    }

    setAddingKey(key);
    try {
      const base: MomActionItem = {
        id: crypto.randomUUID(),
        task: action.task,
        owner: action.owner,
        dueDate: action.dueDate,
        priority: action.priority,
        status: action.status,
        taskId: action.taskId,
        createTask: action.taskId ? false : true,
      };

      if (action.taskId) {
        const res = await fetch(`/api/tasks/${action.taskId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load linked task");
        const task = data.task as {
          id: string;
          title: string;
          priority: "LOW" | "MEDIUM" | "HIGH";
          status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
          dueDate: string | null;
          assignees?: { user: { id: string; name: string }; isPrimary: boolean }[];
        };
        onAdd(
          linkedTaskToActionItemFields(
            {
              id: task.id,
              title: task.title,
              priority: task.priority,
              status: task.status,
              dueDate: task.dueDate,
              assignees: task.assignees,
            },
            base,
            ownerOptions
          )
        );
      } else {
        onAdd(base);
      }
      toast.success(action.taskId ? "Linked from previous MoM" : "Added from previous MoM");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add action");
    } finally {
      setAddingKey(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--card-border)] bg-[var(--surface-hover)]/20 px-4 py-3 text-xs text-[var(--muted)]">
        Loading previous meeting actions…
      </div>
    );
  }

  if (totalActions === 0) return null;

  return (
    <section className="rounded-xl border border-[var(--card-border)] bg-[var(--surface-hover)]/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
          <History className="h-4 w-4 text-[var(--accent)]" />
          From previous meetings
          <span className="rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]">
            {availableCount} available
          </span>
        </span>
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-[var(--muted)]" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-[var(--muted)]" />
        )}
      </button>

      {open && (
        <div className="space-y-3 border-t border-[var(--card-border)] px-4 py-3">
          <p className="text-xs text-[var(--muted)]">
            Carry forward or link tasks from earlier MoMs in this chat.
          </p>
          {groups.map((group) => (
            <div
              key={group.momId}
              className="overflow-hidden rounded-lg border border-[var(--card-border)] bg-[var(--background)]"
            >
              <div className="border-b border-[var(--card-border)] bg-[var(--surface-hover)]/50 px-3 py-2">
                <p className="truncate text-xs font-medium text-[var(--foreground)]">{group.title}</p>
                <p className="text-[10px] text-[var(--muted)]">{formatMomDateTime(group.startedAt)}</p>
              </div>
              <ul className="divide-y divide-[var(--card-border)]">
                {group.actions.map((action) => {
                  const key = actionKey(action);
                  const added = addedKeys.has(key);
                  const isDone = action.status === "done";
                  return (
                    <li
                      key={`${group.momId}-${action.sourceActionId}`}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "truncate text-xs font-medium",
                            isDone ? "text-[var(--muted)] line-through" : "text-[var(--foreground)]"
                          )}
                        >
                          {action.task}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-[var(--muted)]">
                          {action.owner && <span>{action.owner}</span>}
                          {action.dueDate && (
                            <span>Due {formatMomDueDate(action.dueDate)}</span>
                          )}
                          <span className="capitalize">{action.priority}</span>
                          <span
                            className={cn(
                              "rounded-full px-1.5 py-0.5 font-medium capitalize",
                              getStatusColor(
                                action.status === "done"
                                  ? "COMPLETED"
                                  : action.status === "in_progress"
                                    ? "IN_PROGRESS"
                                    : "PENDING"
                              )
                            )}
                          >
                            {momStatusLabel[action.status] ?? action.status}
                          </span>
                          {action.taskId && (
                            <span className="text-[var(--accent)]">Has linked task</span>
                          )}
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={added || addingKey === key}
                        isLoading={addingKey === key}
                        onClick={() => void handleAdd(action)}
                        className="shrink-0 gap-1 text-xs"
                      >
                        {action.taskId ? (
                          <Link2 className="h-3 w-3" />
                        ) : (
                          <Plus className="h-3 w-3" />
                        )}
                        {added ? "Added" : action.taskId ? "Link" : "Add"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
