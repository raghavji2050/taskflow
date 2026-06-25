import {
  Crown,
  LogOut,
  Pencil,
  Shield,
  ShieldOff,
  UserMinus,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type SystemActivityKind =
  | "group_created"
  | "group_renamed"
  | "member_added"
  | "member_removed"
  | "member_left"
  | "member_promoted"
  | "member_demoted"
  | "ownership_transferred";

const ACTIVITY_META: Record<
  SystemActivityKind,
  { icon: LucideIcon; tone: "neutral" | "join" | "leave" | "edit" | "role" }
> = {
  group_created: { icon: Users, tone: "join" },
  group_renamed: { icon: Pencil, tone: "edit" },
  member_added: { icon: UserPlus, tone: "join" },
  member_removed: { icon: UserMinus, tone: "leave" },
  member_left: { icon: LogOut, tone: "leave" },
  member_promoted: { icon: Shield, tone: "role" },
  member_demoted: { icon: ShieldOff, tone: "role" },
  ownership_transferred: { icon: Crown, tone: "role" },
};

const TONE_CLASSES: Record<(typeof ACTIVITY_META)[SystemActivityKind]["tone"], string> = {
  neutral: "text-[var(--muted-foreground)]",
  join: "text-emerald-600/90 dark:text-emerald-400/90",
  leave: "text-amber-700/90 dark:text-amber-400/90",
  edit: "text-sky-700/90 dark:text-sky-400/90",
  role: "text-violet-700/90 dark:text-violet-400/90",
};

interface SystemActivityLineProps {
  body: string;
  systemKind?: string | null;
  createdAt?: string;
  compact?: boolean;
}

export function SystemActivityLine({
  body,
  systemKind,
  createdAt,
  compact = false,
}: SystemActivityLineProps) {
  const meta =
    systemKind && systemKind in ACTIVITY_META
      ? ACTIVITY_META[systemKind as SystemActivityKind]
      : null;
  const Icon = meta?.icon ?? Users;
  const toneClass = meta ? TONE_CLASSES[meta.tone] : TONE_CLASSES.neutral;
  const time =
    createdAt &&
    new Date(createdAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div
      className={cn(
        "flex justify-center px-2",
        compact ? "my-1" : "my-2.5"
      )}
      role="status"
      aria-live="polite"
    >
      <div
        className={cn(
          "inline-flex max-w-[min(100%,28rem)] items-center gap-2 rounded-full border border-[var(--border)]",
          "bg-[color-mix(in_oklab,var(--surface-1)_88%,transparent)] px-3 py-1.5 shadow-[var(--shadow-sm)]",
          "backdrop-blur-[2px]"
        )}
      >
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
            "bg-[color-mix(in_oklab,var(--surface-hover)_70%,transparent)]",
            toneClass
          )}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <span className="min-w-0 text-left text-[11px] leading-snug text-[var(--muted-foreground)]">
          {body}
        </span>
        {time && (
          <span className="shrink-0 text-[10px] tabular-nums text-[var(--muted)] opacity-80">
            {time}
          </span>
        )}
      </div>
    </div>
  );
}
