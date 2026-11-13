"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/Button";

type Usage = { kind: string; used: number; limit: number | null; percent: number; over: boolean };
type Plan = { id: string; name: string; tagline: string; features: string[]; checkoutAvailable: boolean };
type Billing = {
  plan: string; subscribedPlan: string; status: string | null; periodEnd: string | null; hasCustomer: boolean;
  enforceLimits: boolean; usage: Usage[]; plans: Plan[]; configured: boolean; canManage: boolean;
};

/** Workspace plan + usage. Owners/admins can upgrade (Stripe Checkout) or manage billing (portal). */
export function BillingCard({ workspaceId }: { workspaceId: string }) {
  const [billing, setBilling] = useState<Billing | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/workspaces/${workspaceId}/billing`, { cache: "no-store" });
    if (res.ok) setBilling((await res.json()).billing);
  }, [workspaceId]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const result = p.get("billing");
    if (!result || p.get("workspace") !== workspaceId) return;
    if (result === "success") toast.success("Payment received — your plan updates in a few seconds");
    else if (result === "cancelled") toast("Upgrade cancelled");
    p.delete("billing"); p.delete("workspace");
    window.history.replaceState(null, "", `${window.location.pathname}${p.size ? `?${p}` : ""}`);
  }, [workspaceId]);

  const go = async (path: string, body: object | undefined, key: string) => {
    setBusy(key);
    const res = await fetch(`/api/workspaces/${workspaceId}/billing/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (res.ok && data.url) window.location.assign(data.url);
    else toast.error(data.error ?? "Could not open billing");
  };

  if (!billing) return null;
  const current = billing.plans.find((p) => p.id === billing.plan);

  return (
    <section className="mt-4 rounded-lg border border-[var(--border)] p-3" aria-label="Plan and billing" data-testid="billing">
      <p className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        <CreditCard className="h-3 w-3" aria-hidden="true" /> Plan &amp; billing
      </p>
      <p className="text-sm text-[var(--foreground)]">
        Current plan: <span className="font-semibold" data-testid="billing-plan">{current?.name ?? billing.plan}</span>
        {billing.status && billing.plan !== "FREE" && <span className="text-xs text-[var(--muted)]"> · {billing.status}</span>}
        {billing.periodEnd && billing.plan !== "FREE" && <span className="text-xs text-[var(--muted)]"> · renews {new Date(billing.periodEnd).toLocaleDateString()}</span>}
      </p>
      <ul className="mt-2 space-y-1.5" aria-label="Plan usage">
        {billing.usage.map((u) => (
          <li key={u.kind} className="text-xs">
            <div className="flex justify-between text-[var(--muted)]">
              <span className="capitalize">{u.kind}</span>
              <span className={u.over ? "font-medium text-red-700 dark:text-red-400" : ""}>{u.used} / {u.limit ?? "Unlimited"}</span>
            </div>
            {u.limit !== null && (
              <div className="mt-0.5 h-1.5 rounded-full bg-[var(--surface-3)]" role="progressbar" aria-label={`${u.kind} used`} aria-valuenow={u.percent} aria-valuemin={0} aria-valuemax={100}>
                <div className={`h-1.5 rounded-full ${u.percent >= 90 ? "bg-amber-500" : "bg-[var(--accent)]"}`} style={{ width: `${u.percent}%` }} />
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {billing.plans.map((p) => (
          <div key={p.id} className={`rounded-md border p-2 text-xs ${p.id === billing.plan ? "border-[var(--accent)]" : "border-[var(--border)]"}`} data-testid={`plan-${p.id}`}>
            <p className="font-semibold text-[var(--foreground)]">{p.name}</p>
            <p className="text-[var(--muted)]">{p.tagline}</p>
            <ul className="mt-1 list-disc pl-4 text-[var(--muted)]">{p.features.map((f) => <li key={f}>{f}</li>)}</ul>
            {billing.canManage && p.id !== "FREE" && p.id !== billing.plan && (
              <Button size="sm" className="mt-2 w-full" disabled={!p.checkoutAvailable} isLoading={busy === p.id} onClick={() => void go("checkout", { plan: p.id }, p.id)}>
                Upgrade to {p.name}
              </Button>
            )}
          </div>
        ))}
      </div>
      {billing.canManage && billing.hasCustomer && (
        <Button size="sm" variant="secondary" className="mt-2" isLoading={busy === "portal"} onClick={() => void go("portal", undefined, "portal")}>Manage billing &amp; invoices</Button>
      )}
      {!billing.configured && billing.canManage && (
        <p className="mt-2 text-xs text-[var(--muted)]" data-testid="billing-not-configured">Online payments are not switched on yet. Plans and limits are shown so you can plan ahead.</p>
      )}
      {!billing.canManage && <p className="mt-2 text-xs text-[var(--muted)]">Only workspace owners and admins can change the plan.</p>}
    </section>
  );
}
