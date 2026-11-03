import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  const m = () => ({ findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn(), aggregate: vi.fn() });
  return { subtask: m(), comment: m(), reminder: m(), taskActivity: m(), document: m(), projectMember: m() };
});
const ws = vi.hoisted(() => ({ canAccessTask: vi.fn(), canEditTask: vi.fn(), getWorkspaceMembership: vi.fn(), canEditWorkspaceTasks: vi.fn() }));
const docs = vi.hoisted(() => ({ canAccessDocument: vi.fn(), canEditDocument: vi.fn(), createDocumentVersion: vi.fn() }));
const chat = vi.hoisted(() => ({ canAccessConversation: vi.fn(), canPostToConversation: vi.fn() }));
const msgs = vi.hoisted(() => ({ sendMessage: vi.fn(), listMessages: vi.fn(), updateMessage: vi.fn(), deleteMessage: vi.fn(), toggleMessageReaction: vi.fn(), setMessagePinned: vi.fn(), markConversationRead: vi.fn(), searchMessagesGlobal: vi.fn() }));
const inv = vi.hoisted(() => ({ sendWorkspaceInvite: vi.fn() }));
const perms = vi.hoisted(() => ({ canInviteMembers: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/workspace", () => ws);
vi.mock("@/lib/documents", () => docs);
vi.mock("@/lib/chat-access", () => chat);
vi.mock("@/lib/messages", () => msgs);
vi.mock("@/lib/invitations", () => inv);
vi.mock("@/lib/workspace-permissions", () => perms);
const im = vi.hoisted(() => ({ getWorkspaceMembership: vi.fn() }));
vi.mock("@/lib/workspace-membership", () => im);
vi.mock("@/lib/conversations", () => ({ createDirectConversation: vi.fn(), findDirectConversation: vi.fn(), getConversationDisplayName: () => "Chat", getMentionCandidatesForConversation: vi.fn().mockResolvedValue([]), listUserConversations: vi.fn() }));
vi.mock("@/lib/projects", () => ({ requireProjectAccess: vi.fn() }));
vi.mock("@/lib/time-tracking", () => ({ createManualEntry: vi.fn().mockResolvedValue({ id: "e1" }) }));
vi.mock("@/lib/realtime", () => ({ broadcastTaskEvent: vi.fn() }));

import * as m from "@/lib/mcp/tools-more";
import * as time from "@/lib/time-tracking";

const user = { id: "u1", name: "R" };
const task = { id: "t1", workspaceId: "w1", userId: "u1" };

beforeEach(() => {
  vi.clearAllMocks();
  ws.canAccessTask.mockResolvedValue(task);
  ws.canEditTask.mockResolvedValue(true);
});

describe("mcp tools-more", () => {
  it("blocks editing someone else's comment", async () => {
    db.comment.findUnique.mockResolvedValue({ userId: "u2", taskId: "t1" });
    await expect(m.updateComment(user, { commentId: "c1", body: "x" })).rejects.toThrow(/own comments/);
    expect(db.comment.update).not.toHaveBeenCalled();
  });
  it("deletes subtask only with edit rights", async () => {
    db.subtask.findUnique.mockResolvedValue({ taskId: "t1" });
    ws.canEditTask.mockResolvedValue(false);
    await expect(m.deleteSubtask(user, { subtaskId: "s1" })).rejects.toThrow(/permission/);
    ws.canEditTask.mockResolvedValue(true);
    await expect(m.deleteSubtask(user, { subtaskId: "s1" })).resolves.toEqual({ ok: true });
  });
  it("rejects invalid reminder date", async () => {
    await expect(m.addReminder(user, { taskId: "t1", remindAt: "nope" })).rejects.toThrow(/Invalid/);
  });
  it("logs time in seconds", async () => {
    await m.logTime(user, { taskId: "t1", date: "2026-11-03", minutes: 1.5 });
    expect(time.createManualEntry).toHaveBeenCalledWith("u1", expect.objectContaining({ durationSeconds: 90 }));
  });
  it("viewers cannot create workspace docs", async () => {
    ws.getWorkspaceMembership.mockResolvedValue({ role: "VIEWER" });
    ws.canEditWorkspaceTasks.mockReturnValue(false);
    await expect(m.createDocument(user, { title: "D", workspaceId: "w1" })).rejects.toThrow(/Viewers/);
  });
  it("hides docs you cannot access", async () => {
    docs.canAccessDocument.mockResolvedValue(null);
    await expect(m.getDocument(user, { documentId: "d1" })).rejects.toThrow(/not found/);
  });
  it("send_message requires post rights", async () => {
    chat.canPostToConversation.mockResolvedValue(null);
    await expect(m.sendChatMessage(user, { conversationId: "c1", body: "hi" })).rejects.toThrow(/cannot post/);
    chat.canPostToConversation.mockResolvedValue({ conversation: { id: "c1" } });
    msgs.sendMessage.mockResolvedValue({ id: "m1" });
    await expect(m.sendChatMessage(user, { conversationId: "c1", body: "hi" })).resolves.toEqual({ message: { id: "m1" } });
  });
  it("invite needs admin rights and surfaces errors", async () => {
    im.getWorkspaceMembership.mockResolvedValue({ role: "MEMBER", workspace: {} });
    perms.canInviteMembers.mockReturnValue(false);
    await expect(m.inviteMember(user, { workspaceId: "w1", email: "a@b.co" })).rejects.toThrow(/permission/);
    perms.canInviteMembers.mockReturnValue(true);
    inv.sendWorkspaceInvite.mockResolvedValue({ error: "No account found" });
    await expect(m.inviteMember(user, { workspaceId: "w1", email: "a@b.co" })).rejects.toThrow(/No account/);
  });
});
