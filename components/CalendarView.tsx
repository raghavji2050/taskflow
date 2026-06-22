"use client";

import { useMemo } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isToday,
} from "date-fns";
import { cn, getPriorityColor, isSameCalendarDay } from "@/lib/utils";
import type { Task } from "@/components/TaskCard";
import { AssigneeChips } from "@/components/AssigneeChips";
import { Card } from "@/components/ui/Card";
import { TaskTimeControls } from "@/components/tasks/TaskTimeControls";
import { formatDurationShort } from "@/lib/time-format";
import type { ActiveTimerEntry } from "@/lib/useActiveTimer";

export interface CalendarTimeBlock {
  id: string;
  taskId: string;
  taskTitle: string;
  startTime: string;
  endTime: string | null;
  duration: number;
  labels?: { id: string; name: string; color: string | null }[];
}

interface CalendarViewProps {
  tasks: Task[];
  month: Date;
  onEdit: (task: Task) => void;
  onDayClick?: (day: Date) => void;
  showCreateHint?: boolean;
  timeBlocks?: CalendarTimeBlock[];
  showTimeBlocks?: boolean;
  canEditTasks?: boolean;
  activeEntry?: ActiveTimerEntry | null;
  activeTimerElapsed?: number;
  onTimerRefresh?: () => void;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarView({
  tasks,
  month,
  onEdit,
  onDayClick,
  showCreateHint = true,
  timeBlocks = [],
  showTimeBlocks = true,
  canEditTasks = false,
  activeEntry = null,
  activeTimerElapsed = 0,
  onTimerRefresh = () => {},
}: CalendarViewProps) {
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    return eachDayOfInterval({
      start: startOfWeek(monthStart),
      end: endOfWeek(monthEnd),
    });
  }, [month]);

  const { scheduled, unscheduled } = useMemo(() => {
    const scheduledTasks = tasks.filter((t) => t.dueDate);
    const unscheduledTasks = tasks.filter((t) => !t.dueDate);
    return { scheduled: scheduledTasks, unscheduled: unscheduledTasks };
  }, [tasks]);

  return (
    <div className="space-y-4">
      {showTimeBlocks && timeBlocks.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--muted)]">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded bg-indigo-200 dark:bg-indigo-900/60" />
            Due dates
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded bg-teal-200 dark:bg-teal-900/60" />
            Logged time
          </span>
        </div>
      )}

      <Card className="overflow-hidden p-4 sm:p-5">
        <h2 className="mb-4 text-center text-lg font-semibold text-[var(--foreground)]">
          {format(month, "MMMM yyyy")}
        </h2>

        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--border)]">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="bg-[var(--surface-1)] px-1 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]"
            >
              {d}
            </div>
          ))}

          {calendarDays.map((day) => {
            const dayTasks = scheduled.filter((t) => isSameCalendarDay(t.dueDate, day));
            const dayBlocks = showTimeBlocks
              ? timeBlocks.filter((b) => isSameCalendarDay(b.startTime, day))
              : [];
            const inMonth = isSameMonth(day, month);
            const today = isToday(day);

            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => onDayClick?.(day)}
                className={cn(
                  "min-h-[5.5rem] bg-[var(--surface-1)] p-1.5 text-left transition-colors",
                  "hover:bg-[var(--surface-hover)]",
                  !inMonth && "bg-[var(--surface-hover)]/50",
                  today && "ring-2 ring-inset ring-[var(--accent)]/40"
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                    today && "bg-[var(--accent)] text-white",
                    !today && inMonth && "text-[var(--foreground)]",
                    !inMonth && "text-[var(--muted)]"
                  )}
                >
                  {format(day, "d")}
                </span>

                <div className="mt-1 space-y-0.5">
                  {dayTasks.slice(0, 2).map((task) => (
                    <span
                      key={task.id}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(task);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          onEdit(task);
                        }
                      }}
                      className={cn(
                        "block w-full rounded px-1 py-0.5 text-left text-[10px] font-medium",
                        getPriorityColor(task.priority)
                      )}
                    >
                      <span className="flex items-center justify-between gap-1">
                        <span className="block truncate">{task.title}</span>
                        {canEditTasks && (
                          <TaskTimeControls
                            taskId={task.id}
                            taskStatus={task.status}
                            activeEntry={activeEntry}
                            elapsed={activeTimerElapsed}
                            onRefresh={onTimerRefresh}
                            variant="compact"
                          />
                        )}
                      </span>
                    </span>
                  ))}
                  {dayTasks.length > 2 && (
                    <span className="block px-1 text-[10px] text-[var(--muted)]">
                      +{dayTasks.length - 2} due
                    </span>
                  )}
                  {dayBlocks.slice(0, 2).map((block) => (
                    <span
                      key={block.id}
                      role="button"
                      tabIndex={0}
                      title={`${block.taskTitle} — ${formatDurationShort(block.duration)}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        const task = tasks.find((t) => t.id === block.taskId);
                        if (task) onEdit(task);
                      }}
                      className="block w-full cursor-default rounded bg-teal-100 px-1 py-0.5 text-left text-[10px] font-medium text-teal-900 dark:bg-teal-950/50 dark:text-teal-200"
                    >
                      <span className="block truncate">{block.taskTitle}</span>
                      <span className="text-[9px] opacity-75">{formatDurationShort(block.duration)}</span>
                    </span>
                  ))}
                  {dayBlocks.length > 2 && (
                    <span className="block px-1 text-[10px] text-teal-600 dark:text-teal-400">
                      +{dayBlocks.length - 2} logged
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {showCreateHint && (
          <p className="mt-3 text-center text-xs text-[var(--muted)]">
            Click a day to add a task with that due date
          </p>
        )}
      </Card>

      {unscheduled.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            No due date ({unscheduled.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {unscheduled.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => onEdit(task)}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-opacity hover:opacity-80",
                  getPriorityColor(task.priority)
                )}
              >
                <span className="flex items-center gap-2">
                  <span className="block truncate">{task.title}</span>
                  {canEditTasks && (
                    <TaskTimeControls
                      taskId={task.id}
                      taskStatus={task.status}
                      activeEntry={activeEntry}
                      elapsed={activeTimerElapsed}
                      onRefresh={onTimerRefresh}
                      variant="compact"
                    />
                  )}
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
