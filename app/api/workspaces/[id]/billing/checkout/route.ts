import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { getWorkspaceMembership } from "@/lib/workspace-membership";
import { canManageWorkspace } from "@/lib/workspace-permissions";
import { billingEnv, checkoutAvailable, parsePlan } from "@/lib/billing-plans";
import { createCheckoutSession } from "@/lib/stripe";
import { recordAudit } from "@/lib/audit";
import { appOrigin } from "@/lib/billing-origin";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };
const schema = z.object({ plan: z.string() });

/** POST /api/workspaces/:id/billing/checkout {plan} — owners/admins get a Stripe Checkout URL. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await context.params;
    const membership = await getWorkspaceMembership(user.id, id);
    if (!membership || !canManageWorkspace(membership)) {
      return NextResponse.json({ error: "Only workspace owners and admins can change the plan" }, { status: 403 });
    }
    const plan = parsePlan(schema.parse(await request.json()).plan);
    if (!plan || plan === "FREE") return NextResponse.json({ error: "Choose a paid plan" }, { status: 400 });
    const env = billingEnv();
    if (!checkoutAvailable(env, plan)) return NextResponse.json({ error: "Billing is not configured yet" }, { status: 503 });
    const ws = await prisma.workspace.findUnique({ where: { id }, select: { name: true, stripeCustomerId: true } });
    if (!ws) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    const session = await createCheckoutSession({
      workspaceId: id, plan, priceId: env.prices[plan]!, customerId: ws.stripeCustomerId, email: user.email, origin: appOrigin(request),
    });
    await recordAudit({ workspaceId: id, actorId: user.id, action: "workspace.billing_checkout", targetType: "workspace", targetId: id, targetLabel: ws.name, details: { plan } });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    return handleApiError(error);
  }
}
