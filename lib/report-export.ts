import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ProjectError } from "@/lib/project-sections";
import { listVisibleProjects, requireProjectAccess } from "@/lib/projects";
import { getWorkspaceMembership } from "@/lib/workspace";
import { canViewWorkspace } from "@/lib/workspace-permissions";
import { visibleTaskWhere } from "@/lib/visible-records";
import { resolveTimeRange } from "@/lib/time-format";
import { buildTablePdf } from "@/lib/report-pdf";
import { exportFilename, hours, localDate, MAX_EXPORT_ROWS, toCsv, type ExportFormat, type ExportType } from "@/lib/report-export-rules";

export type ExportScope = { workspaceId?: string | null; projectId?: string | null; range?: "today" | "week" | "month" | "all"; tzOffsetMinutes?: number };

async function resolveScope(userId: string, s: ExportScope) {
  if (s.projectId) {
    const access = await requireProjectAccess(userId, s.projectId);
    return { label: access.project.name, taskWhere: { projectId: s.projectId } as Prisma.TaskWhereInput, workspaceId: access.project.workspaceId };
  }
  if (s.workspaceId) {
    const membership = await getWorkspaceMembership(userId, s.workspaceId);
    if (!membership || !canViewWorkspace(membership)) throw new ProjectError("Forbidden", 403);
    const visible = (await listVisibleProjects(userId, s.workspaceId, "all")) as Array<{ id: string }>;
    const ws = await prisma.workspace.findUnique({ where: { id: s.workspaceId }, select: { name: true } });
    return {
      label: ws?.name ?? "Workspace",
      taskWhere: { workspaceId: s.workspaceId, OR: [{ projectId: null }, { projectId: { in: visible.map((p) => p.id) } }] } as Prisma.TaskWhereInput,
      workspaceId: s.workspaceId,
    };
  }
  return { label: "Personal", taskWhere: { userId, workspaceId: null } as Prisma.TaskWhereInput, workspaceId: null };
}

export async function buildExport(userId: string, type: ExportType, format: ExportFormat, scope: ExportScope) {
  const sc = await resolveScope(userId, scope);
  const tz = scope.tzOffsetMinutes ?? 0;
  const now = new Date();
  let head: string[];
  let rows: string[][];
  let summary: string[];
  let widths: number[];

  if (type === "tasks") {
    const tasks = await prisma.task.findMany({
      where: visibleTaskWhere({ ...sc.taskWhere, archived: false }),
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "asc" }],
      take: MAX_EXPORT_ROWS,
      select: {
        title: true, status: true, priority: true, dueDate: true, completedAt: true, createdAt: true, estimatedMinutes: true,
        project: { select: { name: true } }, section: { select: { name: true } },
        assignees: { select: { user: { select: { name: true, email: true } } } },
      },
    });
    head = ["Title", "Status", "Priority", "Due", "Completed", "Project", "Section", "Assignees", "Estimate (min)", "Created"];
    widths = [0.27, 0.09, 0.07, 0.08, 0.08, 0.12, 0.09, 0.12, 0.0, 0.08];
    rows = tasks.map((t) => [
      t.title, t.status.replace("_", " ").toLowerCase(), t.priority.toLowerCase(), localDate(t.dueDate, tz), localDate(t.completedAt, tz),
      t.project?.name ?? "", t.section?.name ?? "", t.assignees.map((a) => a.user.name ?? a.user.email).join("; "),
      t.estimatedMinutes ? String(t.estimatedMinutes) : "", localDate(t.createdAt, tz),
    ]);
    const done = tasks.filter((t) => t.status === "COMPLETED").length;
    const overdue = tasks.filter((t) => t.status !== "COMPLETED" && t.dueDate && t.dueDate < now).length;
    summary = [`${tasks.length} tasks · ${done} done · ${tasks.length - done} open · ${overdue} overdue${tasks.length >= MAX_EXPORT_ROWS ? ` (first ${MAX_EXPORT_ROWS})` : ""}`];
  } else {
    const { from, to } = resolveTimeRange(scope.range ?? "all");
    const where: Prisma.TimeEntryWhereInput = {
      isRunning: false,
      task: visibleTaskWhere(sc.taskWhere),
      ...(sc.workspaceId ? {} : { userId }),
      ...(from || to ? { startTime: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    };
    const entries = await prisma.timeEntry.findMany({
      where, orderBy: { startTime: "desc" }, take: MAX_EXPORT_ROWS,
      select: { startTime: true, duration: true, description: true, user: { select: { name: true, email: true } }, task: { select: { title: true, project: { select: { name: true } } } } },
    });
    head = ["Date", "Person", "Task", "Project", "Hours", "Note"];
    widths = [0.09, 0.14, 0.33, 0.14, 0.07, 0.23];
    rows = entries.map((e) => [localDate(e.startTime, tz), e.user.name ?? e.user.email, e.task.title, e.task.project?.name ?? "", hours(e.duration), e.description ?? ""]);
    const total = entries.reduce((a, e) => a + e.duration, 0);
    const people = new Map<string, number>();
    for (const e of entries) people.set(e.user.name ?? e.user.email, (people.get(e.user.name ?? e.user.email) ?? 0) + e.duration);
    summary = [`${entries.length} entries · ${hours(total)} h total (${scope.range ?? "all"} time)`, ...[...people].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, s]) => `${n}: ${hours(s)} h`)];
  }

  const filename = exportFilename(type, sc.label, format, now);
  if (format === "csv") return { filename, contentType: "text/csv; charset=utf-8", body: toCsv(head, rows), rows: rows.length };
  const columns = head.map((h, i) => ({ header: h, width: widths[i] })).filter((c) => c.width > 0);
  const keep = head.map((_, i) => widths[i] > 0);
  const pdf = await buildTablePdf({
    title: `TaskFlow ${type === "tasks" ? "task" : "time"} report — ${sc.label}`,
    subtitle: `Generated ${new Date(now.getTime() - tz * 60_000).toISOString().replace("T", " ").slice(0, 16)} (UTC${tz <= 0 ? "+" : "-"}${String(Math.floor(Math.abs(tz) / 60)).padStart(2, "0")}:${String(Math.abs(tz) % 60).padStart(2, "0")})`,
    summary,
    columns,
    rows: rows.map((r) => r.filter((_, i) => keep[i])),
  });
  return { filename, contentType: "application/pdf", body: pdf, rows: rows.length };
}
