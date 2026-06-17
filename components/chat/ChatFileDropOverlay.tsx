import { Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatFileDropOverlayProps {
  label?: string;
  compact?: boolean;
  className?: string;
}

export function ChatFileDropOverlay({
  label = "Drop files to attach",
  compact = false,
  className,
}: ChatFileDropOverlayProps) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-[var(--accent)] bg-[var(--accent)]/10 backdrop-blur-[1px]",
        className
      )}
    >
      <p
        className={cn(
          "flex items-center gap-2 rounded-lg bg-[var(--card)] font-medium text-[var(--accent)] shadow-sm",
          compact ? "px-2 py-1 text-[10px]" : "px-3 py-2 text-sm"
        )}
      >
        <Paperclip className={compact ? "h-3 w-3" : "h-4 w-4"} />
        {label}
      </p>
    </div>
  );
}
