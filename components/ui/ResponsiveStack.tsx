import { cn } from "@/lib/utils";

interface ResponsiveStackProps {
  children: React.ReactNode;
  className?: string;
}

/** Stacks action buttons vertically on mobile, inline on sm+ */
export function ResponsiveStack({ children, className }: ResponsiveStackProps) {
  return (
    <div
      className={cn(
        "flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end",
        className
      )}
    >
      {children}
    </div>
  );
}
