import { cn } from "@/lib/utils";

interface GlowBadgeProps {
  children: React.ReactNode;
  className?: string;
  variant?: "accent" | "cyan" | "muted";
  size?: "sm" | "md";
}

const variantClasses = {
  accent: "bg-[var(--accent-soft)] text-[var(--accent)]",
  cyan: "bg-[var(--accent-soft)] text-[var(--accent)]",
  muted: "bg-[var(--surface-3)] text-[var(--muted)]",
};

const sizeClasses = {
  sm: "min-w-[1.125rem] h-[1.125rem] px-1 text-[10px]",
  md: "min-w-[1.25rem] h-5 px-1.5 text-[11px]",
};

export function GlowBadge({
  children,
  className,
  variant = "accent",
  size = "sm",
}: GlowBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold leading-none",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
    >
      {children}
    </span>
  );
}
