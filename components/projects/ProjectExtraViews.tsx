"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, CircleDot, ListTodo, Users } from "lucide-react";
import type { Task } from "@/components/TaskCard";
import { Button } from "@/components/ui/Button";
import { dayKey, projectStats } from "@/lib/project-stats";
import { cn, getPriorityColor } from "@/lib/utils";

type Section = { id: string; name: string; position: number };

function Stat({ label, value, icon: Icon, tone, testId }: { label: string; value: number | string; icon: React.ComponentType<{ className?: string }>; tone?: string; testId?: string }) {
  return (
    <div className="surface-panel rounded-xl border border-[var(--border)] p-4">
      <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
        <Icon className={cn("h-4 w-4", tone)} />
        {label}
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--foreground)]" data-testid={testId}>{value}</p>
    </div>
  );
}

export function ProjectOverview({ tasks, sections, color, onOpenSection }: { tasks: Task[]; sections: Section[]; color: string; onOpenSection: () => void }) {
  const ordered = [...sections].sort((a, b) => a.position - b.position);
  const stats = useMemo(() => projectStats(tasks, ordered), [tasks, ordered]);
  return (
    <div className="space-y-4" data-testid="project-overview">
      <div className="surface-panel rounded-2xl border border-[var(--border)] p-5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Progress</h2>
          <span className="text-sm tabular-nums text-[var(--muted)]" data-testid="overview-percent">{stats.percent}% done</span>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[var(--surface-hover)]" role="progressbar" aria-label="Project progress" aria-valuenow={stats.percent} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full transition-all" style={{ width: `${stats.percent}%`, backgroundColor: color }} />
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">
          {stats.done} of {stats.total} tasks complete · {stats.inProgress} in progress · {stats.pending} to do
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total tasks" value={stats.total} icon={ListTodo} testId="overview-total" />
        <Stat label="Overdue" value={stats.overdue} icon={AlertTriangle} tone={stats.overdue ? "text-red-500" : undefined} testId="overview-overdue" />
        <Stat label="Due today" value={stats.dueToday} icon={CalendarClock} testId="overview-today" />
        <Stat label="Completed" value={stats.done} icon={CheckCircle2} tone="text-emerald-500" testId="overview-done" />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="surface-panel rounded-2xl border border-[var(--border)] p-5">
          <h3 className="mb-3 text-sm font-semibold text-[var(--foreground)]">By section</h3>
          <ul className="space-y-3">
            {stats.bySection.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={onOpenSection} className="w-full text-left">
                  <div className="flex justify-between text-xs">
                    <span className="truncate font-medium text-[var(--foreground)]">{s.name}</span>
                    <span className="tabular-nums text-[var(--muted)]">{s.done}/{s.total}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--surface-hover)]">
                    <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${s.total ? (s.done / s.total) * 100 : 0}%` }} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="surface-panel rounded-2xl border border-[var(--border)] p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]"><Users className="h-4 w-4" /> Open work by person</h3>
          {stats.workload.length === 0 && stats.unassigned === 0 ? (
            <p className="text-xs text-[var(--muted)]">Nothing open right now.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {stats.workload.map((p) => (
                <li key={p.name} className="flex justify-between"><span className="truncate">{p.name}</span><span className="tabular-nums text-[var(--muted)]">{p.open}</span></li>
              ))}
              {stats.unassigned > 0 && (
                <li className="flex justify-between text-[var(--muted)]"><span>Unassigned</span><span className="tabular-nums">{stats.unassigned}</span></li>
              )}
            </ul>
          )}
          {stats.noDate > 0 && <p className="mt-3 text-xs text-[var(--muted)]">{stats.noDate} open task{stats.noDate === 1 ? "" : "s"} without a due date.</p>}
        </div>
      </div>
    </div>
  );
}

function TaskChip({ task, onOpen }: { task: Task; onOpen: (task: Task) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(task)}
      className={cn(
        "block w-full truncate rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium",
        getPriorityColor(task.priority),
        task.status === "COMPLETED" && "line-through opacity-60"
      )}
      title={task.title}
    >
      {task.title}
    </button>
  );
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function keyOf(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ProjectCalendar({ tasks, onOpen }: { tasks: Task[]; onOpen: (task: Task) => void }) {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const k = dayKey(t.dueDate);
      map.set(k, [...(map.get(k) ?? []), t]);
    }
    return map;
  }, [tasks]);
  const start = new Date(month);
  start.setDate(1 - ((month.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const todayKey = keyOf(new Date());
  const undated = tasks.filter((t) => !t.dueDate && t.status !== "COMPLETED");
  const monthLabel = month.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const agenda = days.filter((d) => d.getMonth() === month.getMonth() && byDay.has(keyOf(d)));

  return (
    <div data-testid="project-calendar" className="space-y-3">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
        <h2 className="min-w-[9rem] text-center text-sm font-semibold">{monthLabel}</h2>
        <Button size="sm" variant="secondary" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
        <Button size="sm" variant="ghost" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Today</Button>
      </div>
      {/* Grid on larger screens, agenda list on phones. */}
      <div className="hidden overflow-hidden rounded-xl border border-[var(--border)] sm:block">
        <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--surface-hover)] text-center text-[11px] font-medium text-[var(--muted)]">
          {WEEKDAYS.map((d) => <div key={d} className="py-1.5">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const k = keyOf(d);
            const list = byDay.get(k) ?? [];
            return (
              <div key={k} className={cn("min-h-[92px] border-b border-r border-[var(--border)] p-1", d.getMonth() !== month.getMonth() && "bg-[var(--surface-hover)]/40 opacity-60")}>
                <div className={cn("mb-1 text-right text-[11px] tabular-nums", k === todayKey ? "font-bold text-[var(--accent)]" : "text-[var(--muted)]")}>{d.getDate()}</div>
                <div className="space-y-0.5">
                  {list.slice(0, 3).map((t) => <TaskChip key={t.id} task={t} onOpen={onOpen} />)}
                  {list.length > 3 && <p className="px-1 text-[10px] text-[var(--muted)]">+{list.length - 3} more</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="space-y-2 sm:hidden">
        {agenda.length === 0 && <p className="py-6 text-center text-xs text-[var(--muted)]">No due dates this month.</p>}
        {agenda.map((d) => (
          <div key={keyOf(d)} className="surface-panel rounded-xl border border-[var(--border)] p-3">
            <p className="mb-1.5 text-xs font-semibold">{d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</p>
            <div className="space-y-1">{(byDay.get(keyOf(d)) ?? []).map((t) => <TaskChip key={t.id} task={t} onOpen={onOpen} />)}</div>
          </div>
        ))}
      </div>
      {undated.length > 0 && (
        <p className="text-xs text-[var(--muted)]">{undated.length} open task{undated.length === 1 ? "" : "s"} without a due date (see List or Board).</p>
      )}
    </div>
  );
}

export function ProjectTimeline({ tasks, sections, onOpen }: { tasks: Task[]; sections: Section[]; onOpen: (task: Task) => void }) {
  const dated = tasks.filter((t) => t.dueDate).sort((a, b) => dayKey(a.dueDate!).localeCompare(dayKey(b.dueDate!)));
  const todayKey = keyOf(new Date());
  const groups = new Map<string, Task[]>();
  for (const t of dated) {
    const k = dayKey(t.dueDate!);
    const label = t.status !== "COMPLETED" && k < todayKey ? "Overdue" : k === todayKey ? "Today" : k.slice(0, 7);
    groups.set(label, [...(groups.get(label) ?? []), t]);
  }
  const sectionName = (id?: string | null) => sections.find((s) => s.id === id)?.name ?? "";
  const labelFor = (g: string) => (/^\d{4}-\d{2}$/.test(g) ? new Date(`${g}-01T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : g);
  return (
    <div data-testid="project-timeline" className="space-y-4">
      {dated.length === 0 && <p className="rounded-xl border border-dashed border-[var(--border)] py-12 text-center text-sm text-[var(--muted)]">Add due dates to see tasks on the timeline.</p>}
      {[...groups.entries()].map(([g, list]) => (
        <div key={g}>
          <h3 className={cn("mb-2 text-xs font-semibold uppercase tracking-wide", g === "Overdue" ? "text-red-500" : "text-[var(--muted)]")}>{labelFor(g)}</h3>
          <ol className="relative space-y-2 border-l border-[var(--border)] pl-4">
            {list.map((t) => (
              <li key={t.id} className="relative">
                <CircleDot className={cn("absolute -left-[23px] top-2.5 h-3.5 w-3.5 bg-[var(--background)]", t.status === "COMPLETED" ? "text-emerald-500" : "text-[var(--accent)]")} />
                <button type="button" onClick={() => onOpen(t)} className="surface-panel flex w-full items-center gap-3 rounded-xl border border-[var(--border)] px-3 py-2 text-left hover:bg-[var(--surface-hover)]">
                  <span className="w-20 shrink-0 text-xs tabular-nums text-[var(--muted)]">{new Date(`${dayKey(t.dueDate!)}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
                  <span className={cn("min-w-0 flex-1 truncate text-sm font-medium", t.status === "COMPLETED" && "line-through opacity-60")}>{t.title}</span>
                  <span className="hidden shrink-0 text-[11px] text-[var(--muted)] sm:inline">{sectionName(t.sectionId)}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
