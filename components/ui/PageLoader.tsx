import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageLoader({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex min-h-[40vh] flex-col items-center justify-center gap-3 text-[var(--muted)]",
        className
      )}
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
      <p className="text-sm">Loading…</p>
    </div>
  );
}
