/** Pure aggregation for the Insights dashboard (no prisma, easy to unit test). */

export type InsightTask = {
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | string;
  dueDate: Date | string | null;
  completedAt: Date | string | null;
  createdAt: Date | string;
  archived?: boolean;
  projectId: string | null;
  assigneeIds: string[];
};

export type InsightOptions = {
  now?: Date;
  /** Minutes behind UTC, same sign as Date#getTimezoneOffset (IST = -330). */
  tzOffsetMinutes?: number;
  weeks?: number;
  members?: { id: string; name: string }[];
  projects?: { id: string; name: string; color?: string | null }[];
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "To do",
  IN_PROGRESS: "In progress",
  COMPLETED: "Done",
};

const DAY = 86_400_000;

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

/** Local calendar day key (YYYY-MM-DD) in the viewer's zone. */
export function localDayKey(v: Date | string, tzOffsetMinutes = 0): string {
  const shifted = new Date(toDate(v).getTime() - tzOffsetMinutes * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/** Monday (YYYY-MM-DD) of the week containing the given local day key. */
export function weekStartKey(dayKey: string): string {
  const d = new Date(`${dayKey}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0
  return new Date(d.getTime() - dow * DAY).toISOString().slice(0, 10);
}

function addDays(dayKey: string, days: number): string {
  return new Date(new Date(`${dayKey}T00:00:00Z`).getTime() + days * DAY).toISOString().slice(0, 10);
}

/** Date-only due dates (stored at UTC midnight) keep their calendar day. */
function dueKey(v: Date | string, tz: number): string {
  const d = toDate(v);
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) {
    return d.toISOString().slice(0, 10);
  }
  return localDayKey(d, tz);
}

export function computeInsights(tasks: InsightTask[], options: InsightOptions = {}) {
  const now = options.now ?? new Date();
  const tz = options.tzOffsetMinutes ?? 0;
  const weeks = Math.min(Math.max(options.weeks ?? 8, 1), 26);
  const today = localDayKey(now, tz);
  const thisWeek = weekStartKey(today);
  const weekEnd = addDays(thisWeek, 6);

  const current = tasks.filter((t) => !t.archived);
  const isOpen = (t: InsightTask) => t.status !== "COMPLETED";
  const isOverdue = (t: InsightTask) => isOpen(t) && t.dueDate != null && dueKey(t.dueDate, tz) < today;

  const open = current.filter(isOpen);
  const completed = current.length - open.length;
  const overdue = open.filter(isOverdue).length;
  const dueThisWeek = open.filter((t) => {
    if (!t.dueDate) return false;
    const k = dueKey(t.dueDate, tz);
    return k >= today && k <= weekEnd;
  }).length;

  const byStatus = ["PENDING", "IN_PROGRESS", "COMPLETED"].map((status) => ({
    status,
    label: STATUS_LABELS[status],
    count: current.filter((t) => t.status === status).length,
  }));

  const memberNames = new Map((options.members ?? []).map((m) => [m.id, m.name]));
  const people = new Map<string, { userId: string; name: string; open: number; overdue: number; completed: number }>();
  let unassignedOpen = 0;
  for (const t of current) {
    const ids = [...new Set(t.assigneeIds)];
    if (ids.length === 0 && isOpen(t)) unassignedOpen += 1;
    for (const id of ids) {
      const row = people.get(id) ?? { userId: id, name: memberNames.get(id) ?? "Unknown", open: 0, overdue: 0, completed: 0 };
      if (isOpen(t)) row.open += 1;
      else row.completed += 1;
      if (isOverdue(t)) row.overdue += 1;
      people.set(id, row);
    }
  }
  const byAssignee = [...people.values()].sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));

  const byProject = (options.projects ?? [])
    .map((p) => {
      const list = current.filter((t) => t.projectId === p.id);
      const pOpen = list.filter(isOpen);
      return {
        projectId: p.id,
        name: p.name,
        color: p.color ?? null,
        open: pOpen.length,
        overdue: pOpen.filter(isOverdue).length,
        completed: list.length - pOpen.length,
      };
    })
    .filter((p) => p.open + p.completed > 0)
    .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));

  // Throughput: archived tasks count too, they were still finished that week.
  const firstWeek = addDays(thisWeek, -7 * (weeks - 1));
  const weekly = new Map<string, { completed: number; created: number }>();
  for (let i = 0; i < weeks; i += 1) weekly.set(addDays(firstWeek, i * 7), { completed: 0, created: 0 });
  for (const t of tasks) {
    if (t.status === "COMPLETED" && t.completedAt) {
      const w = weekly.get(weekStartKey(localDayKey(t.completedAt, tz)));
      if (w) w.completed += 1;
    }
    const c = weekly.get(weekStartKey(localDayKey(t.createdAt, tz)));
    if (c) c.created += 1;
  }
  const completedPerWeek = [...weekly.entries()].map(([weekStart, v]) => ({ weekStart, ...v }));

  return {
    totals: {
      total: current.length,
      open: open.length,
      inProgress: current.filter((t) => t.status === "IN_PROGRESS").length,
      completed,
      overdue,
      dueThisWeek,
      unassignedOpen,
      completionRate: current.length ? Math.round((completed / current.length) * 100) : 0,
      completedThisWeek: completedPerWeek[completedPerWeek.length - 1]?.completed ?? 0,
    },
    byStatus,
    byAssignee,
    byProject,
    completedPerWeek,
    today,
  };
}

export type Insights = ReturnType<typeof computeInsights>;
