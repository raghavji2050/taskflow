"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { format, addDays, startOfDay, differenceInDays } from "date-fns";
import type { Task } from "@/components/TaskCard";
import { AssigneeChips } from "@/components/AssigneeChips";
import { cn, getPriorityColor } from "@/lib/utils";
import { timelineDependencyEdges } from "@/lib/timeline-arrows";

type Arrow = { from: string; to: string; d: string; conflict: boolean };

interface TimelineViewProps {
  tasks: Task[];
  onEdit: (task: Task) => void;
}

export function TimelineView({ tasks, onEdit }: TimelineViewProps) {
  const today = startOfDay(new Date());
  const rangeStart = addDays(today, -2);
  const rangeEnd = addDays(today, 14);
  const totalDays = differenceInDays(rangeEnd, rangeStart) + 1;

  const dated = tasks.filter((t) => t.dueDate);
  const undated = tasks.filter((t) => !t.dueDate);

  const edges = timelineDependencyEdges(dated);
  const edgeKey = edges.map((e) => `${e.from}>${e.to}:${e.conflict ? 1 : 0}`).join(",");
  const boxRef = useRef<HTMLDivElement>(null);
  const [arrows, setArrows] = useState<Arrow[]>([]);

  // Measure the real marker positions so arrows line up at any width.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => {
      const origin = box.getBoundingClientRect();
      const rect = (id: string) => box.querySelector<HTMLElement>(`[data-marker-id="${CSS.escape(id)}"]`)?.getBoundingClientRect();
      const next: Arrow[] = [];
      for (const e of edges) {
        const a = rect(e.from);
        const b = rect(e.to);
        if (!a || !b) continue;
        const x1 = a.right - origin.left;
        const y1 = a.top + a.height / 2 - origin.top;
        const x2 = b.left - origin.left - 2;
        const y2 = b.top + b.height / 2 - origin.top;
        const bend = Math.max(16, Math.abs(x2 - x1) / 2);
        next.push({ from: e.from, to: e.to, conflict: e.conflict, d: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}` });
      }
      setArrows(next);
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(box);
    return () => ro?.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edgeKey, tasks]);

  const dayPercent = (date: Date) => {
    const offset = differenceInDays(startOfDay(date), rangeStart);
    return Math.max(0, Math.min(100, (offset / totalDays) * 100));
  };

  return (
    <div className="space-y-4">
      <div className="surface-panel overflow-x-auto rounded-2xl p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]" tabIndex={0} role="region" aria-label="Timeline (scroll sideways)">
        <div className="mb-3 flex min-w-[640px] justify-between text-[10px] text-[var(--muted)]">
          <span>{format(rangeStart, "MMM d")}</span>
          <span>Today</span>
          <span>{format(rangeEnd, "MMM d")}</span>
        </div>
        <div ref={boxRef} data-testid="timeline-rows" className="relative min-w-[640px] space-y-2">
          <div className="absolute bottom-0 top-0 w-px bg-[var(--accent)]/40" style={{ left: `${dayPercent(today)}%` }} />
          {dated.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No tasks with due dates in this range.</p>
          ) : (
            dated.map((task) => {
              const due = new Date(task.dueDate!);
              const left = dayPercent(due);
              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onEdit(task)}
                  className="relative flex w-full items-center gap-2 text-left"
                >
                  <div className="w-32 shrink-0 truncate text-xs font-medium text-[var(--foreground)]">{task.title}</div>
                  <div className="relative h-7 flex-1 rounded-lg bg-[var(--surface-hover)]">
                    <div
                      data-marker-id={task.id}
                      className={cn("absolute top-1/2 h-5 -translate-y-1/2 rounded px-2 text-[10px] font-medium", getPriorityColor(task.priority))}
                      style={{ left: `${left}%`, transform: "translate(-50%, -50%)" }}
                    >
                      {format(due, "MMM d")}
                    </div>
                  </div>
                  {task.assignees && <AssigneeChips assignees={task.assignees} compact />}
                </button>
              );
            })
          )}
          {arrows.length > 0 && (
            <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
              <defs>
                <marker id="tl-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L8,4 L0,8 z" fill="var(--accent)" />
                </marker>
                <marker id="tl-arrow-conflict" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L8,4 L0,8 z" fill="#ef4444" />
                </marker>
              </defs>
              {arrows.map((a) => (
                <path
                  key={`${a.from}>${a.to}`}
                  data-testid="timeline-dependency-arrow"
                  data-from={a.from}
                  data-to={a.to}
                  data-conflict={a.conflict ? "true" : "false"}
                  d={a.d}
                  fill="none"
                  stroke={a.conflict ? "#ef4444" : "var(--accent)"}
                  strokeWidth={1.5}
                  strokeDasharray={a.conflict ? "4 3" : undefined}
                  markerEnd={a.conflict ? "url(#tl-arrow-conflict)" : "url(#tl-arrow)"}
                  opacity={0.85}
                >
                  <title>{a.conflict ? "Due before the task blocking it" : "Blocked by"}</title>
                </path>
              ))}
            </svg>
          )}
        </div>
        {edges.length > 0 && (
          <p className="mt-3 min-w-[640px] text-[10px] text-[var(--muted)]">
            Arrows run from a blocking task to the task waiting on it. Red dashed = due before its blocker.
          </p>
        )}
      </div>

      {undated.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-[var(--muted)]">No due date ({undated.length})</h3>
          <div className="flex flex-wrap gap-2">
            {undated.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onEdit(t)}
                className="inline-flex flex-col items-center gap-2 rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--foreground)]"
              >
                <span>{t.title}</span>
                {t.assignees && t.assignees.length > 0 && (
                  <AssigneeChips assignees={t.assignees} compact />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
