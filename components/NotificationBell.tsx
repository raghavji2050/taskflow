"use client";

import { useCallback, useEffect, useState } from "react";
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

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

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

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(!open)}
        className="relative h-8 w-8 p-0"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-50 w-80 rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2 dark:border-zinc-800">
              <span className="text-sm font-semibold">Notifications</span>
              {unreadCount > 0 && (
                <button type="button" onClick={markAllRead} className="text-xs text-indigo-500">
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-zinc-400">No notifications</p>
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
                        "border-b border-zinc-50 px-4 py-3 last:border-0 dark:border-zinc-800",
                        !n.read && "bg-indigo-500/5"
                      )}
                    >
                      <p className="text-xs font-medium">{n.title}</p>
                      <p className="mt-0.5 text-xs text-zinc-500">{n.body}</p>
                      {isPendingInvite && n.inviteId && (
                        <div className="mt-2 flex gap-2">
                          <Button
                            size="sm"
                            className="h-7 flex-1 text-xs"
                            isLoading={actingId === n.inviteId}
                            onClick={() => handleInviteAction(n.inviteId!, "accept")}
                          >
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-7 flex-1 text-xs"
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
      )}
    </div>
  );
}
