import { cn } from "@/lib/utils";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-sm text-zinc-500">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
          <span className="bg-gradient-to-br from-zinc-900 via-indigo-800 to-violet-700 bg-clip-text text-transparent dark:from-zinc-100 dark:via-indigo-300 dark:to-violet-300">
            {title}
          </span>
        </h1>
        {subtitle && (
          <p className="mt-1.5 text-sm text-zinc-500">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
