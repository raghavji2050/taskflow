import { prisma } from "@/lib/prisma";
import { ProjectError } from "@/lib/project-sections";
import { createProject, requireProjectAccess } from "@/lib/projects";
import { getWorkspaceMembership } from "@/lib/workspace";
import { visibleTaskWhere } from "@/lib/visible-records";
import { recordAudit } from "@/lib/audit";
import { BUILTIN_TEMPLATES, isBuiltinId, parseTemplateData, snapshotProject, summarize, type TemplateData } from "@/lib/project-template-rules";

const MAX_SAVED = 50;

async function member(userId: string, workspaceId: string) {
  const m = await getWorkspaceMembership(userId, workspaceId);
  if (!m) throw new ProjectError("Forbidden", 403);
  return m;
}

export async function listProjectTemplates(userId: string, workspaceId: string) {
  await member(userId, workspaceId);
  const saved = await prisma.projectTemplate.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: MAX_SAVED });
  return [
    ...BUILTIN_TEMPLATES.map((b) => summarize(b.id, b.name, b.description, b.color, b.data, true)),
    ...saved.flatMap((s) => {
      const d = parseTemplateData(s.data);
      return d ? [summarize(s.id, s.name, s.description, s.color, d, false)] : [];
    }),
  ];
}

async function loadTemplate(workspaceId: string, templateId: string): Promise<{ name: string; color: string | null; data: TemplateData; description: string | null }> {
  if (isBuiltinId(templateId)) {
    const b = BUILTIN_TEMPLATES.find((x) => x.id === templateId);
    if (!b) throw new ProjectError("Template not found", 404);
    return b;
  }
  const s = await prisma.projectTemplate.findFirst({ where: { id: templateId, workspaceId } });
  const data = s ? parseTemplateData(s.data) : null;
  if (!s || !data) throw new ProjectError("Template not found", 404);
  return { name: s.name, color: s.color, data, description: s.description };
}

export async function createProjectFromTemplate(userId: string, workspaceId: string, input: { templateId: string; name?: string; color?: string; description?: string | null }) {
  const tpl = await loadTemplate(workspaceId, input.templateId);
  const project = await createProject({ userId, workspaceId, name: (input.name?.trim() || tpl.name).slice(0, 100), description: input.description ?? tpl.description, color: input.color ?? tpl.color ?? undefined });
  const defaultSection = await prisma.projectSection.findFirst({ where: { projectId: project.id }, orderBy: { position: "asc" } });
  const base = new Date();
  base.setHours(17, 0, 0, 0);
  const sectionIds: string[] = [];
  for (const [i, s] of tpl.data.sections.entries()) {
    if (i === 0 && defaultSection) {
      await prisma.projectSection.update({ where: { id: defaultSection.id }, data: { name: s.name } });
      sectionIds.push(defaultSection.id);
    } else {
      sectionIds.push((await prisma.projectSection.create({ data: { projectId: project.id, name: s.name, position: i } })).id);
    }
  }
  const rows = tpl.data.sections.flatMap((s, si) => s.tasks.map((k, ti) => ({
    title: k.title, priority: k.priority ?? "MEDIUM", status: "PENDING" as const, description: k.description ?? null,
    dueDate: k.dueInDays === null || k.dueInDays === undefined ? null : new Date(base.getTime() + k.dueInDays * 86_400_000),
    userId, workspaceId, projectId: project.id, sectionId: sectionIds[si], position: ti,
  })));
  if (rows.length) await prisma.task.createMany({ data: rows });
  return { project, tasksCreated: rows.length, sectionsCreated: sectionIds.length };
}

export async function saveProjectAsTemplate(userId: string, projectId: string, input: { name?: string; description?: string | null }) {
  const access = await requireProjectAccess(userId, projectId);
  if (!access.canManage && !access.canEdit) throw new ProjectError("You cannot save this project as a template", 403);
  const workspaceId = access.project.workspaceId;
  if ((await prisma.projectTemplate.count({ where: { workspaceId } })) >= MAX_SAVED) throw new ProjectError(`At most ${MAX_SAVED} saved templates per workspace`, 400);
  const [sections, tasks] = await Promise.all([
    prisma.projectSection.findMany({ where: { projectId }, orderBy: { position: "asc" }, select: { id: true, name: true } }),
    prisma.task.findMany({ where: visibleTaskWhere({ projectId, archived: false }), orderBy: [{ position: "asc" }, { createdAt: "asc" }], take: 200, select: { title: true, priority: true, description: true, dueDate: true, sectionId: true } }),
  ]);
  const data = snapshotProject(sections, tasks);
  const tpl = await prisma.projectTemplate.create({
    data: { workspaceId, name: (input.name?.trim() || `${access.project.name} template`).slice(0, 100), description: input.description?.slice(0, 500) ?? access.project.description?.slice(0, 500) ?? null, color: access.project.color, data, createdById: userId },
  });
  await recordAudit({ workspaceId, actorId: userId, action: "project.template_saved", targetType: "project", targetId: projectId, targetLabel: tpl.name });
  return summarize(tpl.id, tpl.name, tpl.description, tpl.color, data, false);
}

export async function deleteProjectTemplate(userId: string, workspaceId: string, templateId: string) {
  const m = await member(userId, workspaceId);
  if (isBuiltinId(templateId)) throw new ProjectError("Built-in templates cannot be deleted", 400);
  const tpl = await prisma.projectTemplate.findFirst({ where: { id: templateId, workspaceId } });
  if (!tpl) throw new ProjectError("Template not found", 404);
  if (tpl.createdById !== userId && m.role !== "OWNER" && m.role !== "ADMIN") throw new ProjectError("Only the creator or an admin can delete this template", 403);
  await prisma.projectTemplate.delete({ where: { id: tpl.id } });
  return { ok: true };
}
