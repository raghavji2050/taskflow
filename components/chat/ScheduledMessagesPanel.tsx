"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Clock, Loader2, Pencil, Send, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/PageHeader";
import { ScheduleMessageDialog } from "@/components/chat/ScheduleMessageDialog";
import { formatScheduledForDisplay } from "@/lib/schedule-message-time";
import type { ScheduledMessageClient } from "@/lib/scheduled-message-types";
import { ScheduledCountdown } from "@/lib/use-scheduled-countdown";

export function ScheduledMessagesPanel() {
  const [items, setItems] = useState<ScheduledMessageClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ScheduledMessageClient | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/conversations/scheduled-messages?status=ALL&limit=100");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setItems(data.scheduledMessages ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load scheduled messages");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sendNow = async (item: ScheduledMessageClient) => {
    setActingId(item.id);
    try {
      const res = await fetch(`/api/conversations/scheduled-messages/${item.id}/send-now`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not send");
      toast.success("Message sent");
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send");
    } finally {
      setActingId(null);
    }
  };

  const cancelItem = async (item: ScheduledMessageClient) => {
    setActingId(item.id);
    try {
      const res = await fetch(`/api/conversations/scheduled-messages/${item.id}?cancel=true`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not cancel");
      toast.success("Scheduled message cancelled");
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to cancel");
    } finally {
      setActingId(null);
    }
  };

  const deleteItem = async (item: ScheduledMessageClient) => {
    setActingId(item.id);
    try {
      const res = await fetch(`/api/conversations/scheduled-messages/${item.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not delete");
      toast.success("Scheduled message deleted");
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete");
    } finally {
      setActingId(null);
    }
  };

  const pending = items.filter((i) => i.status === "PENDING");

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        className="mb-6"
        title="Scheduled Messages"
        subtitle="Manage messages scheduled to send later"
        actions={
          <Link href="/settings">
            <Button variant="secondary" size="sm">
              Back to settings
            </Button>
          </Link>
        }
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--muted)]" />
        </div>
      ) : items.length === 0 ? (
        <Card className="p-8 text-center">
          <Clock className="mx-auto mb-3 h-8 w-8 text-[var(--muted)]" />
          <p className="font-medium text-[var(--foreground)]">No scheduled messages</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Use the clock icon in chat to schedule a message.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const busy = actingId === item.id;
            const preview =
              item.body.length > 100 ? `${item.body.slice(0, 100)}…` : item.body;
            return (
              <Card key={item.id} className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--foreground)]">{preview}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      To: {item.conversationTitle ?? "Chat"}
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {formatScheduledForDisplay(item.scheduledFor, item.timezone)}
                      {item.status === "PENDING" && (
                        <ScheduledCountdown
                          scheduledFor={item.scheduledFor}
                          className="ml-2 tabular-nums font-medium text-[var(--accent)]"
                        />
                      )}
                    </p>
                    <span
                      className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        item.status === "PENDING"
                          ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                          : item.status === "SENT"
                            ? "bg-emerald-500/10 text-emerald-600"
                            : "bg-[var(--surface-hover)] text-[var(--muted)]"
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                  {item.status === "PENDING" && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => setEditing(item)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={busy}
                        onClick={() => void sendNow(item)}
                      >
                        <Send className="h-3.5 w-3.5" />
                        Send now
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => void cancelItem(item)}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busy}
                        onClick={() => void deleteItem(item)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {editing && (
        <ScheduleMessageDialog
          isOpen={Boolean(editing)}
          onClose={() => setEditing(null)}
          conversationId={editing.conversationId}
          editing={editing}
          onScheduled={() => {
            setEditing(null);
            void load();
          }}
        />
      )}

      {pending.length > 0 && (
        <p className="mt-4 text-center text-xs text-[var(--muted)]">
          {pending.length} pending scheduled message{pending.length === 1 ? "" : "s"}
        </p>
      )}
    </div>
  );
}
