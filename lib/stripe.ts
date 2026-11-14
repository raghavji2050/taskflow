import { billingEnv } from "@/lib/billing-plans";

/** Minimal Stripe REST client (no SDK dependency). Server-only. */
const API = "https://api.stripe.com/v1";

export class StripeConfigError extends Error {
  status = 503;
}

function form(params: Record<string, string | undefined>) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) body.append(k, v);
  return body;
}

async function stripePost<T>(path: string, params: Record<string, string | undefined>): Promise<T> {
  const key = billingEnv().secretKey;
  if (!key) throw new StripeConfigError("Billing is not configured yet");
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form(params),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`Stripe ${path} failed: ${data.error?.message ?? res.status}`);
  return data;
}

/** Form body for POST /v1/checkout/sessions. Pure so unit tests can assert INR address collection. */
export function checkoutSessionParams(opts: { workspaceId: string; plan: string; priceId: string; customerId?: string | null; email?: string | null; origin: string }): Record<string, string | undefined> {
  const back = `${opts.origin}/dashboard/team?billing=`;
  const hasCustomer = Boolean(opts.customerId);
  return {
    mode: "subscription",
    "line_items[0][price]": opts.priceId,
    "line_items[0][quantity]": "1",
    client_reference_id: opts.workspaceId,
    "metadata[workspaceId]": opts.workspaceId,
    "metadata[plan]": opts.plan,
    "subscription_data[metadata][workspaceId]": opts.workspaceId,
    "subscription_data[metadata][plan]": opts.plan,
    customer: hasCustomer ? opts.customerId! : undefined,
    customer_email: hasCustomer ? undefined : opts.email ?? undefined,
    // INR charges on an Indian Stripe account need a name + address (RBI).
    billing_address_collection: "required",
    ...(hasCustomer
      ? { "customer_update[address]": "auto", "customer_update[name]": "auto" }
      : {}),
    allow_promotion_codes: "true",
    success_url: `${back}success&workspace=${opts.workspaceId}`,
    cancel_url: `${back}cancelled&workspace=${opts.workspaceId}`,
  };
}

export async function createCheckoutSession(opts: { workspaceId: string; plan: string; priceId: string; customerId?: string | null; email?: string | null; origin: string }) {
  return stripePost<{ id: string; url: string }>("/checkout/sessions", checkoutSessionParams(opts));
}

export async function createPortalSession(customerId: string, origin: string) {
  return stripePost<{ url: string }>("/billing_portal/sessions", { customer: customerId, return_url: `${origin}/dashboard/team` });
}
