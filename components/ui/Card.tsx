import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  glass?: boolean;
}

export function Card({ children, className, glass = false }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-200/80 bg-white shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/60",
        glass && "glass-card shadow-none",
        className
      )}
    >
      {children}
    </div>
  );
}
