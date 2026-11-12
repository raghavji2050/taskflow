import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getWorkspaceMembership } from "@/lib/workspace";
import { AUDIT_RETENTION_DAYS, actionsForCategory, clientIpFrom, type AuditAction } from "@/lib/audit-labels";

export type AuditEvent = {
  workspaceId?: string | null;
  actorId?: string | null;
  action: AuditAction;
  targetType: string;
  targetId?: string | null;
  targetLabel?: string | null;
  details?: Record<string, unknown> | null;
};

async function requestMeta() {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    return { ip: clientIpFrom(h), userAgent: h.get("user-agent")?.slice(0, 300) ?? null };
  } catch {
    return { ip: null, userAgent: null };
  }
}

/** Best effort: an audit write must never break the action it records. */
export async function recordAudit(e: AuditEvent) {
  try {
    const meta = await requestMeta();
    await prisma.auditLog.create({
      data: {
        workspaceId: e.workspaceId ?? null,
        actorId: e.actorId ?? null,
        action: e.action,
        targetType: e.targetType.slice(0, 32),
        targetId: e.targetId ?? null,
        targetLabel: e.targetLabel?.slice(0, 200) ?? null,
        details: (e.details ?? undefined) as Prisma.InputJsonValue | undefined,
        ...meta,
      },
    });
  } catch (error) {
    logger.warn("audit_write_failed", { action: e.action, error: error instanceof Error ? error.message : String(error) });
  }
}

export class AuditAccessError extends Error {
  constructor(message: string, public status = 403) {
    super(message);
  }
}

export type AuditQuery = {
  workspaceId?: string | null;
  category?: string | null;
  actorId?: string | null;
  before?: string | null;
  limit?: number;
};

/**
 * Owners/admins see the whole workspace log; other members only their own actions there.
 * Without a workspace you see your own account events.
 */
export async function listAuditLog(userId: string, q: AuditQuery) {
  const limit = Math.min(Math.max(q.limit ?? 50, 1), 500);
  let where: Prisma.AuditLogWhereInput;
  let scope: "workspace" | "mine" | "account";
  if (q.workspaceId) {
    const m = await getWorkspaceMembership(userId, q.workspaceId);
    if (!m) throw new AuditAccessError("Workspace not found", 404);
    const admin = m.role === "OWNER" || m.role === "ADMIN";
    scope = admin ? "workspace" : "mine";
    where = { workspaceId: q.workspaceId, ...(admin ? (q.actorId ? { actorId: q.actorId } : {}) : { actorId: userId }) };
  } else {
    scope = "account";
    where = { actorId: userId, workspaceId: null };
  }
  const actions = actionsForCategory(q.category);
  if (actions) where = { AND: [where, { action: { in: actions } }] };
  if (q.before) {
    const d = new Date(q.before);
    if (!Number.isNaN(d.getTime())) where = { AND: [where, { createdAt: { lt: d } }] };
  }
  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    select: {
      id: true, action: true, targetType: true, targetId: true, targetLabel: true, details: true, ip: true, createdAt: true,
      actor: { select: { id: true, name: true, email: true } },
    },
  });
  const hasMore = rows.length > limit;
  const entries = rows.slice(0, limit).map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), ip: scope === "workspace" || scope === "account" ? r.ip : null }));
  return { entries, scope, nextBefore: hasMore ? entries[entries.length - 1]!.createdAt : null };
}

export async function purgeOldAuditLogs(now = new Date()) {
  const cutoff = new Date(now.getTime() - AUDIT_RETENTION_DAYS * 86_400_000);
  const r = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return r.count;
}
