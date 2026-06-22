"use client";

import { useEffect, useMemo, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  COMMON_TIMEZONES,
  formatScheduledForShort,
  getDefaultTimezone,
  getQuickSchedulePresets,
} from "@/lib/schedule-message-time";
import type { ScheduledMessageClient } from "@/lib/scheduled-message-types";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/use-visual-viewport";

interface ScheduleMessageDialogProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  parentId?: string | null;
  initialBody?: string;
  pendingFiles?: File[];
  editing?: ScheduledMessageClient | null;
  onScheduled: () => void;
}

export function ScheduleMessageDialog({
  isOpen,
  onClose,
  conversationId,
  parentId,
  initialBody = "",
  pendingFiles = [],
  editing,
  onScheduled,
}: ScheduleMessageDialogProps) {
  const isMobile = useMediaQuery("(max-width: 639px)");
  const [body, setBody] = useState(initialBody);
  const [timezone, setTimezone] = useState(getDefaultTimezone());
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [showCustom, setShowCustom] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setBody(editing?.body ?? initialBody);
    setTimezone(editing?.timezone ?? getDefaultTimezone());
    if (editing) {
      setDate(formatInTimeZone(editing.scheduledFor, editing.timezone, "yyyy-MM-dd"));
      setTime(formatInTimeZone(editing.scheduledFor, editing.timezone, "HH:mm"));
      setShowCustom(true);
    } else {
      setShowCustom(false);
      setDate("");
      setTime("09:00");
    }
  }, [isOpen, editing, initialBody]);

  const presets = useMemo(() => getQuickSchedulePresets(timezone), [timezone]);

  const timezoneOptions = useMemo(() => {
    const set = new Set<string>([...COMMON_TIMEZONES, timezone]);
    return Array.from(set).map((tz) => ({ value: tz, label: tz }));
  }, [timezone]);

  const submitSchedule = async (scheduledFor?: Date) => {
    const trimmed = body.trim();
    if (!trimmed && pendingFiles.length === 0 && !editing?.attachments.length) {
      toast.error("Add a message or attachment");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.set("body", trimmed);
      formData.set("timezone", timezone);
      if (parentId) formData.set("parentId", parentId);

      if (scheduledFor) {
        formData.set("scheduledFor", scheduledFor.toISOString());
      } else {
        if (!date || !time) {
          toast.error("Choose a date and time");
          return;
        }
        formData.set("date", date);
        formData.set("time", time);
      }

      if (editing) {
        const res = await fetch(`/api/conversations/scheduled-messages/${editing.id}`, {
          method: "PATCH",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not update scheduled message");
        toast.success("Scheduled message updated");
      } else {
        formData.set("conversationId", conversationId);
        pendingFiles.forEach((file) => formData.append("files", file));
        const res = await fetch("/api/conversations/scheduled-messages", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not schedule message");
        toast.success("Message scheduled");
      }

      onScheduled();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to schedule message");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? "Edit scheduled message" : "Schedule message"}
      description={
        editing
          ? formatScheduledForShort(editing.scheduledFor, editing.timezone)
          : "Choose when to send this message"
      }
      size={isMobile ? "full" : "md"}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          {showCustom && (
            <Button
              type="button"
              variant="primary"
              disabled={submitting}
              onClick={() => void submitSchedule()}
            >
              {editing ? "Save changes" : "Schedule"}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--muted)]">Message</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            placeholder="Message content"
          />
        </div>

        {pendingFiles.length > 0 && !editing && (
          <p className="text-xs text-[var(--muted)]">
            {pendingFiles.length} attachment{pendingFiles.length === 1 ? "" : "s"} will be included
          </p>
        )}

        {editing && editing.attachments.length > 0 && (
          <p className="text-xs text-[var(--muted)]">
            {editing.attachments.length} attachment{editing.attachments.length === 1 ? "" : "s"} attached
          </p>
        )}

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Quick schedule
          </p>
          <div className="grid gap-2">
            {!editing && (
              <button
                type="button"
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-left text-sm hover:bg-[var(--surface-hover)]"
                onClick={onClose}
              >
                Send now
              </button>
            )}
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                disabled={submitting}
                className={cn(
                  "rounded-lg border border-[var(--border)] px-3 py-2 text-left text-sm hover:bg-[var(--surface-hover)]",
                  "disabled:opacity-50"
                )}
                onClick={() => void submitSchedule(preset.scheduledFor)}
              >
                {preset.label}
              </button>
            ))}
            <button
              type="button"
              className={cn(
                "rounded-lg border px-3 py-2 text-left text-sm",
                showCustom
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                  : "border-[var(--border)] hover:bg-[var(--surface-hover)]"
              )}
              onClick={() => setShowCustom(true)}
            >
              Custom date &amp; time
            </button>
          </div>
        </div>

        {showCustom && (
          <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface-hover)]/40 p-3">
            <Input
              label="Date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <Input
              label="Time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
            <Select
              label="Timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              options={timezoneOptions}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
