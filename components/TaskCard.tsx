"use client";

import { Calendar, Clock, Pencil, Trash2, Archive, ArchiveRestore, MessageSquare, Eye } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AssigneeChips, type TaskAssigneeUser } from "@/components/AssigneeChips";
import { TaskTimeControls } from "@/components/tasks/TaskTimeControls";
import type { ActiveTimerEntry } from "@/lib/useActiveTimer";
import {
  cn, formatDueDateTime, formatRelativeDate, getPriorityClass,
  getPriorityColor, getStatusColor, isOverdue,
} from "@/lib/utils";

export interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH";
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  dueDate: string | null;
  archived?: boolean;
  categoryId?: string | null;
  boardColumnId?: string | null;
  recurrenceRule?: string | null;
  estimatedMinutes?: number | null;
  createdAt: string;
  updatedAt: string;
  category?: { id: string; name: string; color: string } | null;
  workspaceId?: string | null;
  canEdit?: boolean;
  assignees?: TaskAssigneeUser[];
  user?: { id: string; name: string } | null;
  workspace?: { id: string; name: string } | null;
  tags?: { tag: { id: string; name: string } }[];
  subtasks?: { id: string; title: string; completed: boolean }[];
  _count?: { comments: number; attachments: number };
}

interface TaskCardProps {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onArchive: (task: Task) => void;
  onToggleStatus: (task: Task) => void;
  isUpdating?: boolean;
  selected?: boolean;
  onSelect?: (taskId: string, selected: boolean) => void;
  bulkMode?: boolean;
  showMeta?: boolean;
  readOnly?: boolean;
  showWorkspace?: boolean;
  showTimeControls?: boolean;
  activeTimer?: ActiveTimerEntry | null;
  activeTimerElapsed?: number;
  onTimerRefresh?: () => void;
}

export function TaskCard({
  task, onEdit, onDelete, onArchive, onToggleStatus,
  isUpdating = false, selected, onSelect, bulkMode, showMeta = false, readOnly = false, showWorkspace = false,
  showTimeControls = false, activeTimer = null, activeTimerElapsed = 0, onTimerRefresh,
}: TaskCardProps) {
  const overdue = isOverdue(task.dueDate, task.status);
  const isCompleted = task.status === "COMPLETED";
  const subtaskDone = task.subtasks?.filter((s) => s.completed).length ?? 0;
  const subtaskTotal = task.subtasks?.length ?? 0;
  const isTimerActiveOnTask = Boolean(
    activeTimer?.isRunning &&
      (activeTimer.taskId === task.id || activeTimer.task?.id === task.id)
  );

  return (
    <div className={cn("task-row group flex gap-0 overflow-hidden rounded-xl", getPriorityClass(task.priority), isCompleted && "opacity-70", selected && "ring-2 ring-[var(--accent)]")}>
      <div className="task-priority-bar my-3 ml-3" />

      <div className="flex flex-1 items-start gap-3 p-3 pl-2 sm:items-center sm:p-4 sm:pl-3">
        {bulkMode && onSelect && (
          <input type="checkbox" checked={selected} onChange={(e) => onSelect(task.id, e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-zinc-300" />
        )}

        <button type="button" onClick={() => !readOnly && onToggleStatus(task)} disabled={isUpdating || readOnly}
          className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all sm:mt-0",
            isCompleted ? "border-emerald-500 bg-emerald-500 text-white" : task.status === "IN_PROGRESS" ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--card-border)] hover:border-[var(--accent)]")}
          aria-label="Cycle status">
          {isCompleted && <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
          {task.status === "IN_PROGRESS" && <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={cn("text-sm font-semibold text-zinc-900 dark:text-zinc-50", isCompleted && "line-through decoration-zinc-400")}>{task.title}</h3>
            <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", getPriorityColor(task.priority))}>{task.priority}</span>
            <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", getStatusColor(task.status))}>{task.status.replace("_", " ")}</span>
            {task.category && (
              <span className="rounded-md px-1.5 py-0.5 text-[10px] font-medium" style={{ background: `${task.category.color}20`, color: task.category.color }}>{task.category.name}</span>
            )}
            {showWorkspace && task.workspace && (
              <span className="rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-400">
                {task.workspace.name}
              </span>
            )}
          </div>

          {task.description && <p className="mt-1 line-clamp-1 text-xs text-zinc-500">{task.description}</p>}

          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-zinc-400">
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span className={overdue ? "font-medium text-red-500" : ""}>{formatDueDateTime(task.dueDate)}{overdue && " · overdue"}</span>
            </span>
            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{formatRelativeDate(task.createdAt)}</span>
            {subtaskTotal > 0 && <span>{subtaskDone}/{subtaskTotal} subtasks</span>}
            {(task._count?.comments ?? 0) > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <MessageSquare className="h-3 w-3" />{task._count?.comments}
              </span>
            )}
            {task.recurrenceRule && <span className="text-indigo-400">↻ {task.recurrenceRule.toLowerCase()}</span>}
            {showMeta && task.user && <span>by {task.user.name}</span>}
          </div>
          {showMeta && task.assignees && task.assignees.length > 0 && (
            <div className="mt-1.5">
              <AssigneeChips assignees={task.assignees} compact />
            </div>
          )}

          {task.tags && task.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {task.tags.map(({ tag }) => (
                <span key={tag.id} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800">#{tag.name}</span>
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {showTimeControls && onTimerRefresh && (
            <div
              className={cn(
                "transition-opacity max-sm:opacity-100",
                isTimerActiveOnTask ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              )}
            >
              <TaskTimeControls
                taskId={task.id}
                taskStatus={task.status}
                readOnly={readOnly}
                activeEntry={activeTimer}
                elapsed={activeTimerElapsed}
                onRefresh={onTimerRefresh}
              />
            </div>
          )}
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 max-sm:opacity-100">
          <Button variant="ghost" size="sm" onClick={() => onEdit(task)} className="h-7 w-7 p-0" aria-label={readOnly ? "View task" : "Edit task"}>
            {readOnly ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
          </Button>
          {!readOnly && (
            <>
            <Button variant="ghost" size="sm" onClick={() => onArchive(task)} className="h-7 w-7 p-0" aria-label={task.archived ? "Unarchive" : "Archive"}>
              {task.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onDelete(task)} className="h-7 w-7 p-0 text-red-500 hover:bg-red-500/10"><Trash2 className="h-3.5 w-3.5" /></Button>
            </>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
