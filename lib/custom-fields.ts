import { prisma } from "@/lib/prisma";
import { requireProjectAccess } from "@/lib/projects";
import { canAccessTask } from "@/lib/workspace";
import {
  CustomFieldError,
  MAX_CUSTOM_FIELDS_PER_PROJECT,
  normalizeFieldValue,
  parseOptions,
  validateFieldDefinition,
  type CustomFieldDef,
  type CustomFieldTypeName,
} from "@/lib/custom-field-rules";

type FieldRow = { id: string; name: string; type: string; options: unknown; position: number };

export function toFieldDef(row: FieldRow): CustomFieldDef {
  return {
    id: row.id,
    name: row.name,
    type: row.type as CustomFieldTypeName,
    options: row.type === "DROPDOWN" ? parseOptions(row.options) ?? [] : null,
    position: row.position,
  };
}

/** Fields of a project, for anyone who can view it. */
export async function listProjectFields(userId: string, projectId: string) {
  const access = await requireProjectAccess(userId, projectId);
  const rows = await prisma.projectCustomField.findMany({
    where: { projectId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  return { fields: rows.map(toFieldDef), canManage: access.canManage, canEdit: access.canEdit };
}

/** Adding/removing fields changes the project's shape, so it needs manage rights (same as project settings). */
export async function createProjectField(
  userId: string,
  projectId: string,
  input: { name: string; type: string; options?: unknown }
) {
  const access = await requireProjectAccess(userId, projectId);
  if (!access.canManage) throw new CustomFieldError("You do not have permission to manage this project's fields", 403);
  const def = validateFieldDefinition(input);
  const existing = await prisma.projectCustomField.findMany({
    where: { projectId },
    select: { name: true, position: true },
  });
  if (existing.length >= MAX_CUSTOM_FIELDS_PER_PROJECT) {
    throw new CustomFieldError(`A project can have at most ${MAX_CUSTOM_FIELDS_PER_PROJECT} custom fields`);
  }
  if (existing.some((f) => f.name.toLowerCase() === def.name.toLowerCase())) {
    throw new CustomFieldError(`A field named “${def.name}” already exists`, 409);
  }
  const position = existing.reduce((max, f) => Math.max(max, f.position), -1) + 1;
  const row = await prisma.projectCustomField.create({
    data: {
      projectId,
      name: def.name,
      type: def.type,
      ...(def.options ? { options: def.options } : {}),
      position,
    },
  });
  return { field: toFieldDef(row), workspaceId: access.project.workspaceId };
}

export async function deleteProjectField(userId: string, projectId: string, fieldId: string) {
  const access = await requireProjectAccess(userId, projectId);
  if (!access.canManage) throw new CustomFieldError("You do not have permission to manage this project's fields", 403);
  const field = await prisma.projectCustomField.findFirst({ where: { id: fieldId, projectId }, select: { id: true } });
  if (!field) throw new CustomFieldError("Field not found", 404);
  await prisma.projectCustomField.delete({ where: { id: fieldId } });
  return { ok: true as const, workspaceId: access.project.workspaceId };
}

/** Fields of the task's project plus this task's values. Personal/unprojected tasks get an empty list. */
export async function getTaskFieldValues(userId: string, taskId: string) {
  const task = await canAccessTask(userId, taskId);
  if (!task) throw new CustomFieldError("Task not found", 404);
  if (!task.projectId) return { projectId: null, fields: [], values: [], canEdit: false };
  const { fields, canEdit } = await listProjectFields(userId, task.projectId);
  const values = await prisma.taskCustomFieldValue.findMany({
    where: { taskId, fieldId: { in: fields.map((f) => f.id) } },
    select: { fieldId: true, value: true },
  });
  return { projectId: task.projectId, fields, values, canEdit };
}

/** Set (or clear with null/"") one field on a task. Needs edit rights on the task's project. */
export async function setTaskFieldValue(userId: string, taskId: string, fieldId: string, raw: unknown) {
  const task = await canAccessTask(userId, taskId);
  if (!task) throw new CustomFieldError("Task not found", 404);
  const field = await prisma.projectCustomField.findUnique({ where: { id: fieldId } });
  if (!field || !task.projectId || field.projectId !== task.projectId) {
    throw new CustomFieldError("Field not found on this task's project", 404);
  }
  const access = await requireProjectAccess(userId, task.projectId);
  if (!access.canEdit) throw new CustomFieldError("You do not have permission to edit this task", 403);
  const def = toFieldDef(field);
  const value = normalizeFieldValue(def, raw);
  if (value === null) {
    await prisma.taskCustomFieldValue.deleteMany({ where: { taskId, fieldId } });
  } else {
    await prisma.taskCustomFieldValue.upsert({
      where: { taskId_fieldId: { taskId, fieldId } },
      update: { value },
      create: { taskId, fieldId, value },
    });
  }
  return { task, field: def, value };
}
