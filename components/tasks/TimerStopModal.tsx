"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

export type TaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED";

export interface TimerStopSubmitData {
  description?: string | null;
  taskStatus?: TaskStatus;
}

interface TimerStopModalProps {
  isOpen: boolean;
  initialNote?: string | null;
  initialStatus?: TaskStatus | string | null;
  onClose: () => void;
  onSubmit: (data: TimerStopSubmitData) => Promise<void>;
}

const STATUS_OPTIONS = [
  { value: "PENDING", label: "Pending" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "COMPLETED", label: "Completed" },
];

function normalizeStatus(status?: string | null): TaskStatus {
  if (status === "IN_PROGRESS" || status === "COMPLETED") return status;
  return "PENDING";
}

export function TimerStopModal({
  isOpen,
  initialNote = "",
  initialStatus = "IN_PROGRESS",
  onClose,
  onSubmit,
}: TimerStopModalProps) {
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<TaskStatus>("IN_PROGRESS");
  const [saving, setSaving] = useState(false);

  const normalizedInitialStatus = normalizeStatus(initialStatus);

  useEffect(() => {
    if (!isOpen) return;
    setNote(initialNote ?? "");
    setStatus(normalizedInitialStatus);
  }, [isOpen, initialNote, normalizedInitialStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const trimmed = note.trim();
      const payload: TimerStopSubmitData = {
        description: trimmed || null,
      };
      if (status !== normalizedInitialStatus) {
        payload.taskStatus = status;
      }
      await onSubmit(payload);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Stop timer" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Textarea
          label="Session note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Edit session note (optional)"
          maxLength={500}
          rows={4}
          autoFocus
        />
        <p className="text-xs text-[var(--muted)]">{note.length}/500</p>
        <Select
          label="Task status"
          value={status}
          onChange={(e) => setStatus(e.target.value as TaskStatus)}
          options={STATUS_OPTIONS}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" disabled={saving}>
            {saving ? "Stopping…" : "Stop timer"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
