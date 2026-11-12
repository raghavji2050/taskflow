import { recordAudit } from "@/lib/audit";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { appBaseUrl, sendEmail } from "@/lib/email";
import { getWorkspaceMembership } from "@/lib/workspace-membership";
import { canInviteMembers } from "@/lib/workspace-permissions";
import { broadcastWorkspaceUpdate } from "@/lib/realtime";
import {
  INVITE_STATE_MESSAGE,
  MAX_ACTIVE_INVITE_LINKS,
  canGrantRole,
  clampExpiryDays,
  emailMatches,
  inviteLinkState,
  type InviteRole,
} from "@/lib/invite-link-rules";

export class InviteLinkError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export const hashInviteToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const joinUrl = (token: string) => `${appBaseUrl()}/join/${token}`;

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

async function inviter(userId: string, workspaceId: string, role: InviteRole) {
  const m = await getWorkspaceMembership(userId, workspaceId);
  if (!m) throw new InviteLinkError("Workspace not found", 404);
  if (!canInviteMembers(m, m.workspace)) throw new InviteLinkError("You do not have permission to invite members", 403);
  if (!canGrantRole(m.role, role)) throw new InviteLinkError("Only owners and admins can invite admins", 403);
  return m;
}

const publicLink = (l: { id: string; role: string; email: string | null; maxUses: number | null; uses: number; expiresAt: Date; revokedAt: Date | null; createdAt: Date }) => ({
  id: l.id, role: l.role, email: l.email, maxUses: l.maxUses, uses: l.uses, expiresAt: l.expiresAt.toISOString(), createdAt: l.createdAt.toISOString(), state: inviteLinkState(l),
});

export async function createInviteLink(userId: string, workspaceId: string, opts: { role?: InviteRole; email?: string | null; expiresInDays?: number; maxUses?: number | null } = {}) {
  const role = opts.role ?? "MEMBER";
  await inviter(userId, workspaceId, role);
  const active = await prisma.workspaceInviteLink.count({ where: { workspaceId, revokedAt: null, expiresAt: { gt: new Date() } } });
  if (active >= MAX_ACTIVE_INVITE_LINKS) throw new InviteLinkError(`At most ${MAX_ACTIVE_INVITE_LINKS} active invite links; turn some off first`);
  const token = randomBytes(24).toString("base64url");
  const email = opts.email?.trim().toLowerCase() || null;
  const link = await prisma.workspaceInviteLink.create({
    data: {
      workspaceId,
      tokenHash: hashInviteToken(token),
      role,
      email,
      createdById: userId,
      maxUses: email ? 1 : opts.maxUses ?? null,
      expiresAt: new Date(Date.now() + clampExpiryDays(opts.expiresInDays) * 86_400_000),
    },
  });
  await recordAudit({ workspaceId, actorId: userId, action: opts.email ? "member.invited" : "member.invite_link_created", targetType: "invite_link", targetId: link.id, targetLabel: opts.email ?? null, details: { role: link.role, expiresAt: link.expiresAt.toISOString(), maxUses: link.maxUses } });
  return { link: publicLink(link), url: joinUrl(token), token };
}

/** Invite someone who has no account yet: single-use link bound to their email, sent by email. */
export async function inviteByEmailWithoutAccount(userId: string, workspaceId: string, email: string, role: InviteRole) {
  const existing = await prisma.workspaceInviteLink.findFirst({ where: { workspaceId, email: email.toLowerCase(), revokedAt: null, uses: 0, expiresAt: { gt: new Date() } } });
  if (existing) await prisma.workspaceInviteLink.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });
  const created = await createInviteLink(userId, workspaceId, { role, email, expiresInDays: 14 });
  const [ws, from] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
  ]);
  const wsName = escapeHtml(ws?.name ?? "a workspace");
  const who = escapeHtml(from?.name ?? "A teammate");
  const sent = await sendEmail(
    email,
    `${from?.name ?? "A teammate"} invited you to ${ws?.name ?? "TaskFlow"} on TaskFlow`,
    `<p>${who} invited you to join <b>${wsName}</b> on TaskFlow as ${role.toLowerCase()}.</p><p><a href="${created.url}">Accept the invite</a> — you'll create a free account first if you don't have one.</p><p style="color:#888">This link works once and expires in 14 days.</p>`
  ).catch(() => ({ success: false }));
  return { ...created, emailSent: Boolean((sent as { success?: boolean }).success) };
}

export async function listInviteLinks(userId: string, workspaceId: string) {
  await inviter(userId, workspaceId, "MEMBER");
  const links = await prisma.workspaceInviteLink.findMany({
    where: { workspaceId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return links.map(publicLink).filter((l) => l.state === "active");
}

export async function revokeInviteLink(userId: string, workspaceId: string, linkId: string) {
  await inviter(userId, workspaceId, "MEMBER");
  const r = await prisma.workspaceInviteLink.updateMany({ where: { id: linkId, workspaceId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (r.count === 0) throw new InviteLinkError("Invite link not found", 404);
  await recordAudit({ workspaceId, actorId: userId, action: "member.invite_link_revoked", targetType: "invite_link", targetId: linkId });
  return { ok: true };
}

async function findByToken(token: string) {
  if (!token || token.length < 20 || token.length > 100) return null;
  return prisma.workspaceInviteLink.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    include: { workspace: { select: { id: true, name: true, archivedAt: true, _count: { select: { members: true } } } } },
  });
}

export async function previewInvite(token: string) {
  const link = await findByToken(token);
  if (!link || link.workspace.archivedAt) return { valid: false as const, message: "This invite link is not valid." };
  const state = inviteLinkState(link);
  if (state !== "active") return { valid: false as const, message: INVITE_STATE_MESSAGE[state] };
  const by = await prisma.user.findUnique({ where: { id: link.createdById }, select: { name: true } });
  return {
    valid: true as const,
    workspace: { id: link.workspace.id, name: link.workspace.name, memberCount: link.workspace._count.members },
    role: link.role,
    invitedBy: by?.name ?? null,
    emailRestricted: Boolean(link.email),
    expiresAt: link.expiresAt.toISOString(),
  };
}

export async function acceptInviteLink(user: { id: string; email: string }, token: string) {
  const link = await findByToken(token);
  if (!link || link.workspace.archivedAt) throw new InviteLinkError("This invite link is not valid.", 404);
  const state = inviteLinkState(link);
  if (state !== "active") throw new InviteLinkError(INVITE_STATE_MESSAGE[state], 410);
  if (!emailMatches(link.email, user.email)) throw new InviteLinkError("This invite was sent to a different email address. Sign in with that email to accept it.", 403);
  const workspaceId = link.workspaceId;
  const existing = await prisma.workspaceMember.findFirst({ where: { workspaceId, userId: user.id } });
  if (existing) return { workspaceId, alreadyMember: true };
  // Atomic use counter so a single-use link can't be used twice in a race.
  const claimed = await prisma.workspaceInviteLink.updateMany({
    where: { id: link.id, revokedAt: null, ...(link.maxUses !== null ? { uses: { lt: link.maxUses } } : {}) },
    data: { uses: { increment: 1 } },
  });
  if (claimed.count === 0) throw new InviteLinkError(INVITE_STATE_MESSAGE.used_up, 410);
  await prisma.workspaceMember.create({ data: { workspaceId, userId: user.id, role: link.role } });
  const { addUserToWorkspaceChannel } = await import("@/lib/conversations");
  await addUserToWorkspaceChannel(workspaceId, user.id).catch(() => undefined);
  const { addUserToDefaultProject } = await import("@/lib/projects");
  await addUserToDefaultProject(workspaceId, user.id, link.role).catch(() => undefined);
  broadcastWorkspaceUpdate({ workspaceId, reason: "invite_accepted", actorId: user.id });
  await recordAudit({ workspaceId, actorId: user.id, action: "member.joined", targetType: "member", targetId: user.id, targetLabel: user.email, details: { role: link.role, via: "invite_link" } });
  return { workspaceId, alreadyMember: false, role: link.role };
}
