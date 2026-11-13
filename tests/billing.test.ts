import { describe, expect, it } from "vitest";
import {
  billingEnv, billingUpdateFromEvent, checkoutAvailable, effectivePlan, limitMessage, parsePlan, planForPrice,
  signStripePayload, usageSummary, verifyStripeSignature, wouldExceed,
} from "@/lib/billing-plans";

const env = billingEnv({ STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_t", STRIPE_PRICE_PRO: "price_pro", STRIPE_PRICE_BUSINESS: "price_biz" });

describe("billing env + plans", () => {
  it("reads env and checkout availability", () => {
    expect(env.prices.PRO).toBe("price_pro");
    expect(env.enforceLimits).toBe(false);
    expect(checkoutAvailable(env, "PRO")).toBe(true);
    expect(checkoutAvailable(env, "FREE")).toBe(false);
    expect(checkoutAvailable(billingEnv({ STRIPE_PRICE_PRO: "p" }), "PRO")).toBe(false);
    expect(billingEnv({ BILLING_ENFORCE_LIMITS: "true" }).enforceLimits).toBe(true);
  });
  it("parses plans and prices", () => {
    expect(parsePlan(" pro ")).toBe("PRO");
    expect(parsePlan("gold")).toBeNull();
    expect(planForPrice(env, "price_biz")).toBe("BUSINESS");
    expect(planForPrice(env, "price_other")).toBeNull();
  });
  it("only counts paid plans with a live subscription", () => {
    expect(effectivePlan("PRO", "active")).toBe("PRO");
    expect(effectivePlan("PRO", "past_due")).toBe("PRO");
    expect(effectivePlan("PRO", "canceled")).toBe("FREE");
    expect(effectivePlan("BUSINESS", null)).toBe("FREE");
  });
  it("limits", () => {
    expect(wouldExceed("FREE", "members", 4)).toBe(false);
    expect(wouldExceed("FREE", "members", 5)).toBe(true);
    expect(wouldExceed("BUSINESS", "projects", 10_000)).toBe(false);
    expect(limitMessage("FREE", "projects")).toContain("up to 5 projects");
    const u = usageSummary("FREE", { members: 6, projects: 1 });
    expect(u[0]).toMatchObject({ kind: "members", used: 6, limit: 5, percent: 100, over: true });
    expect(usageSummary("BUSINESS", { members: 3, projects: 1 })[0].limit).toBeNull();
  });
});

describe("stripe signature", () => {
  const body = JSON.stringify({ id: "evt_1" });
  it("accepts a valid header, including multiple v1 values", () => {
    const h = signStripePayload(body, "whsec_t", 1000);
    expect(verifyStripeSignature(body, h, "whsec_t", 300, 1100)).toBe(true);
    expect(verifyStripeSignature(body, `${h},v1=deadbeef`, "whsec_t", 300, 1100)).toBe(true);
  });
  it("rejects tampering, wrong secret, old timestamps and junk", () => {
    const h = signStripePayload(body, "whsec_t", 1000);
    expect(verifyStripeSignature(body + " ", h, "whsec_t", 300, 1000)).toBe(false);
    expect(verifyStripeSignature(body, h, "other", 300, 1000)).toBe(false);
    expect(verifyStripeSignature(body, h, "whsec_t", 300, 2000)).toBe(false);
    expect(verifyStripeSignature(body, "garbage", "whsec_t")).toBe(false);
    expect(verifyStripeSignature(body, null, "whsec_t")).toBe(false);
  });
});

describe("stripe event mapping", () => {
  it("checkout.session.completed links customer + subscription", () => {
    const u = billingUpdateFromEvent({ type: "checkout.session.completed", data: { object: { mode: "subscription", client_reference_id: "ws1", customer: "cus_1", subscription: "sub_1", metadata: { plan: "PRO" } } } }, env);
    expect(u).toEqual({ match: { workspaceId: "ws1" }, data: { stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1", plan: "PRO", planStatus: "active" } });
    expect(billingUpdateFromEvent({ type: "checkout.session.completed", data: { object: { mode: "payment", client_reference_id: "ws1" } } }, env)).toBeNull();
  });
  it("subscription.updated maps price -> plan, status and period end", () => {
    const u = billingUpdateFromEvent({ type: "customer.subscription.updated", data: { object: { id: "sub_1", customer: "cus_1", status: "active", metadata: { workspaceId: "ws1" }, items: { data: [{ price: { id: "price_biz" }, current_period_end: 1_800_000_000 }] } } } }, env);
    expect(u?.match).toEqual({ workspaceId: "ws1", subscriptionId: "sub_1", customerId: "cus_1" });
    expect(u?.data).toMatchObject({ plan: "BUSINESS", planStatus: "active", stripeSubscriptionId: "sub_1", stripeCustomerId: "cus_1" });
    expect(u?.data.planPeriodEnd?.toISOString()).toBe(new Date(1_800_000_000_000).toISOString());
  });
  it("subscription.deleted drops back to FREE", () => {
    const u = billingUpdateFromEvent({ type: "customer.subscription.deleted", data: { object: { id: "sub_1", customer: "cus_1", status: "canceled", items: { data: [{ price: { id: "price_pro" } }] } } } }, env);
    expect(u?.data).toMatchObject({ plan: "FREE", planStatus: "canceled", planPeriodEnd: null, stripeSubscriptionId: null });
  });
  it("ignores unrelated events", () => {
    expect(billingUpdateFromEvent({ type: "invoice.paid", data: { object: { id: "in_1" } } }, env)).toBeNull();
    expect(billingUpdateFromEvent({}, env)).toBeNull();
  });
});
