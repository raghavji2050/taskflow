import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserWorkspaceIds, getWorkspaceMembership } from "@/lib/workspace";
import { requireProjectAccess } from "@/lib/projects";
import { getActiveTimer } from "@/lib/time-tracking";
import { visibleTaskWhere } from "@/lib/visible-records";
import { dayKey, dueDayParts } from "@/lib/day";
import { McpToolError, type McpUser } from "@/lib/mcp/tools";

const DAY = 86_400_000;
const sel = {
  id: true, title: true, status: true, priority: true, dueDate: true, updatedAt: true, workspaceId: true, projectId: true,
  project: { select: { name: true } },
  assignees: { select: { user: { select: { id: true, name: true } } } },
  subtasks: { select: { completed: true } },
} satisfies Prisma.TaskSelect;
type Row = Prisma.TaskGetPayload<{ select: typeof sel }>;
const PR = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;

function brief(t: Row) {
  return { id: t.id, title: t.title, status: t.status, priority: t.priority, dueDate: t.dueDate?.toISOString() ?? null, project: t.project?.name ?? null, assignees: t.assignees.map((a) => a.user.name) };
}
/** Local-day bounds (default IST, +330 min). */
export function dayBounds(now: Date, tzOffsetMinutes = 330) {
  const local = now.getTime() + tzOffsetMinutes * 60_000;
  const start = Math.floor(local / DAY) * DAY - tzOffsetMinutes * 60_000;
  return { start: new Date(start), end: new Date(start + DAY) };
}

async function scopeWhere(user: McpUser, a: { workspaceId?: string; projectId?: string }): Promise<Prisma.TaskWhereInput> {
  if (a.projectId) { await requireProjectAccess(user.id, a.projectId); return { projectId: a.projectId }; }
  if (a.workspaceId) {
    if (!(await getWorkspaceMembership(user.id, a.workspaceId))) throw new McpToolError("Workspace not found");
    return { workspaceId: a.workspaceId };
  }
  const ws = await getUserWorkspaceIds(user.id);
  return { OR: [{ userId: user.id, workspaceId: null }, { assignees: { some: { userId: user.id } } }, { workspaceId: { in: ws } }] };
}

export async function planMyDay(user: McpUser, a: { tzOffsetMinutes?: number; limit?: number } = {}, now = new Date()) {
  const { start, end } = dayBounds(now, a.tzOffsetMinutes);
  const ws = await getUserWorkspaceIds(user.id);
  const mine: Prisma.TaskWhereInput = { OR: [{ userId: user.id, workspaceId: null }, { assignees: { some: { userId: user.id } } }, { workspaceId: { in: ws }, userId: user.id, assignees: { none: {} } }] };
  const rows = await prisma.task.findMany({
    where: visibleTaskWhere({ AND: [mine, { archived: false, status: { not: "COMPLETED" } }, { OR: [{ dueDate: { lt: new Date(Math.max(end.getTime(), Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))) } }, { priority: "HIGH" }, { status: "IN_PROGRESS" }] }] }),
    select: sel, take: 200,
  });
  const tz = a.tzOffsetMinutes ?? 330;
  const nowLocal = new Date(now.getTime() + tz * 60_000);
  const todayKey = dayKey({ y: nowLocal.getUTCFullYear(), m: nowLocal.getUTCMonth(), d: nowLocal.getUTCDate() });
  const keyOf = (t: Row) => (t.dueDate ? dayKey(dueDayParts(t.dueDate, tz)!) : null);
  const overdue = rows.filter((t) => { const k = keyOf(t); return k !== null && k < todayKey; });
  const dueToday = rows.filter((t) => keyOf(t) === todayKey);
  const rest = rows.filter((t) => !overdue.includes(t) && !dueToday.includes(t));
  const sort = (x: Row[]) => x.sort((p, q) => PR[p.priority] - PR[q.priority] || (p.dueDate?.getTime() ?? 9e15) - (q.dueDate?.getTime() ?? 9e15));
  const lim = a.limit ?? 20;
  const timer = await getActiveTimer(user.id);
  const ordered = [...sort(overdue), ...sort(dueToday), ...sort(rest)].slice(0, lim);
  return {
    date: start.toISOString(),
    summary: `${overdue.length} overdue, ${dueToday.length} due today, ${rest.length} other high-priority/in-progress`,
    activeTimer: timer ? { id: (timer as { id: string }).id, taskId: (timer as { taskId?: string }).taskId ?? null } : null,
    focus: ordered.map((t, i) => ({ rank: i + 1, reason: overdue.includes(t) ? "overdue" : dueToday.includes(t) ? "due today" : t.status === "IN_PROGRESS" ? "in progress" : "high priority", ...brief(t) })),
  };
}

export async function findBlockers(user: McpUser, a: { workspaceId?: string; projectId?: string; staleDays?: number } = {}, now = new Date()) {
  const where = await scopeWhere(user, a);
  const staleMs = (a.staleDays ?? 7) * DAY;
  const rows = await prisma.task.findMany({ where: visibleTaskWhere({ AND: [where, { archived: false, status: { not: "COMPLETED" } }] }), select: sel, take: 500 });
  const out: Array<ReturnType<typeof brief> & { reasons: string[] }> = [];
  for (const t of rows) {
    const reasons: string[] = [];
    if (t.dueDate && t.dueDate.getTime() < now.getTime()) reasons.push(`overdue ${Math.ceil((now.getTime() - t.dueDate.getTime()) / DAY)}d`);
    const open = t.subtasks.filter((s) => !s.completed).length;
    if (open && t.status === "IN_PROGRESS") reasons.push(`${open}/${t.subtasks.length} subtasks open`);
    if (now.getTime() - t.updatedAt.getTime() > staleMs) reasons.push(`no activity ${Math.floor((now.getTime() - t.updatedAt.getTime()) / DAY)}d`);
    if (reasons.length) out.push({ ...brief(t), reasons });
  }
  const byAssignee: Record<string, number> = {};
  for (const t of out) for (const n of t.assignees.length ? t.assignees : ["(unassigned)"]) byAssignee[n] = (byAssignee[n] ?? 0) + 1;
  return { count: out.length, byAssignee, blockers: out.slice(0, 100) };
}

export async function weeklyReport(user: McpUser, a: { workspaceId?: string; projectId?: string; days?: number } = {}, now = new Date()) {
  const where = await scopeWhere(user, a);
  const since = new Date(now.getTime() - (a.days ?? 7) * DAY);
  const base = (w: Prisma.TaskWhereInput) => visibleTaskWhere({ AND: [where, w] });
  const [completed, created, overdue, entries] = await Promise.all([
    prisma.task.findMany({ where: base({ status: "COMPLETED", completedAt: { gte: since } }), select: sel, take: 500 }),
    prisma.task.count({ where: base({ createdAt: { gte: since } }) }),
    prisma.task.count({ where: base({ archived: false, status: { not: "COMPLETED" }, dueDate: { lt: now } }) }),
    prisma.timeEntry.findMany({ where: { startTime: { gte: since }, task: base({}) }, select: { duration: true, user: { select: { name: true } } }, take: 5000 }),
  ]);
  const members: Record<string, { completed: number; minutesLogged: number }> = {};
  const m = (n: string) => (members[n] ??= { completed: 0, minutesLogged: 0 });
  for (const t of completed) for (const n of t.assignees.length ? t.assignees.map((x) => x.user.name) : ["(unassigned)"]) m(n).completed++;
  let secs = 0;
  for (const e of entries) { secs += e.duration; m(e.user.name).minutesLogged += Math.round(e.duration / 60); }
  return {
    from: since.toISOString(), to: now.toISOString(),
    totals: { completed: completed.length, created, overdueNow: overdue, hoursLogged: Math.round((secs / 3600) * 10) / 10 },
    members, completedTasks: completed.slice(0, 50).map(brief),
  };
}
