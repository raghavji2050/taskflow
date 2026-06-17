"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface TaskFormSectionProps {
  title: string;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  className?: string;
}

export function TaskFormSection({
  title,
  children,
  collapsible = false,
  defaultOpen = true,
  className,
}: TaskFormSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (!collapsible) {
    return (
      <section className={cn("space-y-2", className)}>
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">{title}</h3>
        {children}
      </section>
    );
  }

  return (
    <section className={cn("rounded-lg border border-[var(--card-border)]", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left"
      >
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">{title}</h3>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-[var(--muted)] transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open && <div className="space-y-2 border-t border-[var(--card-border)] px-2.5 py-2">{children}</div>}
    </section>
  );
}
