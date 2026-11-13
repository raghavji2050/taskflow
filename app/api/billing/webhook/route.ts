import { NextResponse } from "next/server";
import { billingEnv, billingUpdateFromEvent, verifyStripeSignature, type StripeEvent } from "@/lib/billing-plans";
import { applyBillingUpdate } from "@/lib/billing";
import { recordAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/billing/webhook — Stripe events (signed with STRIPE_WEBHOOK_SECRET).
 * Handles checkout.session.completed and customer.subscription.{created,updated,deleted}.
 * Idempotent: each event just sets the workspace's current plan state.
 */
export async function POST(request: Request) {
  const env = billingEnv();
  if (!env.webhookSecret) return NextResponse.json({ error: "Billing webhook is not configured" }, { status: 503 });
  const raw = await request.text();
  if (!verifyStripeSignature(raw, request.headers.get("stripe-signature"), env.webhookSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  let event: StripeEvent;
  try {
    event = JSON.parse(raw) as StripeEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const update = billingUpdateFromEvent(event, env);
  if (!update) return NextResponse.json({ received: true, ignored: true });
  const workspaceId = await applyBillingUpdate(update);
  logger.info("billing.webhook", { type: event.type, eventId: event.id, workspaceId, plan: update.data.plan, status: update.data.planStatus });
  if (workspaceId && update.data.plan) {
    await recordAudit({ workspaceId, action: "workspace.plan_changed", targetType: "workspace", targetId: workspaceId, details: { plan: update.data.plan, status: update.data.planStatus ?? null, stripeEvent: event.type } });
  }
  return NextResponse.json({ received: true, workspaceId });
}
