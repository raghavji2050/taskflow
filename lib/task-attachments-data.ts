import { head } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { canAccessTask, canEditTask } from "@/lib/workspace";
import { broadcastTaskEvent } from "@/lib/realtime";
import { logTaskActivity } from "@/lib/activity";
import { deleteAttachmentUrl, uploadAttachment } from "@/lib/blob-storage";
import { isBlobUrl } from "@/lib/blob-url";
import { cleanAttachmentFilename, isPathForTask, validateTaskAttachment } from "@/lib/task-attachment-rules";
import { recordAudit } from "@/lib/audit";

export class AttachmentError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export const attachmentSelect = { id: true, filename: true, url: true, mimeType: true, size: true, createdAt: true } as const;

async function taskForEdit(userId: string, taskId: string) {
  const task = await canAccessTask(userId, taskId);
  if (!task) throw new AttachmentError("Not found", 404);
  if (!(await canEditTask(userId, taskId))) throw new AttachmentError("You do not have permission to edit this task", 403);
  return task;
}

function touched(userId: string, task: { id: string; workspaceId: string | null; userId: string }) {
  broadcastTaskEvent({ type: "task:updated", workspaceId: task.workspaceId, ownerId: task.userId, actorId: userId, taskId: task.id });
}

export async function listTaskAttachments(userId: string, taskId: string) {
  const task = await canAccessTask(userId, taskId);
  if (!task) throw new AttachmentError("Not found", 404);
  return prisma.attachment.findMany({ where: { taskId }, orderBy: { createdAt: "desc" }, select: attachmentSelect });
}

/** Checks a pending upload before a Blob client token is issued. */
export async function assertCanAddAttachment(userId: string, taskId: string, filename: string, size: number) {
  await taskForEdit(userId, taskId);
  const existingCount = await prisma.attachment.count({ where: { taskId } });
  const err = validateTaskAttachment({ filename, size, existingCount });
  if (err) throw new AttachmentError(err);
}

async function record(userId: string, task: { id: string; workspaceId: string | null; userId: string; title: string }, data: { filename: string; url: string; mimeType: string; size: number }) {
  const attachment = await prisma.attachment.create({ data: { ...data, taskId: task.id }, select: attachmentSelect });
  await logTaskActivity(task.id, "attachment_added", data.filename).catch(() => undefined);
  if (task.workspaceId) await recordAudit({ workspaceId: task.workspaceId, actorId: userId, action: "file.attached", targetType: "task", targetId: task.id, targetLabel: task.title, details: { filename: data.filename, size: data.size } });
  touched(userId, task);
  return attachment;
}

/** Server-side upload (small files, local dev fallback, MCP). */
export async function addTaskAttachment(userId: string, taskId: string, file: { filename: string; mimeType: string; data: Buffer }, maxBytes?: number) {
  const task = await taskForEdit(userId, taskId);
  const filename = cleanAttachmentFilename(file.filename);
  const existingCount = await prisma.attachment.count({ where: { taskId } });
  const err = validateTaskAttachment({ filename, size: file.data.length, existingCount, maxBytes });
  if (err) throw new AttachmentError(err);
  const mimeType = file.mimeType || "application/octet-stream";
  const saved = await uploadAttachment({ file: file.data, filename, mimeType, prefix: `tasks/${taskId}` });
  return record(userId, task, { filename, url: saved.url, mimeType, size: saved.size });
}

/** Registers a file the browser already uploaded straight to Vercel Blob. */
export async function registerUploadedAttachment(userId: string, taskId: string, p: { url: string; filename: string }) {
  const task = await taskForEdit(userId, taskId);
  if (!isBlobUrl(p.url)) throw new AttachmentError("Invalid file URL");
  if (await prisma.attachment.findFirst({ where: { url: p.url }, select: { id: true } })) throw new AttachmentError("File already attached", 409);
  const meta = await head(p.url).catch(() => null);
  if (!meta || !isPathForTask(meta.pathname, taskId)) throw new AttachmentError("Upload not found for this task", 400);
  const filename = cleanAttachmentFilename(p.filename);
  const existingCount = await prisma.attachment.count({ where: { taskId } });
  const err = validateTaskAttachment({ filename, size: meta.size, existingCount });
  if (err) {
    await deleteAttachmentUrl(p.url);
    throw new AttachmentError(err);
  }
  return record(userId, task, { filename, url: p.url, mimeType: meta.contentType || "application/octet-stream", size: meta.size });
}

export async function deleteTaskAttachment(userId: string, taskId: string, attachmentId: string) {
  const task = await taskForEdit(userId, taskId);
  const att = await prisma.attachment.findFirst({ where: { id: attachmentId, taskId }, select: { id: true, url: true, filename: true } });
  if (!att) throw new AttachmentError("Attachment not found", 404);
  await prisma.attachment.delete({ where: { id: att.id } });
  await deleteAttachmentUrl(att.url);
  await logTaskActivity(taskId, "attachment_removed", att.filename).catch(() => undefined);
  if (task.workspaceId) await recordAudit({ workspaceId: task.workspaceId, actorId: userId, action: "file.removed", targetType: "task", targetId: taskId, targetLabel: task.title, details: { filename: att.filename } });
  touched(userId, task);
  return { ok: true };
}

