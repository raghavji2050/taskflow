"use client";

import { useRealtime } from "@/components/RealtimeProvider";
import { cn, getInitials } from "@/lib/utils";

interface PresenceAvatarProps {
  name: string;
  image?: string | null;
  userId?: string;
  isOnline?: boolean;
  size?: "xs" | "sm" | "md";
  className?: string;
  showPresence?: boolean;
}

const sizeClasses = {
  xs: { box: "h-8 w-8 text-[11px]", dot: "h-2 w-2 border-2" },
  sm: { box: "h-9 w-9 text-[11px]", dot: "h-2.5 w-2.5 border-2" },
  md: { box: "h-10 w-10 text-xs", dot: "h-3 w-3 border-2" },
} as const;

export function PresenceAvatar({
  name,
  image,
  userId,
  isOnline: isOnlineProp,
  size = "sm",
  className,
  showPresence = true,
}: PresenceAvatarProps) {
  const { isUserOnline } = useRealtime();
  const online = isOnlineProp ?? (userId ? isUserOnline(userId) : false);
  const { box, dot } = sizeClasses[size];

  return (
    <div
      className={cn(
        "relative flex shrink-0 self-start items-center justify-center overflow-visible rounded-full bg-[var(--accent)] font-semibold text-white",
        box,
        className
      )}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className={cn("h-full w-full rounded-full object-cover", box)} />
      ) : (
        getInitials(name)
      )}
      {showPresence && (
        <span
          className={cn(
            "pointer-events-none absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-[var(--card)]",
            dot,
            online ? "bg-emerald-500" : "bg-zinc-500"
          )}
          title={online ? "Online" : "Offline"}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
