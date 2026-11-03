import { prisma } from "@/lib/prisma";
import { broadcastTaskEvent } from "@/lib/realtime";
import { canAccessTask, canEditTask, getWorkspaceMembership, canEditWorkspaceTasks } from "@/lib/workspace";
import * as projects from "@/lib/projects";
import type { ProjectRoleName } from "@/lib/project-sections";
import * as time from "@/lib/time-tracking";
import { canAccessDocument, canEditDocument, createDocumentVersion } from "@/lib/documents";
import { canAccessConversation, canPostToConversation } from "@/lib/chat-access";
import * as msgs from "@/lib/messages";
import { createDirectConversation, findDirectConversation, getConversationDisplayName, getMentionCandidatesForConversation, listUserConversations } from "@/lib/conversations";
import { sendWorkspaceInvite } from "@/lib/invitations";
import { canInviteMembers } from "@/lib/workspace-permissions";
import { getWorkspaceMembership as getInviteMembership } from "@/lib/workspace-membership";
import { McpToolError, type McpUser } from "@/lib/mcp/tools";

async function taskFor(user: McpUser, taskId: string, edit: boolean) {
  const task = await canAccessTask(user.id, taskId);
  if (!task) throw new McpToolError("Task not found");
  if (edit && !(await canEditTask(user.id, taskId))) throw new McpToolError("You do not have permission to edit this task");
  return task;
}
function touched(user: McpUser, task: { id: string; workspaceId: string | null; userId: string }) {
  broadcastTaskEvent({ type: "task:updated", workspaceId: task.workspaceId, ownerId: task.userId, actorId: user.id, taskId: task.id });
}
function wrap<T>(p: Promise<T>): Promise<T> {
  return p.catch((e: unknown) => {
    if (e instanceof McpToolError) throw e;
    if (e instanceof Error && e.constructor.name !== "Error" && !("code" in e)) throw new McpToolError(e.message);
    throw e;
  });
}

// ---- projects, sections, members
export const getProject = (u: McpUser, a: { projectId: string }) => wrap(projects.getProjectDetail(u.id, a.projectId));
export async function deleteProject(u: McpUser, a: { projectId: string }) { await wrap(projects.deleteProject(u.id, a.projectId)); return { ok: true, note: "Moved to trash. Use restore_from_trash to undo." }; }
export async function renameSection(u: McpUser, a: { projectId: string; sectionId: string; name: string }) { const s = await wrap(projects.updateSection(u.id, a.projectId, a.sectionId, a.name)); return { section: s }; }
export async function deleteSection(u: McpUser, a: { projectId: string; sectionId: string }) { await wrap(projects.deleteSection(u.id, a.projectId, a.sectionId)); return { ok: true }; }
export async function reorderSections(u: McpUser, a: { projectId: string; sectionIds: string[] }) { await wrap(projects.reorderSections(u.id, a.projectId, a.sectionIds)); return { ok: true }; }
export async function listProjectMembers(u: McpUser, a: { projectId: string }) {
  await wrap(projects.requireProjectAccess(u.id, a.projectId));
  const rows = await prisma.projectMember.findMany({ where: { projectId: a.projectId }, select: { id: true, role: true, user: { select: { id: true, name: true, email: true } } } });
  return { members: rows.map((r) => ({ memberId: r.id, role: r.role, userId: r.user.id, name: r.user.name, email: r.user.email })) };
}
export async function addProjectMember(u: McpUser, a: { projectId: string; userId: string; role: ProjectRoleName }) { return { member: await wrap(projects.addProjectMember(u.id, a.projectId, a.userId, a.role)) }; }
export async function updateProjectMember(u: McpUser, a: { projectId: string; memberId: string; role: ProjectRoleName }) { return { member: await wrap(projects.updateProjectMember(u.id, a.projectId, a.memberId, a.role)) }; }
export async function removeProjectMember(u: McpUser, a: { projectId: string; memberId: string }) { await wrap(projects.removeProjectMember(u.id, a.projectId, a.memberId)); return { ok: true }; }

// ---- task extras
export async function deleteSubtask(u: McpUser, a: { subtaskId: string }) {
  const s = await prisma.subtask.findUnique({ where: { id: a.subtaskId }, select: { taskId: true } });
  if (!s) throw new McpToolError("Subtask not found");
  const task = await taskFor(u, s.taskId, true);
  await prisma.subtask.delete({ where: { id: a.subtaskId } });
  touched(u, task);
  return { ok: true };
}
async function ownComment(u: McpUser, commentId: string) {
  const c = await prisma.comment.findUnique({ where: { id: commentId }, select: { userId: true, taskId: true } });
  if (!c) throw new McpToolError("Comment not found");
  const task = await taskFor(u, c.taskId, false);
  if (c.userId !== u.id) throw new McpToolError("You can only change your own comments");
  return task;
}
export async function updateComment(u: McpUser, a: { commentId: string; body: string }) { const t = await ownComment(u, a.commentId); await prisma.comment.update({ where: { id: a.commentId }, data: { body: a.body } }); touched(u, t); return { ok: true }; }
export async function deleteComment(u: McpUser, a: { commentId: string }) { const t = await ownComment(u, a.commentId); await prisma.comment.delete({ where: { id: a.commentId } }); touched(u, t); return { ok: true }; }
export async function listTaskActivity(u: McpUser, a: { taskId: string; limit?: number }) {
  await taskFor(u, a.taskId, false);
  return { activity: await prisma.taskActivity.findMany({ where: { taskId: a.taskId }, orderBy: { createdAt: "desc" }, take: a.limit ?? 30, select: { action: true, details: true, createdAt: true } }) };
}
export async function listReminders(u: McpUser, a: { taskId: string }) {
  await taskFor(u, a.taskId, false);
  return { reminders: await prisma.reminder.findMany({ where: { taskId: a.taskId }, orderBy: { remindAt: "asc" }, select: { id: true, remindAt: true, sent: true } }) };
}
export async function addReminder(u: McpUser, a: { taskId: string; remindAt: string }) {
  const task = await taskFor(u, a.taskId, true);
  const d = new Date(a.remindAt);
  if (Number.isNaN(d.getTime())) throw new McpToolError("Invalid remindAt");
  const r = await prisma.reminder.create({ data: { taskId: a.taskId, remindAt: d } });
  touched(u, task);
  return { reminder: { id: r.id, remindAt: r.remindAt } };
}
export async function deleteReminder(u: McpUser, a: { reminderId: string }) {
  const r = await prisma.reminder.findUnique({ where: { id: a.reminderId }, select: { taskId: true } });
  if (!r) throw new McpToolError("Reminder not found");
  const task = await taskFor(u, r.taskId, true);
  await prisma.reminder.delete({ where: { id: a.reminderId } });
  touched(u, task);
  return { ok: true };
}

// ---- time tracking
export const getActiveTimer = async (u: McpUser) => ({ timer: await time.getActiveTimer(u.id) });
export async function startTimer(u: McpUser, a: { taskId: string; description?: string }) { await taskFor(u, a.taskId, false); return { timer: await wrap(time.startTimer(u.id, a.taskId, a.description ?? null)) }; }
export const stopTimer = async (u: McpUser, a: { timeEntryId?: string }) => ({ entry: await wrap(time.stopTimer(u.id, a.timeEntryId)) });
export const pauseTimer = async (u: McpUser, a: { timeEntryId?: string }) => ({ entry: await wrap(time.pauseTimer(u.id, a.timeEntryId, "manual")) });
export const resumeTimer = async (u: McpUser, a: { timeEntryId?: string }) => ({ entry: await wrap(time.resumePausedTimer(u.id, a.timeEntryId)) });
export async function logTime(u: McpUser, a: { taskId: string; date: string; minutes: number; description?: string }) {
  await taskFor(u, a.taskId, false);
  return { entry: await wrap(time.createManualEntry(u.id, { taskId: a.taskId, date: a.date, durationSeconds: Math.round(a.minutes * 60), description: a.description ?? null })) };
}
export async function listTimeEntries(u: McpUser, a: { taskId?: string; workspaceId?: string; range?: "today" | "week" | "month" | "all"; limit?: number }) {
  if (a.taskId) { await taskFor(u, a.taskId, false); return wrap(time.listTaskTimeEntries(u.id, a.taskId, { range: a.range ?? "all", limit: a.limit ?? 50 })); }
  return wrap(time.listUserTimeEntries(u.id, u.id, { range: a.range ?? "week", limit: a.limit ?? 50, workspaceId: a.workspaceId ?? null, includeReport: true }));
}
export async function updateTimeEntry(u: McpUser, a: { entryId: string; description?: string | null; minutes?: number }) {
  return { entry: await wrap(time.updateTimeEntry(u.id, a.entryId, { description: a.description, durationSeconds: a.minutes === undefined ? undefined : Math.round(a.minutes * 60) })) };
}
export async function deleteTimeEntry(u: McpUser, a: { entryId: string }) { await wrap(time.deleteTimeEntry(u.id, a.entryId)); return { ok: true }; }

// ---- documents
const docSel = { id: true, title: true, type: true, icon: true, workspaceId: true, parentId: true, pinned: true, archived: true, updatedAt: true } as const;
export async function listDocuments(u: McpUser, a: { workspaceId?: string; includeArchived?: boolean; search?: string; limit?: number }) {
  if (a.workspaceId && !(await getWorkspaceMembership(u.id, a.workspaceId))) throw new McpToolError("Workspace not found");
  const scope = a.workspaceId ? { workspaceId: a.workspaceId } : { OR: [{ userId: u.id, workspaceId: null }, { workspace: { members: { some: { userId: u.id } } } }] };
  const docs = await prisma.document.findMany({
    where: { ...scope, ...(a.includeArchived ? {} : { archived: false }), ...(a.search ? { title: { contains: a.search } } : {}) },
    orderBy: { updatedAt: "desc" }, take: a.limit ?? 50, select: docSel,
  });
  return { documents: docs };
}
export async function getDocument(u: McpUser, a: { documentId: string }) {
  if (!(await canAccessDocument(u.id, a.documentId))) throw new McpToolError("Document not found");
  return { document: await prisma.document.findUnique({ where: { id: a.documentId }, select: { ...docSel, body: true } }), canEdit: await canEditDocument(u.id, a.documentId) };
}
export async function createDocument(u: McpUser, a: { title: string; body?: string; workspaceId?: string; parentId?: string }) {
  if (a.workspaceId) {
    const m = await getWorkspaceMembership(u.id, a.workspaceId);
    if (!m) throw new McpToolError("Workspace not found");
    if (!canEditWorkspaceTasks(m)) throw new McpToolError("Viewers cannot create documents");
  }
  if (a.parentId && !(await canAccessDocument(u.id, a.parentId))) throw new McpToolError("Parent document not found");
  const max = await prisma.document.aggregate({ where: { workspaceId: a.workspaceId ?? null, userId: a.workspaceId ? undefined : u.id, parentId: a.parentId ?? null }, _max: { position: true } });
  const d = await prisma.document.create({ data: { title: a.title, body: a.body ?? "", userId: u.id, workspaceId: a.workspaceId ?? null, parentId: a.parentId ?? null, position: (max._max.position ?? 0) + 1 }, select: docSel });
  await createDocumentVersion({ documentId: d.id, userId: u.id, title: a.title, body: a.body ?? "" });
  return { document: d };
}
export async function updateDocument(u: McpUser, a: { documentId: string; title?: string; body?: string; pinned?: boolean; archived?: boolean }) {
  if (!(await canAccessDocument(u.id, a.documentId))) throw new McpToolError("Document not found");
  if (!(await canEditDocument(u.id, a.documentId))) throw new McpToolError("You do not have permission to edit this document");
  const ex = await prisma.document.findUnique({ where: { id: a.documentId }, select: { title: true, body: true } });
  const { documentId, ...data } = a;
  const d = await prisma.document.update({ where: { id: documentId }, data, select: docSel });
  const title = a.title ?? ex!.title, body = a.body ?? ex!.body;
  if (title !== ex!.title || body !== ex!.body) await createDocumentVersion({ documentId, userId: u.id, title, body, changeNote: "Edited via MCP" });
  return { document: d };
}

// ---- chat
export async function listConversations(u: McpUser) {
  const { conversations, totalUnread } = await listUserConversations(u.id);
  return { totalUnread, conversations: conversations.map((c) => ({ id: c.id, type: c.type, name: c.name, unreadCount: c.unreadCount, lastMessageAt: c.lastMessage?.createdAt ?? null })) };
}
export async function listMessages(u: McpUser, a: { conversationId: string; limit?: number; cursor?: string }) {
  if (!(await canAccessConversation(u.id, a.conversationId))) throw new McpToolError("Conversation not found");
  return wrap(msgs.listMessages(a.conversationId, u.id, { limit: a.limit ?? 30, cursor: a.cursor }));
}
export async function sendChatMessage(u: McpUser, a: { conversationId: string; body: string; parentId?: string }) {
  const p = await canPostToConversation(u.id, a.conversationId);
  if (!p) throw new McpToolError("You cannot post in this conversation");
  const m = await wrap(msgs.sendMessage({
    conversationId: a.conversationId, userId: u.id, userName: u.name, body: a.body, parentId: a.parentId ?? null,
    conversationTitle: getConversationDisplayName(p.conversation as never, u.id), mentionCandidates: await getMentionCandidatesForConversation(p.conversation as never),
  }));
  return { message: { id: (m as { id: string }).id } };
}
async function postable(u: McpUser, conversationId: string) { if (!(await canPostToConversation(u.id, conversationId))) throw new McpToolError("You cannot post in this conversation"); }
export async function editChatMessage(u: McpUser, a: { conversationId: string; messageId: string; body: string }) { await postable(u, a.conversationId); await wrap(msgs.updateMessage({ ...a, userId: u.id })); return { ok: true }; }
export async function deleteChatMessage(u: McpUser, a: { conversationId: string; messageId: string }) { await postable(u, a.conversationId); await wrap(msgs.deleteMessage({ ...a, userId: u.id })); return { ok: true }; }
export async function reactToMessage(u: McpUser, a: { conversationId: string; messageId: string; emoji: string }) { await postable(u, a.conversationId); await wrap(msgs.toggleMessageReaction({ ...a, userId: u.id })); return { ok: true }; }
export async function pinMessage(u: McpUser, a: { conversationId: string; messageId: string; pinned: boolean }) { await postable(u, a.conversationId); await wrap(msgs.setMessagePinned({ ...a, userId: u.id })); return { ok: true }; }
export async function markConversationRead(u: McpUser, a: { conversationId: string }) {
  if (!(await canAccessConversation(u.id, a.conversationId))) throw new McpToolError("Conversation not found");
  await msgs.markConversationRead(a.conversationId, u.id); return { ok: true };
}
export const searchMessages = async (u: McpUser, a: { query: string; limit?: number }) => ({ results: await msgs.searchMessagesGlobal(u.id, a.query, a.limit ?? 20) });
export async function startDirectChat(u: McpUser, a: { userId: string }) {
  if (a.userId === u.id) throw new McpToolError("Pick another user");
  const existing = await findDirectConversation(u.id, a.userId);
  const c = existing ?? (await wrap(createDirectConversation(u.id, a.userId)));
  return { conversationId: (c as { id: string }).id };
}

// ---- workspace
export async function inviteMember(u: McpUser, a: { workspaceId: string; email: string }) {
  const m = await getInviteMembership(u.id, a.workspaceId);
  if (!m || !canInviteMembers(m, m.workspace)) throw new McpToolError("You do not have permission to invite members");
  const r = (await sendWorkspaceInvite({ workspaceId: a.workspaceId, inviterId: u.id, inviteeEmail: a.email })) as { error?: string };
  if (r && r.error) throw new McpToolError(r.error);
  return { ok: true, invited: a.email };
}
