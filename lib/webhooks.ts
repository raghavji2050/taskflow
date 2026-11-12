import { lookup } from "dns/promises";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getWorkspaceMembership } from "@/lib/workspace";
import { recordAudit } from "@/lib/audit";
import {
  checkWebhookUrl, DISABLE_AFTER_FAILURES, generateWebhookSecret, isPrivateIp, MAX_WEBHOOKS_PER_WORKSPACE, parseEvents, secretHint, signPayload, type WebhookEvent,
} from "@/lib/webhook-rules";

export class WebhookError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

// Test/dev escape hatch for localhost sinks; never honoured on Vercel.
const allowPrivate = () => process.env.WEBHOOK_ALLOW_PRIVATE_URLS === "1" && !process.env.VERCEL && !process.env.VERCEL_ENV;

async function requireAdmin(userId: string, workspaceId: string) {
  const m = await getWorkspaceMembership(userId, workspaceId);
  if (!m) throw new WebhookError("Workspace not found", 404);
  if (m.role !== "OWNER" && m.role !== "ADMIN") throw new WebhookError("Only workspace owners and admins can manage webhooks", 403);
  return m;
}

type Row = { id: string; url: string; events: string; description: string | null; active: boolean; failureCount: number; lastDeliveryAt: Date | null; lastStatus: number | null; disabledReason: string | null; createdAt: Date; secret: string; workspaceId: string };
const publicHook = (w: Row) => ({
  id: w.id, workspaceId: w.workspaceId, url: w.url, events: w.events.split(","), description: w.description, active: w.active, failureCount: w.failureCount,
  lastDeliveryAt: w.lastDeliveryAt?.toISOString() ?? null, lastStatus: w.lastStatus, disabledReason: w.disabledReason, secretHint: secretHint(w.secret), createdAt: w.createdAt.toISOString(),
});

export async function listWebhooks(userId: string, workspaceId: string) {
  await requireAdmin(userId, workspaceId);
  const rows = await prisma.webhook.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" } });
  return rows.map(publicHook);
}

export async function createWebhook(userId: string, workspaceId: string, input: { url: string; events?: unknown; description?: string | null }) {
  await requireAdmin(userId, workspaceId);
  const check = checkWebhookUrl(input.url.trim(), allowPrivate());
  if (!check.ok) throw new WebhookError(check.error);
  const events = input.events === undefined ? ["task.created", "task.updated", "task.completed", "task.deleted"] : parseEvents(input.events);
  if (!events) throw new WebhookError("Pick at least one event");
  if ((await prisma.webhook.count({ where: { workspaceId } })) >= MAX_WEBHOOKS_PER_WORKSPACE) throw new WebhookError(`At most ${MAX_WEBHOOKS_PER_WORKSPACE} webhooks per workspace`);
  const secret = generateWebhookSecret();
  const w = await prisma.webhook.create({ data: { workspaceId, url: check.url.toString(), secret, events: events.join(","), description: input.description?.slice(0, 200) ?? null, createdById: userId } });
  await recordAudit({ workspaceId, actorId: userId, action: "workspace.webhook_created", targetType: "webhook", targetId: w.id, targetLabel: check.url.host });
  return { webhook: publicHook(w), secret };
}

export async function updateWebhook(userId: string, workspaceId: string, id: string, input: { active?: boolean; events?: unknown }) {
  await requireAdmin(userId, workspaceId);
  const events = input.events === undefined ? undefined : parseEvents(input.events);
  if (input.events !== undefined && !events) throw new WebhookError("Pick at least one event");
  const r = await prisma.webhook.updateMany({
    where: { id, workspaceId },
    data: { ...(input.active !== undefined ? { active: input.active, ...(input.active ? { failureCount: 0, disabledReason: null } : {}) } : {}), ...(events ? { events: events.join(",") } : {}) },
  });
  if (!r.count) throw new WebhookError("Webhook not found", 404);
  return publicHook((await prisma.webhook.findUnique({ where: { id } }))!);
}

export async function deleteWebhook(userId: string, workspaceId: string, id: string) {
  await requireAdmin(userId, workspaceId);
  const r = await prisma.webhook.deleteMany({ where: { id, workspaceId } });
  if (!r.count) throw new WebhookError("Webhook not found", 404);
  await recordAudit({ workspaceId, actorId: userId, action: "workspace.webhook_deleted", targetType: "webhook", targetId: id });
  return { ok: true };
}

export async function listDeliveries(userId: string, workspaceId: string, id: string) {
  await requireAdmin(userId, workspaceId);
  const w = await prisma.webhook.findFirst({ where: { id, workspaceId }, select: { id: true } });
  if (!w) throw new WebhookError("Webhook not found", 404);
  const rows = await prisma.webhookDelivery.findMany({ where: { webhookId: id }, orderBy: { createdAt: "desc" }, take: 20 });
  return rows.map((d) => ({ id: d.id, event: d.event, status: d.status, ok: d.ok, durationMs: d.durationMs, error: d.error, createdAt: d.createdAt.toISOString() }));
}

async function resolvesPrivate(host: string) {
  try {
    const addrs = await lookup(host, { all: true });
    return addrs.some((a) => isPrivateIp(a.address));
  } catch {
    return true;
  }
}

/** POST one signed delivery; records the result and auto-disables after repeated failures. */
export async function deliver(hook: { id: string; url: string; secret: string; failureCount: number }, event: WebhookEvent, data: unknown) {
  const deliveryId = randomUUID();
  const body = JSON.stringify({ id: deliveryId, event, createdAt: new Date().toISOString(), data });
  const started = Date.now();
  let status: number | null = null;
  let error: string | null = null;
  try {
    const url = new URL(hook.url);
    if (!allowPrivate() && (await resolvesPrivate(url.hostname))) throw new Error("Resolves to a private address");
    const res = await fetch(hook.url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
      headers: { "Content-Type": "application/json", "User-Agent": "TaskFlow-Webhooks/1", "X-TaskFlow-Event": event, "X-TaskFlow-Delivery": deliveryId, "X-TaskFlow-Signature": signPayload(hook.secret, body) },
      body,
    });
    status = res.status;
    if (status < 200 || status >= 300) error = `HTTP ${status}`;
  } catch (e) {
    error = (e instanceof Error ? e.message : String(e)).slice(0, 300);
  }
  const ok = !error;
  const failures = ok ? 0 : hook.failureCount + 1;
  await prisma.$transaction([
    prisma.webhookDelivery.create({ data: { webhookId: hook.id, event, status, ok, durationMs: Date.now() - started, error } }),
    prisma.webhook.update({
      where: { id: hook.id },
      data: { lastDeliveryAt: new Date(), lastStatus: status, failureCount: failures, ...(failures >= DISABLE_AFTER_FAILURES ? { active: false, disabledReason: `Turned off after ${failures} failed deliveries` } : {}) },
    }),
  ]).catch(() => undefined);
  // Keep the log small: last 50 deliveries per hook.
  const old = await prisma.webhookDelivery.findMany({ where: { webhookId: hook.id }, orderBy: { createdAt: "desc" }, skip: 50, select: { id: true } }).catch(() => []);
  if (old.length) await prisma.webhookDelivery.deleteMany({ where: { id: { in: old.map((o) => o.id) } } }).catch(() => undefined);
  return { ok, status, error, deliveryId };
}

export async function sendTestPing(userId: string, workspaceId: string, id: string) {
  await requireAdmin(userId, workspaceId);
  const hook = await prisma.webhook.findFirst({ where: { id, workspaceId } });
  if (!hook) throw new WebhookError("Webhook not found", 404);
  return deliver(hook, "ping", { message: "Hello from TaskFlow", workspaceId });
}

export function taskPayload(t: { id: string; title: string; status: string; priority: string; dueDate: Date | null; completedAt: Date | null; projectId: string | null; workspaceId: string | null; sectionId: string | null; createdAt: Date; updatedAt: Date }) {
  return { id: t.id, title: t.title, status: t.status, priority: t.priority, dueDate: t.dueDate?.toISOString() ?? null, completedAt: t.completedAt?.toISOString() ?? null, projectId: t.projectId, workspaceId: t.workspaceId, sectionId: t.sectionId, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString() };
}

/** Fan out a task event to matching active hooks of the workspace. */
export async function dispatchTaskEvent(type: "task:created" | "task:updated" | "task:deleted", workspaceId: string, taskId: string, actorId?: string | null) {
  const hooks = await prisma.webhook.findMany({ where: { workspaceId, active: true } });
  if (!hooks.length) return;
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return;
  const events: WebhookEvent[] = [type === "task:created" ? "task.created" : type === "task:deleted" ? "task.deleted" : "task.updated"];
  if (type === "task:updated" && task.status === "COMPLETED" && task.completedAt && Date.now() - task.completedAt.getTime() < 15_000) events.push("task.completed");
  if (type === "task:updated" && task.deletedAt) events[0] = "task.deleted";
  const data = { task: taskPayload(task), actorId: actorId ?? null };
  await Promise.all(hooks.flatMap((h) => events.filter((e) => h.events.split(",").includes(e)).map((e) => deliver(h, e, data))));
}
