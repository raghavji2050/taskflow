import { createHmac, timingSafeEqual } from "crypto";

/**
 * Pure billing rules: plan catalogue, limits, Stripe signature check and
 * Stripe event -> workspace plan mapping. No DB, no network.
 * Prices live in Stripe (STRIPE_PRICE_PRO / STRIPE_PRICE_BUSINESS); we never hard-code amounts.
 */
export const PLAN_IDS = ["FREE", "PRO", "BUSINESS"] as const;
export type PlanId = (typeof PLAN_IDS)[number];
export type LimitKind = "members" | "projects";

export type PlanInfo = { id: PlanId; name: string; tagline: string; limits: Record<LimitKind, number | null>; features: string[] };

export const PLANS: Record<PlanId, PlanInfo> = {
  FREE: { id: "FREE", name: "Free", tagline: "For small teams getting started", limits: { members: 5, projects: 5 }, features: ["Tasks, board, calendar, chat", "Up to 5 members", "Up to 5 projects"] },
  PRO: { id: "PRO", name: "Pro", tagline: "For growing teams", limits: { members: 25, projects: 50 }, features: ["Everything in Free", "Up to 25 members", "Up to 50 projects"] },
  BUSINESS: { id: "BUSINESS", name: "Business", tagline: "For larger organisations", limits: { members: null, projects: null }, features: ["Everything in Pro", "Unlimited members", "Unlimited projects"] },
};

export const PAID_PLANS: PlanId[] = ["PRO", "BUSINESS"];

/** Subscription states that keep a paid plan active (Stripe gives a grace period on past_due). */
const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

export type BillingEnv = { secretKey?: string; webhookSecret?: string; prices: Partial<Record<PlanId, string>>; enforceLimits: boolean };

export function billingEnv(env: Record<string, string | undefined> = process.env): BillingEnv {
  return {
    secretKey: env.STRIPE_SECRET_KEY?.trim() || undefined,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET?.trim() || undefined,
    prices: { PRO: env.STRIPE_PRICE_PRO?.trim() || undefined, BUSINESS: env.STRIPE_PRICE_BUSINESS?.trim() || undefined },
    enforceLimits: env.BILLING_ENFORCE_LIMITS === "true",
  };
}

/** Checkout needs the secret key and a price for that plan. */
export function checkoutAvailable(env: BillingEnv, plan: PlanId) {
  return !!env.secretKey && plan !== "FREE" && !!env.prices[plan];
}

export function parsePlan(raw: unknown): PlanId | null {
  const v = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  return (PLAN_IDS as readonly string[]).includes(v) ? (v as PlanId) : null;
}

export function planForPrice(env: BillingEnv, priceId: string | null | undefined): PlanId | null {
  if (!priceId) return null;
  return PAID_PLANS.find((p) => env.prices[p] === priceId) ?? null;
}

/** Effective plan: a paid plan only counts while its subscription is in a live state. */
export function effectivePlan(plan: PlanId, status: string | null | undefined): PlanId {
  if (plan === "FREE") return "FREE";
  return status && ACTIVE_STATUSES.has(status) ? plan : "FREE";
}

export function limitFor(plan: PlanId, kind: LimitKind) {
  return PLANS[plan].limits[kind];
}

/** True when adding one more `kind` would exceed the plan. */
export function wouldExceed(plan: PlanId, kind: LimitKind, current: number) {
  const max = limitFor(plan, kind);
  return max !== null && current + 1 > max;
}

export function limitMessage(plan: PlanId, kind: LimitKind) {
  return `The ${PLANS[plan].name} plan allows up to ${limitFor(plan, kind)} ${kind}. Upgrade the workspace plan to add more.`;
}

export function usageSummary(plan: PlanId, usage: Record<LimitKind, number>) {
  return (Object.keys(usage) as LimitKind[]).map((kind) => {
    const limit = limitFor(plan, kind);
    return { kind, used: usage[kind], limit, percent: limit ? Math.min(100, Math.round((usage[kind] / limit) * 100)) : 0, over: limit !== null && usage[kind] > limit };
  });
}

/** Verifies a `Stripe-Signature` header (`t=..,v1=..[,v1=..]`), HMAC-SHA256 of `${t}.${rawBody}`. */
export function verifyStripeSignature(rawBody: string, header: string | null | undefined, secret: string, toleranceSec = 300, now = Math.floor(Date.now() / 1000)) {
  if (!header || !secret) return false;
  let t = NaN;
  const sigs: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2).map((x) => x?.trim());
    if (k === "t") t = Number(v);
    else if (k === "v1" && v) sigs.push(v);
  }
  if (!Number.isFinite(t) || !sigs.length || Math.abs(now - t) > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest();
  return sigs.some((s) => {
    const got = Buffer.from(s, "hex");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

/** Test/dev helper that produces a header Stripe would send. */
export function signStripePayload(rawBody: string, secret: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex")}`;
}

type StripeObj = Record<string, unknown>;
export type StripeEvent = { id?: string; type?: string; data?: { object?: StripeObj } };

/** What a Stripe event means for a workspace. `match` says how to find the workspace. */
export type BillingUpdate = {
  match: { workspaceId?: string; subscriptionId?: string; customerId?: string };
  data: { plan?: PlanId; planStatus?: string | null; planPeriodEnd?: Date | null; stripeCustomerId?: string; stripeSubscriptionId?: string | null };
};

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
const idOf = (v: unknown) => str(v) ?? str((v as StripeObj | null)?.id);

export function billingUpdateFromEvent(event: StripeEvent, env: BillingEnv): BillingUpdate | null {
  const obj = event.data?.object;
  if (!obj || !event.type) return null;
  const meta = (obj.metadata ?? {}) as Record<string, unknown>;
  const workspaceId = str(meta.workspaceId) ?? str(obj.client_reference_id);

  if (event.type === "checkout.session.completed") {
    if (obj.mode !== "subscription" || !workspaceId) return null;
    const plan = parsePlan(meta.plan);
    return {
      match: { workspaceId },
      data: { stripeCustomerId: idOf(obj.customer), stripeSubscriptionId: idOf(obj.subscription) ?? null, ...(plan && plan !== "FREE" ? { plan, planStatus: "active" } : {}) },
    };
  }

  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const subscriptionId = idOf(obj.id);
    const customerId = idOf(obj.customer);
    const items = ((obj.items as StripeObj | undefined)?.data as StripeObj[] | undefined) ?? [];
    const priceId = items.map((i) => idOf(i.price)).find(Boolean);
    const periodEndRaw = (obj.current_period_end ?? items[0]?.current_period_end) as number | undefined;
    const status = str(obj.status) ?? null;
    const deleted = event.type === "customer.subscription.deleted" || status === "canceled" || status === "incomplete_expired";
    const plan = deleted ? "FREE" : (planForPrice(env, priceId) ?? parsePlan(meta.plan) ?? undefined);
    return {
      match: { workspaceId, subscriptionId, customerId },
      data: {
        ...(plan ? { plan } : {}),
        planStatus: deleted ? "canceled" : status,
        planPeriodEnd: deleted ? null : typeof periodEndRaw === "number" ? new Date(periodEndRaw * 1000) : null,
        ...(customerId ? { stripeCustomerId: customerId } : {}),
        stripeSubscriptionId: deleted ? null : subscriptionId ?? null,
      },
    };
  }
  return null;
}
