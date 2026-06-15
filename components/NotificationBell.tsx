"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { WORKSPACE_STORAGE_KEY } from "@/components/WorkspaceProvider";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface NotificationInvite {
  id: string;
  status: string;
  workspace: { id: string; name: string };
  inviter: { id: string; name: string };
}

interface Notification {
  id: string;
  title: string;
  body: string;
  read: boolean;
  type: string;
  inviteId: string | null;
  invite: NotificationInvite | null;
  createdAt: string;
}

const PANEL_WIDTH = 360;

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  const updatePosition = useCallback(() => {
    const el = buttonRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let left = rect.right + 8;
    if (left + PANEL_WIDTH > window.innerWidth - 12) {
      left = rect.left - PANEL_WIDTH - 8;
    }
    if (left < 12) left = 12;
    setPosition({ top: rect.top, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  const fetchNotifications = useCallback(async () => {
    const res = await fetch("/api/notifications");
    const data = await res.json();
    if (res.ok) {
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    const onRealtime = () => void fetchNotifications();
    window.addEventListener("taskflow:notification", onRealtime);
    return () => {
      clearInterval(interval);
      window.removeEventListener("taskflow:notification", onRealtime);
    };
  }, [fetchNotifications]);

  const markAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (!unreadIds.length) return;
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: unreadIds, read: true }),
    });
    fetchNotifications();
  };

  const handleInviteAction = async (inviteId: string, action: "accept" | "decline") => {
    setActingId(inviteId);
    try {
      const res = await fetch(`/api/invitations/${inviteId}/${action}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");

      if (action === "accept") {
        toast.success(`Joined ${data.workspace?.name ?? "workspace"}`);
        if (data.workspace?.id) {
          localStorage.setItem(WORKSPACE_STORAGE_KEY, data.workspace.id);
          window.location.href = "/dashboard";
          return;
        }
      } else {
        toast.success("Invitation declined");
      }

      await fetchNotifications();
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    } finally {
      setActingId(null);
    }
  };

  const panel = open && mounted ? (
    <>
      <div className="fixed inset-0 z-[200]" onClick={() => setOpen(false)} aria-hidden="true" />
      <div
        className="fixed z-[201] overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl"
        style={{ top: position.top, left: position.left, width: PANEL_WIDTH }}
      >
        <div className="flex items-center justify-between border-b border-[var(--card-border)] px-4 py-3">
          <span className="text-sm font-semibold text-[var(--foreground)]">Notifications</span>
          {unreadCount > 0 && (
            <button type="button" onClick={markAllRead} className="text-xs font-medium text-[var(--accent)] hover:underline">
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-[min(420px,70vh)] overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-[var(--muted)]">No notifications</p>
          ) : (
            notifications.map((n) => {
              const isPendingInvite =
                n.type === "workspace_invite" &&
                n.inviteId &&
                n.invite?.status === "PENDING";

              return (
                <div
                  key={n.id}
                  className={cn(
                    "border-b border-[var(--card-border)] px-4 py-3 last:border-0",
                    !n.read && "bg-[var(--accent-soft)]/40 dark:bg-[var(--accent-muted)]/25"
                  )}
                >
                  <p className="text-sm font-medium text-[var(--foreground)]">{n.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">{n.body}</p>
                  {isPendingInvite && n.inviteId && (
                    <div className="mt-2.5 flex gap-2">
                      <Button
                        size="sm"
                        className="h-8 flex-1 text-xs"
                        isLoading={actingId === n.inviteId}
                        onClick={() => handleInviteAction(n.inviteId!, "accept")}
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 flex-1 text-xs"
                        disabled={actingId === n.inviteId}
                        onClick={() => handleInviteAction(n.inviteId!, "decline")}
                      >
                        Decline
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  ) : null;

  return (
    <>
      <Button
        ref={buttonRef}
        variant="ghost"
        size="sm"
        onClick={() => setOpen(!open)}
        className="relative h-8 w-8 shrink-0 rounded-lg p-0 text-[var(--muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--foreground)]"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>
      {mounted && panel ? createPortal(panel, document.body) : null}
    </>
  );
}
