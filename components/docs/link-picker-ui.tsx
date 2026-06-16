"use client";

import type { ReactNode } from "react";
import { Link2, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

export function LinkSearchInput({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      hideLabel
      disabled={disabled}
      startIcon={<Search className="h-4 w-4" />}
      className="text-xs"
    />
  );
}

export function LinkPickerHint({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-1 text-[10px] leading-snug text-[var(--muted)]">
      <Link2 className="h-3 w-3 shrink-0 opacity-70" />
      {children}
    </p>
  );
}

export function LinkPickerList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-[var(--card-border)] bg-[var(--background)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function LinkPickerScroll({ children }: { children: ReactNode }) {
  return <div className="max-h-44 overflow-y-auto">{children}</div>;
}

export function LinkPickerLoading() {
  return (
    <div className="flex items-center justify-center gap-2 py-6 text-xs text-[var(--muted)]">
      <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
      Searching…
    </div>
  );
}

export function LinkPickerEmpty({ message }: { message: string }) {
  return (
    <p className="px-3 py-6 text-center text-xs text-[var(--muted)]">{message}</p>
  );
}

export function LinkPickerRow({
  children,
  onClick,
  disabled,
  linking,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  linking?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled || linking}
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-2 border-b border-[var(--card-border)] px-3 py-2.5 text-left last:border-0",
        "transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-50",
        linking && "bg-[var(--accent-soft)]"
      )}
    >
      <div className="min-w-0 flex-1">{children}</div>
      <span
        className={cn(
          "flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium",
          "text-[var(--accent)] opacity-0 transition-opacity group-hover:opacity-100",
          linking && "opacity-100"
        )}
      >
        {linking ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Link2 className="h-3 w-3" />
        )}
        Link
      </span>
    </button>
  );
}
