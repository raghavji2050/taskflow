"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

interface ManualTimeEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { date: string; hours: number; minutes: number; description: string }) => Promise<void>;
}

export function ManualTimeEntryModal({ isOpen, onClose, onSubmit }: ManualTimeEntryModalProps) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState("1");
  const [minutes, setMinutes] = useState("0");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit({
        date,
        hours: Number(hours) || 0,
        minutes: Number(minutes) || 0,
        description: description.trim(),
      });
      onClose();
      setDescription("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Log time" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Date</label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Hours</label>
            <Input
              type="number"
              min={0}
              max={24}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Minutes</label>
            <Input
              type="number"
              min={0}
              max={59}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              required
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Description</label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What did you work on?"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Log time"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
