import { cn } from "@/lib/utils";

type GlassPanelPadding = "none" | "compact" | "default" | "lg";

const paddingMap: Record<GlassPanelPadding, string> = {
  none: "",
  compact: "p-3 sm:p-4",
  default: "p-4 sm:p-5 lg:p-6",
  lg: "p-5 sm:p-6 lg:p-8",
};

interface GlassPanelProps {
  children: React.ReactNode;
  className?: string;
  padding?: GlassPanelPadding;
  glow?: boolean;
  neonBorder?: boolean;
}

export function GlassPanel({
  children,
  className,
  padding = "default",
  glow = false,
  neonBorder: _neonBorder = false,
}: GlassPanelProps) {
  return (
    <div
      className={cn(
        "surface-panel rounded-xl",
        glow && "elevate-hover",
        paddingMap[padding],
        className
      )}
    >
      {children}
    </div>
  );
}
