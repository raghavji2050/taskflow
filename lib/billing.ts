import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  PLANS, PAID_PLANS, billingEnv, checkoutAvailable, effectivePlan, limitMessage, usageSummary, wouldExceed,
  type BillingUpdate, type LimitKind, type PlanId,
} from "@/lib/billing-plans";

export class BillingLimitError extends Error {
  status = 402;
}

export async function workspaceUsage(workspaceId: string): Promise<Record<LimitKind, number>> {
  const [members, projects] = await Promise.all([
    prisma.workspaceMember.count({ where: { workspaceId } }),
    prisma.project.count({ where: { workspaceId, deletedAt: null } }),
  ]);
  return { members, projects };
}

export async function getWorkspaceBilling(workspaceId: string) {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { plan: true, planStatus: true, planPeriodEnd: true, stripeCustomerId: true },
  });
  if (!ws) return null;
  const env = billingEnv();
  const plan = effectivePlan(ws.plan as PlanId, ws.planStatus);
  const usage = await workspaceUsage(workspaceId);
  return {
    plan,
    subscribedPlan: ws.plan as PlanId,
    status: ws.planStatus,
    periodEnd: ws.planPeriodEnd?.toISOString() ?? null,
    hasCustomer: !!ws.stripeCustomerId,
    enforceLimits: env.enforceLimits,
    usage: usageSummary(plan, usage),
    plans: Object.values(PLANS).map((p) => ({ ...p, checkoutAvailable: p.id === "FREE" ? false : checkoutAvailable(env, p.id) })),
    configured: !!env.secretKey && PAID_PLANS.some((p) => checkoutAvailable(env, p)),
  };
}

/** Throws BillingLimitError (402) when BILLING_ENFORCE_LIMITS=true and the plan is full. */
export async function assertWithinPlan(workspaceId: string, kind: LimitKind) {
  if (!billingEnv().enforceLimits) return;
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { plan: true, planStatus: true } });
  if (!ws) return;
  const plan = effectivePlan(ws.plan as PlanId, ws.planStatus);
  const usage = await workspaceUsage(workspaceId);
  if (wouldExceed(plan, kind, usage[kind])) throw new BillingLimitError(limitMessage(plan, kind));
}

/** Applies a verified Stripe event. Returns the workspace id it touched, or null. */
export async function applyBillingUpdate(update: BillingUpdate): Promise<string | null> {
  const { workspaceId, subscriptionId, customerId } = update.match;
  const or = [
    ...(workspaceId ? [{ id: workspaceId }] : []),
    ...(subscriptionId ? [{ stripeSubscriptionId: subscriptionId }] : []),
    ...(customerId ? [{ stripeCustomerId: customerId }] : []),
  ];
  if (!or.length) return null;
  const ws = await prisma.workspace.findFirst({ where: { OR: or }, select: { id: true } });
  if (!ws) {
    logger.warn("billing.webhook.no_workspace", { workspaceId, subscriptionId, customerId });
    return null;
  }
  await prisma.workspace.update({ where: { id: ws.id }, data: update.data });
  return ws.id;
}
