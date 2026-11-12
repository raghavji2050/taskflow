"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Rocket, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { OnboardingStep } from "@/lib/onboarding-rules";

type State = { steps: OnboardingStep[]; progress: { done: number; total: number; percent: number; allDone: boolean }; show: boolean; isNewAccount: boolean };

/** Dashboard checklist for new accounts. Hides itself once done or dismissed. */
export function GettingStartedCard({ refreshKey, onTasksAdded }: { refreshKey?: number; onTasksAdded?: () => void }) {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/onboarding", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setState(await res.json());
  }, []);
  useEffect(() => { void load(); }, [load, refreshKey]);

  if (!state?.show) return null;

  const dismiss = async () => {
    setState({ ...state, show: false });
    await fetch("/api/onboarding", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dismissed: true }) });
    toast.success("Getting started hidden");
  };
  const addSamples = async () => {
    setBusy(true);
    const res = await fetch("/api/onboarding/sample-tasks", { method: "POST" });
    setBusy(false);
    if (!res.ok) return toast.error("Could not add sample tasks");
    toast.success("Added 3 sample tasks");
    onTasksAdded?.();
    void load();
  };

  return (
    <section aria-labelledby="getting-started-title" data-testid="getting-started" className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
          <Rocket className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="getting-started-title" className="text-sm font-semibold text-[var(--foreground)]">Getting started</h2>
          <p className="text-xs text-[var(--muted)]">{state.progress.done} of {state.progress.total} done</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-hover)]" role="progressbar" aria-label="Getting started progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={state.progress.percent}>
            <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${state.progress.percent}%` }} />
          </div>
        </div>
        <button type="button" onClick={() => void dismiss()} aria-label="Hide getting started" className="touch-target -m-1 rounded-lg p-1 text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]">
          <X className="h-4 w-4" />
        </button>
      </div>
      <ol className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {state.steps.map((s) => (
          <li key={s.id} data-step={s.id} data-done={s.done}>
            <Link href={s.href} aria-label={`${s.label}${s.done ? " (done)" : ""}`} className="flex items-start gap-2 rounded-lg p-2 hover:bg-[var(--surface-hover)]">
              <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${s.done ? "border-transparent bg-emerald-600 text-white" : "border-[var(--border)]"}`} aria-hidden="true">
                {s.done && <Check className="h-3 w-3" />}
              </span>
              <span className="min-w-0">
                <span className={`block text-sm ${s.done ? "text-[var(--muted)] line-through" : "font-medium text-[var(--foreground)]"}`}>
                  {s.label}
                </span>
                {!s.done && <span className="block text-xs text-[var(--muted)]">{s.hint}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap gap-2">
        {state.isNewAccount && (
          <Button size="sm" variant="secondary" onClick={() => void addSamples()} isLoading={busy}>
            <Sparkles className="h-4 w-4" /> Add sample tasks
          </Button>
        )}
        <Link href="/dashboard/welcome" className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)]">
          Quick setup
        </Link>
      </div>
    </section>
  );
}
