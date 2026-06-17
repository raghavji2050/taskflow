"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  "Details",
  "Agenda",
  "Discussion",
  "Actions",
  "Follow-up",
  "Review",
] as const;

interface MomWizardProgressProps {
  step: number;
  onStepClick?: (index: number) => void;
}

export function MomWizardProgress({ step, onStepClick }: MomWizardProgressProps) {
  return (
    <nav className="mb-5" aria-label="MoM wizard steps">
      <ol className="flex items-center">
        {STEPS.map((label, index) => {
          const done = index < step;
          const current = index === step;
          const isLast = index === STEPS.length - 1;

          return (
            <li
              key={label}
              className={cn("flex items-center", !isLast && "flex-1")}
            >
              <button
                type="button"
                onClick={() => onStepClick?.(index)}
                className={cn(
                  "group flex flex-col items-center gap-1.5 rounded-lg px-1 py-1 transition-colors",
                  "hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                )}
                aria-current={current ? "step" : undefined}
                aria-label={`${label}${done ? ", completed" : current ? ", current" : ""}`}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-all",
                    done && "bg-[var(--accent)] text-white shadow-sm",
                    current &&
                      !done &&
                      "border-2 border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)] ring-4 ring-[var(--accent)]/15",
                    !done &&
                      !current &&
                      "border border-[var(--card-border)] bg-[var(--background)] text-[var(--muted)] group-hover:border-[var(--accent)]/40 group-hover:text-[var(--foreground)]"
                  )}
                >
                  {done ? <Check className="h-4 w-4" strokeWidth={2.5} /> : index + 1}
                </span>
                <span
                  className={cn(
                    "max-w-[4.5rem] truncate text-center text-[10px] font-medium leading-tight sm:max-w-none sm:text-[11px]",
                    current ? "text-[var(--foreground)]" : "text-[var(--muted)] group-hover:text-[var(--foreground)]"
                  )}
                >
                  {label}
                </span>
              </button>
              {!isLast && (
                <div
                  className={cn(
                    "mx-1 h-0.5 min-w-[0.75rem] flex-1 rounded-full transition-colors",
                    index < step ? "bg-[var(--accent)]" : "bg-[var(--card-border)]"
                  )}
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export { STEPS as MOM_WIZARD_STEPS };
