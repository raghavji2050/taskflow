import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  const m = () => ({ findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn(), aggregate: vi.fn(), count: vi.fn(), upsert: vi.fn() });
  return { task: m(), subtask: m(), comment: m(), tag: m(), taskTag: m(), notification: { ...m(), findFirst: vi.fn() }, message: m(), user: m(), projectSection: m(), workspaceMember: m() };
});
const ws = vi.hoisted(() => ({ canAccessTask: vi.fn(), canEditTask: vi.fn(), getUserWorkspaceIds: vi.fn(), getWorkspaceMembership: vi.fn(), getWorkspaceMembers: vi.fn() }));
const proj = vi.hoisted(() => ({ createProject: vi.fn(), createSection: vi.fn(), projectFieldsForTaskUpdate: vi.fn(), requireProjectAccess: vi.fn(), updateProject: vi.fn() }));
const trash = vi.hoisted(() => ({ listPersonalTrash: vi.fn(), listWorkspaceTrash: vi.fn(), restoreTrashItem: vi.fn(), TrashError: class extends Error {} }));
const assignees = vi.hoisted(() => ({ syncTaskAssignees: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/workspace", () => ws);
vi.mock("@/lib/projects", () => proj);
vi.mock("@/lib/trash", () => trash);
vi.mock("@/lib/task-assignees", () => assignees);
vi.mock("@/lib/activity", () => ({ logTaskActivity: vi.fn() }));
vi.mock("@/lib/realtime", () => ({ broadcastTaskEvent: vi.fn() }));

import * as x from "@/lib/mcp/tools-extra";
import { createTaskflowMcpServer } from "@/lib/mcp/server";

const user = { id: "u1", name: "R" };
const task = { id: "t1", title: "T", workspaceId: "w1", userId: "u1", status: "PENDING" };

beforeEach(() => {
  vi.clearAllMocks();
  ws.canAccessTask.mockResolvedValue(task);
  ws.canEditTask.mockResolvedValue(true);
  ws.getWorkspaceMembership.mockResolvedValue({ role: "MEMBER" });
});

describe("RBAC guards", () => {
  const writes: [string, () => Promise<unknown>][] = [
    ["delete_task", () => x.deleteTask(user, { taskId: "t1" })],
    ["create_subtask", () => x.createSubtask(user, { taskId: "t1", title: "s" })],
    ["assign_task", () => x.assignTask(user, { taskId: "t1", assigneeIds: [] })],
    ["move_task", () => x.moveTask(user, { taskId: "t1", sectionId: "s1" })],
    ["set_task_tags", () => x.setTaskTags(user, { taskId: "t1", tags: ["a"] })],
    ["set_recurrence", () => x.setRecurrence(user, { taskId: "t1", rule: "WEEKLY" })],
  ];
  it.each(writes)("%s refuses viewers", async (_n, fn) => {
    ws.canEditTask.mockResolvedValue(false);
    await expect(fn()).rejects.toThrow(/permission/);
  });
  it.each(writes)("%s hides inaccessible tasks", async (_n, fn) => {
    ws.canAccessTask.mockResolvedValue(null);
    await expect(fn()).rejects.toThrow(/not found/i);
  });
  it("reads hide inaccessible tasks", async () => {
    ws.canAccessTask.mockResolvedValue(null);
    await expect(x.listSubtasks(user, { taskId: "t1" })).rejects.toThrow(/not found/i);
    await expect(x.listComments(user, { taskId: "t1" })).rejects.toThrow(/not found/i);
  });
  it("members list requires membership", async () => {
    ws.getWorkspaceMembership.mockResolvedValue(null);
    await expect(x.listWorkspaceMembers(user, { workspaceId: "w1" })).rejects.toThrow(/not found/);
  });
});

describe("tools", () => {
  it("delete_task soft-deletes", async () => {
    await x.deleteTask(user, { taskId: "t1" });
    expect(db.task.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);
  });
  it("restore_from_trash delegates with workspace", async () => {
    await x.restoreFromTrash(user, { kind: "task", id: "t1", workspaceId: "w1" });
    expect(trash.restoreTrashItem).toHaveBeenCalledWith({ userId: "u1", workspaceId: "w1", kind: "task", id: "t1" });
    await x.listTrash(user, {});
    expect(trash.listPersonalTrash).toHaveBeenCalledWith("u1");
  });
  it("assign_task rejects non-members", async () => {
    ws.getWorkspaceMembership.mockResolvedValueOnce(null);
    await expect(x.assignTask(user, { taskId: "t1", assigneeIds: ["zz"] })).rejects.toThrow(/not a member/);
    await x.assignTask(user, { taskId: "t1", assigneeIds: ["u2"] });
    expect(assignees.syncTaskAssignees).toHaveBeenCalledWith(expect.objectContaining({ assigneeIds: ["u2"], primaryAssigneeId: "u2" }));
  });
  it("move_task uses placement rules", async () => {
    db.task.findUnique.mockResolvedValue({ projectId: "p1", sectionId: "s0" });
    proj.projectFieldsForTaskUpdate.mockResolvedValue({ projectId: "p1", sectionId: "s1", position: 3 });
    const r = await x.moveTask(user, { taskId: "t1", sectionId: "s1" });
    expect(r).toMatchObject({ sectionId: "s1" });
    await expect(x.moveTask(user, { taskId: "t1" })).rejects.toThrow(/projectId/);
  });
  it("project tools delegate to RBAC-checked lib", async () => {
    proj.createProject.mockResolvedValue({ id: "p", name: "N", workspaceId: "w1" });
    await x.createProject(user, { workspaceId: "w1", name: "N" });
    expect(proj.createProject).toHaveBeenCalledWith({ userId: "u1", workspaceId: "w1", name: "N" });
    proj.updateProject.mockResolvedValue({ id: "p", name: "N", archived: true });
    expect(await x.updateProject(user, { projectId: "p", archived: true })).toMatchObject({ project: { archived: true } });
    proj.createSection.mockResolvedValue({ id: "s", name: "S", position: 1 });
    await x.createSection(user, { projectId: "p", name: "S" });
    proj.requireProjectAccess.mockRejectedValue(new Error("Forbidden"));
    await expect(x.listSections(user, { projectId: "p" })).rejects.toThrow();
  });
  it("set_task_tags only replaces own tags", async () => {
    db.tag.upsert.mockResolvedValue({ id: "g", name: "a" });
    await x.setTaskTags(user, { taskId: "t1", tags: ["a", "a", " "] });
    expect(db.tag.upsert).toHaveBeenCalledTimes(1);
    expect(db.taskTag.deleteMany.mock.calls[0][0].where).toEqual({ taskId: "t1", tag: { userId: "u1" } });
  });
  it("search filters by access", async () => {
    ws.getUserWorkspaceIds.mockResolvedValue(["w1"]);
    db.task.findMany.mockResolvedValue([
      { id: "a", title: "a", status: "PENDING", priority: "LOW", dueDate: null, workspaceId: "w1", projectId: null, project: null, assignees: [] },
      { id: "b", title: "b", status: "PENDING", priority: "LOW", dueDate: null, workspaceId: "w1", projectId: null, project: null, assignees: [] },
    ]);
    ws.canAccessTask.mockImplementation(async (_u: string, id: string) => (id === "a" ? task : null));
    expect((await x.searchTasks(user, { query: "x" })).tasks.map((t) => t.id)).toEqual(["a"]);
  });
  it("notifications are scoped to the user", async () => {
    db.notification.findMany.mockResolvedValue([]);
    db.notification.count.mockResolvedValue(2);
    expect((await x.listNotifications(user, {})).unreadCount).toBe(2);
    db.notification.updateMany.mockResolvedValue({ count: 2 });
    await x.markNotificationsRead(user, { all: true });
    expect(db.notification.updateMany.mock.calls[0][0].where.userId).toBe("u1");
    await expect(x.markNotificationsRead(user, {})).rejects.toThrow();
  });
  it("notifications return full message body + preview", async () => {
    const long = "x".repeat(150);
    const row = { id: "n1", title: "Msg", body: `${long.slice(0, 80)}…`, read: false, type: "message", createdAt: new Date(0), messageId: "m1", conversationId: "c1" };
    db.notification.findMany.mockResolvedValue([row]);
    db.notification.count.mockResolvedValue(1);
    db.message.findMany.mockResolvedValue([{ id: "m1", body: long }]);
    const r = await x.listNotifications(user, {});
    expect(r.notifications[0].body).toBe(long);
    expect(r.notifications[0].preview).toBe(row.body);
    expect(r.notifications[0].truncated).toBe(true);
    expect(db.message.findMany.mock.calls[0][0].where.conversation.participants.some.userId).toBe("u1");
    db.notification.findFirst.mockResolvedValue(null);
    await expect(x.getNotification(user, { id: "nope" })).rejects.toThrow(/not found/i);
    db.notification.findFirst.mockResolvedValue({ ...row, messageId: null, body: "short" });
    expect((await x.getNotification(user, { id: "n1" })).notification.body).toBe("short");
    expect(db.notification.findFirst.mock.calls[1][0].where.userId).toBe("u1");
  });
  it("list_workspaces can include archived", async () => {
    db.workspaceMember.findMany.mockResolvedValue([{ role: "OWNER", workspace: { id: "w", name: "W", archivedAt: new Date() } }]);
    const r = await x.listWorkspaces(user, { includeArchived: true });
    expect(r.workspaces[0].archived).toBe(true);
    expect(db.workspaceMember.findMany.mock.calls[0][0].where.workspace).toBeUndefined();
  });
  it("subtask update checks parent task", async () => {
    db.subtask.findUnique.mockResolvedValue(null);
    await expect(x.updateSubtask(user, { subtaskId: "s", completed: true })).rejects.toThrow(/not found/);
  });
  it("server registers all tools", () => {
    const s = createTaskflowMcpServer(user) as unknown as { _registeredTools: Record<string, unknown> };
    expect(Object.keys(s._registeredTools).length).toBe(72);
  });
});
