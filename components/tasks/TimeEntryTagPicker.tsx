"use client";

import { useEffect, useState } from "react";

export interface TimeEntryLabelOption {
  id: string;
  name: string;
  color: string | null;
}

interface TimeEntryTagPickerProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

export function TimeEntryTagPicker({
  selectedIds,
  onChange,
  disabled = false,
}: TimeEntryTagPickerProps) {
  const [labels, setLabels] = useState<TimeEntryLabelOption[]>([]);

  useEffect(() => {
    fetch("/api/time/labels")
      .then((r) => r.json())
      .then((d) => setLabels(d.labels ?? []))
      .catch(() => {});
  }, []);

  const toggle = (id: string) => {
    if (disabled) return;
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id]
    );
  };

  if (labels.length === 0) return null;

  return (
    <div>
      <p className="mb-2 text-xs font-medium text-[var(--muted)]">Activity tags</p>
      <div className="flex flex-wrap gap-1.5">
        {labels.map((label) => (
          <button
            key={label.id}
            type="button"
            disabled={disabled}
            onClick={() => toggle(label.id)}
            className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              selectedIds.includes(label.id)
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--surface-hover)] text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {label.name}
          </button>
        ))}
      </div>
    </div>
  );
}
