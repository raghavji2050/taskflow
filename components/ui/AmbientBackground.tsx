import { cn } from "@/lib/utils";

interface AmbientBackgroundProps {
  children: React.ReactNode;
  className?: string;
}

export function AmbientBackground({ children, className }: AmbientBackgroundProps) {
  return <div className={cn("app-mesh-bg", className)}>{children}</div>;
}
