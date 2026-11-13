import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleApiError } from "@/lib/api";
import { getWorkspaceMembership } from "@/lib/workspace-membership";
import { canManageWorkspace } from "@/lib/workspace-permissions";
import { billingEnv } from "@/lib/billing-plans";
import { createPortalSession } from "@/lib/stripe";
import { appOrigin } from "@/lib/billing-origin";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/workspaces/:id/billing/portal — Stripe customer portal (invoices, card, cancel). */
export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await context.params;
    const membership = await getWorkspaceMembership(user.id, id);
    if (!membership || !canManageWorkspace(membership)) {
      return NextResponse.json({ error: "Only workspace owners and admins can manage billing" }, { status: 403 });
    }
    if (!billingEnv().secretKey) return NextResponse.json({ error: "Billing is not configured yet" }, { status: 503 });
    const ws = await prisma.workspace.findUnique({ where: { id }, select: { stripeCustomerId: true } });
    if (!ws?.stripeCustomerId) return NextResponse.json({ error: "This workspace has no subscription yet" }, { status: 400 });
    const session = await createPortalSession(ws.stripeCustomerId, appOrigin(request));
    return NextResponse.json({ url: session.url });
  } catch (error) {
    return handleApiError(error);
  }
}
