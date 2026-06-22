import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  glass?: boolean;
  glow?: boolean;
}

export function Card({ children, className, glass: _glass = true, glow = false }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--border)] bg-[var(--surface-1)] shadow-sm",
        glow && "elevate-hover",
        className
      )}
    >
      {children}
    </div>
  );
}
