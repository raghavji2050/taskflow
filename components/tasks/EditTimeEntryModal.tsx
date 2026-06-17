"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { formatDurationHms } from "@/lib/time-format";

export interface TimeEntryRow {
  id: string;
  startTime: string;
  duration: number;
  description: string | null;
}

interface EditTimeEntryModalProps {
  entry: TimeEntryRow | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    description: string;
    date: string;
    hours: number;
    minutes: number;
  }) => Promise<void>;
}

export function EditTimeEntryModal({ entry, isOpen, onClose, onSubmit }: EditTimeEntryModalProps) {
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [hours, setHours] = useState("0");
  const [minutes, setMinutes] = useState("0");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!entry || !isOpen) return;
    setDate(entry.startTime.slice(0, 10));
    setHours(String(Math.floor(entry.duration / 3600)));
    setMinutes(String(Math.floor((entry.duration % 3600) / 60)));
    setDescription(entry.description ?? "");
  }, [entry, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entry) return;
    setSaving(true);
    try {
      await onSubmit({
        description: description.trim(),
        date,
        hours: Number(hours) || 0,
        minutes: Number(minutes) || 0,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit time entry" size="md">
      {entry && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-xs text-[var(--muted)]">
            Original duration: {formatDurationHms(entry.duration)}
          </p>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Date</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Hours</label>
              <Input type="number" min={0} max={24} value={hours} onChange={(e) => setHours(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Minutes</label>
              <Input type="number" min={0} max={59} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Description</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
