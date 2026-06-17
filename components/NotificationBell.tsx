"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Archive, ArchiveRestore, Bell, Check } from "lucide-react";
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
  conversationId: string | null;
  messageId: string | null;
  invite: NotificationInvite | null;
  createdAt: string;
}

const PANEL_WIDTH = 360;

type NotificationBellProps = {
  /** Sidebar header: larger hit target, panel opens to the right of the bell */
  placement?: "default" | "sidebar";
};

export function NotificationBell({ placement = "default" }: NotificationBellProps) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  const updatePosition = useCallback(() => {
    const el = buttonRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let left =
      placement === "sidebar" ? rect.right + 10 : rect.right + 8;
    if (left + PANEL_WIDTH > window.innerWidth - 12) {
      left = rect.left - PANEL_WIDTH - 8;
    }
    if (left < 12) left = 12;
    const top = Math.max(12, rect.top);
    setPosition({ top, left });
  }, [placement]);

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
    const params = new URLSearchParams();
    if (showArchived) params.set("archived", "true");
    const res = await fetch(`/api/notifications?${params.toString()}`);
    const data = await res.json();
    if (res.ok) {
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    }
  }, [showArchived]);

  useEffect(() => {
    fetchNotifications();
    const onRealtime = () => void fetchNotifications();
    window.addEventListener("taskflow:notification", onRealtime);
    return () => {
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

  const markAsRead = async (id: string) => {
    setActingId(id);
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id], read: true }),
      });
      if (!res.ok) throw new Error("Could not mark as read");
      await fetchNotifications();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not mark as read");
    } finally {
      setActingId(null);
    }
  };

  const archiveNotification = async (id: string, archived: boolean) => {
    setActingId(id);
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id], archived }),
      });
      if (!res.ok) throw new Error("Could not update notification");
      await fetchNotifications();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update notification");
    } finally {
      setActingId(null);
    }
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

  const openNotification = (n: Notification) => {
    if ((n.type === "mention" || n.type === "message") && n.conversationId) {
      const path = `/dashboard/messages?c=${n.conversationId}${
        n.messageId ? `#msg-${n.messageId}` : ""
      }`;
      router.push(path);
      setOpen(false);
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
          <span className="text-sm font-semibold text-[var(--foreground)]">
            {showArchived ? "Archived" : "Notifications"}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className="flex items-center gap-1 text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              <Archive className="h-3 w-3" />
              {showArchived ? "Active" : "Archived"}
            </button>
            {!showArchived && unreadCount > 0 && (
              <button type="button" onClick={markAllRead} className="text-xs font-medium text-[var(--accent)] hover:underline">
                Mark all read
              </button>
            )}
          </div>
        </div>
        <div className="max-h-[min(420px,70vh)] overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-[var(--muted)]">
              {showArchived ? "No archived notifications" : "No notifications"}
            </p>
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
                    "group relative border-b border-[var(--card-border)] px-4 py-3 last:border-0",
                    !n.read && !showArchived && "bg-[var(--accent-soft)]/40 dark:bg-[var(--accent-muted)]/25"
                  )}
                >
                  <div
                    role={(n.type === "mention" || n.type === "message") && n.conversationId ? "button" : undefined}
                    tabIndex={(n.type === "mention" || n.type === "message") && n.conversationId ? 0 : undefined}
                    onClick={() => openNotification(n)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openNotification(n);
                      }
                    }}
                    className={cn(
                      (n.type === "mention" || n.type === "message") &&
                        n.conversationId &&
                        "cursor-pointer hover:opacity-90",
                      !showArchived && (!n.read ? "pr-16" : "pr-9")
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
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleInviteAction(n.inviteId!, "accept");
                          }}
                        >
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-8 flex-1 text-xs"
                          disabled={actingId === n.inviteId}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleInviteAction(n.inviteId!, "decline");
                          }}
                        >
                          Decline
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="absolute right-2 top-2 flex items-center gap-0.5">
                    {!showArchived && !n.read && (
                      <button
                        type="button"
                        disabled={actingId === n.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void markAsRead(n.id);
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--accent)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
                        aria-label="Mark as read"
                        title="Mark as read"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={actingId === n.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        void archiveNotification(n.id, !showArchived);
                      }}
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted)] transition-opacity hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]",
                        showArchived || !n.read
                          ? "opacity-100"
                          : "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                      )}
                      aria-label={showArchived ? "Restore notification" : "Archive notification"}
                      title={showArchived ? "Restore" : "Move to archive"}
                    >
                      {showArchived ? (
                        <ArchiveRestore className="h-3.5 w-3.5" />
                      ) : (
                        <Archive className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  ) : null;

  const isSidebar = placement === "sidebar";

  const trigger = isSidebar ? (
    <button
      ref={buttonRef}
      type="button"
      onClick={() => setOpen(!open)}
      className={cn(
        "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
        "text-[var(--muted)] transition-colors hover:bg-[var(--sidebar-hover)] hover:text-[var(--foreground)]",
        open && "bg-[var(--sidebar-hover)] text-[var(--foreground)]"
      )}
      aria-label="Notifications"
      aria-expanded={open}
    >
      <Bell className="h-[18px] w-[18px]" strokeWidth={2} />
      {unreadCount > 0 && (
        <span className="absolute right-1 top-1 flex h-4 min-w-4 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] font-bold leading-none text-white ring-2 ring-[var(--sidebar)]">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </button>
  ) : (
    <Button
      ref={buttonRef}
      variant="ghost"
      size="sm"
      onClick={() => setOpen(!open)}
      className="relative h-9 w-9 shrink-0 rounded-lg p-0"
      aria-label="Notifications"
      aria-expanded={open}
    >
      <Bell className="h-4 w-4" />
      {unreadCount > 0 && (
        <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] font-bold text-white">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </Button>
  );

  return (
    <>
      {trigger}
      {mounted && panel ? createPortal(panel, document.body) : null}
    </>
  );
}
