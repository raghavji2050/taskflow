"use client";

import { useEffect, useMemo, useState } from "react";
import { Link2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { linkedTaskToActionItemFields } from "@/lib/mom-action-task";
import { formatMomDateTime } from "@/lib/document-ui";
import type { MomActionItem } from "@/lib/mom-structured";
import type { PreviousMomActionsGroup } from "@/lib/mom-previous-actions";
import { cn, getStatusColor } from "@/lib/utils";
import {
  LinkPickerEmpty,
  LinkPickerList,
  LinkPickerLoading,
  LinkPickerScroll,
} from "@/components/docs/link-picker-ui";

const momStatusLabel: Record<string, string> = {
  pending: "Pending",
  in_progress: "In progress",
  done: "Done",
};

export function previousActionKey(action: {
  task: string;
  owner: string;
  taskId?: string | null;
}) {
  if (action.taskId) return `task:${action.taskId}`;
  return `text:${action.task.trim().toLowerCase()}|${action.owner.trim().toLowerCase()}`;
}

interface MomPreviousActionPickerProps {
  conversationId: string;
  excludeKeys?: string[];
  ownerOptions?: { id: string; name: string }[];
  onSelect: (item: MomActionItem) => void;
}

export function MomPreviousActionPicker({
  conversationId,
  excludeKeys = [],
  ownerOptions = [],
  onSelect,
}: MomPreviousActionPickerProps) {
  const [groups, setGroups] = useState<PreviousMomActionsGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickingKey, setPickingKey] = useState<string | null>(null);

  const excludeSet = useMemo(() => new Set(excludeKeys), [excludeKeys.join(",")]);

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

  const flatActions = useMemo(
    () =>
      groups.flatMap((group) =>
        group.actions.map((action) => ({
          ...action,
          momTitle: group.title,
          momStartedAt: group.startedAt,
          momId: group.momId,
        }))
      ),
    [groups]
  );

  const available = flatActions.filter((a) => !excludeSet.has(previousActionKey(a)));

  const handlePick = async (action: (typeof flatActions)[number]) => {
    const key = previousActionKey(action);
    setPickingKey(key);
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
        onSelect(
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
        onSelect(base);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add action");
    } finally {
      setPickingKey(null);
    }
  };

  return (
    <div className="rounded-lg border border-[var(--card-border)] bg-[var(--surface-hover)]/30 p-2.5">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        Pick from previous meetings
      </p>
      <LinkPickerList>
        <div className="max-h-48 overflow-y-auto">
          <LinkPickerScroll>
          {loading && <LinkPickerLoading />}
          {!loading && available.length === 0 && (
            <LinkPickerEmpty message="No previous actions available" />
          )}
          {!loading &&
            available.map((action) => {
              const key = previousActionKey(action);
              const isDone = action.status === "done";
              return (
                <button
                  key={`${action.momId}-${action.sourceActionId}`}
                  type="button"
                  disabled={pickingKey === key}
                  onClick={() => void handlePick(action)}
                  className={cn(
                    "flex w-full items-start justify-between gap-2 border-b border-[var(--card-border)] px-2 py-2.5 text-left last:border-0",
                    "hover:bg-[var(--surface-hover)] disabled:opacity-60"
                  )}
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
                    <p className="mt-0.5 truncate text-[10px] text-[var(--muted)]">
                      {action.momTitle} · {formatMomDateTime(action.momStartedAt)}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-[var(--muted)]">
                      {action.owner && <span>{action.owner}</span>}
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 font-medium",
                          getStatusColor(
                            action.status === "done"
                              ? "COMPLETED"
                              : action.status === "in_progress"
                                ? "IN_PROGRESS"
                                : "PENDING"
                          )
                        )}
                      >
                        {momStatusLabel[action.status]}
                      </span>
                    </div>
                  </div>
                  <span className="shrink-0 pt-0.5 text-[var(--muted)]">
                    {pickingKey === key ? (
                      <span className="text-[10px]">…</span>
                    ) : action.taskId ? (
                      <Link2 className="h-3.5 w-3.5" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                  </span>
                </button>
              );
            })}
          </LinkPickerScroll>
        </div>
      </LinkPickerList>
    </div>
  );
}
