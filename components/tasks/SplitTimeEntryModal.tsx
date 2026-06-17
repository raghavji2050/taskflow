"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { formatDurationHms, parseDurationInput } from "@/lib/time-format";
import type { TimeEntryRow } from "@/components/tasks/EditTimeEntryModal";

interface Segment {
  hours: string;
  minutes: string;
  description: string;
}

interface SplitTimeEntryModalProps {
  entry: TimeEntryRow | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (segments: { hours: number; minutes: number; description: string }[]) => Promise<void>;
}

export function SplitTimeEntryModal({
  entry,
  isOpen,
  onClose,
  onSubmit,
}: SplitTimeEntryModalProps) {
  const [segments, setSegments] = useState<Segment[]>([
    { hours: "0", minutes: "0", description: "" },
    { hours: "0", minutes: "0", description: "" },
  ]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!entry || !isOpen) return;
    const half = Math.floor(entry.duration / 2);
    const h1 = Math.floor(half / 3600);
    const m1 = Math.floor((half % 3600) / 60);
    const remainder = entry.duration - half;
    const h2 = Math.floor(remainder / 3600);
    const m2 = Math.floor((remainder % 3600) / 60);
    setSegments([
      { hours: String(h1), minutes: String(m1), description: entry.description ?? "" },
      { hours: String(h2), minutes: String(m2), description: "" },
    ]);
  }, [entry, isOpen]);

  const totalSeconds = segments.reduce(
    (sum, s) => sum + parseDurationInput(Number(s.hours) || 0, Number(s.minutes) || 0),
    0
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entry) return;
    setSaving(true);
    try {
      await onSubmit(
        segments.map((s) => ({
          hours: Number(s.hours) || 0,
          minutes: Number(s.minutes) || 0,
          description: s.description.trim(),
        }))
      );
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Split time entry" size="md">
      {entry && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-xs text-[var(--muted)]">
            Original: {formatDurationHms(entry.duration)} — split total:{" "}
            <span
              className={
                totalSeconds === entry.duration
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-500"
              }
            >
              {formatDurationHms(totalSeconds)}
            </span>
          </p>
          {segments.map((seg, i) => (
            <div
              key={i}
              className="space-y-2 rounded-lg border border-[var(--card-border)] p-3"
            >
              <p className="text-xs font-medium text-[var(--muted)]">Segment {i + 1}</p>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="Hours"
                  type="number"
                  min={0}
                  value={seg.hours}
                  onChange={(e) => {
                    const next = [...segments];
                    next[i] = { ...seg, hours: e.target.value };
                    setSegments(next);
                  }}
                />
                <Input
                  label="Minutes"
                  type="number"
                  min={0}
                  max={59}
                  value={seg.minutes}
                  onChange={(e) => {
                    const next = [...segments];
                    next[i] = { ...seg, minutes: e.target.value };
                    setSegments(next);
                  }}
                />
              </div>
              <Input
                label="Note"
                value={seg.description}
                onChange={(e) => {
                  const next = [...segments];
                  next[i] = { ...seg, description: e.target.value };
                  setSegments(next);
                }}
              />
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              setSegments([...segments, { hours: "0", minutes: "0", description: "" }])
            }
          >
            Add segment
          </Button>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={saving}
              disabled={totalSeconds !== entry.duration}
            >
              Split entry
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
