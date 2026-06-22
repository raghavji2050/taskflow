"use client";

import { cn } from "@/lib/utils";
import { ResponsiveStack } from "@/components/ui/ResponsiveStack";
import { FadeIn } from "@/components/motion";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <FadeIn
      className={cn(
        "mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className="section-label text-[var(--accent)]">{eyebrow}</p>
        )}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--foreground)] sm:text-3xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1.5 text-sm text-[var(--muted)] sm:text-base">{subtitle}</p>
        )}
      </div>
      {actions && <ResponsiveStack>{actions}</ResponsiveStack>}
    </FadeIn>
  );
}
