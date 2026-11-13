# Billing (Stripe) — Day 27

Workspaces have a plan: **Free**, **Pro** or **Business** (`Workspace.plan`). Everything is
off until Stripe env vars are set, so the app works unchanged without them.

| Plan | Members | Projects |
|------|---------|----------|
| Free | 5 | 5 |
| Pro | 25 | 50 |
| Business | Unlimited | Unlimited |

Prices are **not** in code; they come from your Stripe Prices.

## Env vars (Vercel → Project → Settings → Environment Variables)

| Var | What |
|-----|------|
| `STRIPE_SECRET_KEY` | `sk_live_…` / `sk_test_…` (server only) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` from the webhook endpoint below |
| `STRIPE_PRICE_PRO` | Stripe Price id (recurring) for Pro |
| `STRIPE_PRICE_BUSINESS` | Stripe Price id (recurring) for Business |
| `BILLING_ENFORCE_LIMITS` | `true` to block new members/projects over the plan (HTTP 402). Default off. |

## Stripe setup
1. Create two recurring Prices (e.g. in INR) and copy their ids.
2. Add a webhook endpoint: `https://<your-domain>/api/billing/webhook`, events
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`.
3. Turn on the Customer Portal (Settings → Billing → Customer portal).

## Flow
- Team page → **Plan & billing** card shows plan + usage for any member.
- Owners/admins: **Upgrade** → `POST /api/workspaces/:id/billing/checkout` → Stripe Checkout.
- Stripe calls the webhook (signature verified, 5 min tolerance) → plan/status/period end saved.
- **Manage billing & invoices** → Stripe Customer Portal (`POST …/billing/portal`).
- A paid plan only counts while the subscription is `active`, `trialing` or `past_due`.
- Plan changes are written to the audit log.
