"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { formatQuickAddPreview, parseQuickAdd } from "@/lib/quick-add";
import { browserTimeZone } from "@/lib/quick-add-input";
import { cn } from "@/lib/utils";

interface QuickAddTaskProps {
  onAdd: (text: string) => Promise<void> | void;
  placeholder?: string;
  className?: string;
  testId?: string;
  compact?: boolean;
}

/** One-line "+ Add task" input. Enter creates the task; Hinglish dates/priority are parsed. */
export function QuickAddTask({ onAdd, placeholder = "Add task… e.g. kal 5 baje client call !high", className, testId = "quick-add-task", compact }: QuickAddTaskProps) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => {
    if (!value.trim()) return null;
    const tz = browserTimeZone();
    const r = parseQuickAdd(value, { timeZone: tz });
    return r.matched ? formatQuickAddPreview(r, { timeZone: tz }) : null;
  }, [value]);

  const submit = async () => {
    const text = value.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await onAdd(text);
      setValue("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      data-testid={testId}
      data-no-open
      className={cn("w-full", className)}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-1)] px-3 transition-colors focus-within:border-[var(--accent)] focus-within:border-solid",
          compact ? "h-10" : "h-11"
        )}
      >
        <Plus className="h-4 w-4 shrink-0 text-[var(--muted)]" />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          aria-label="Add task"
          maxLength={200}
          disabled={busy}
          className="min-w-0 flex-1 bg-transparent text-base text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none sm:text-sm"
        />
        {value.trim() && (
          <button
            type="submit"
            disabled={busy}
            className="shrink-0 rounded-lg bg-[var(--accent-solid)] px-2.5 py-1 text-xs font-medium text-white disabled:opacity-60"
          >
            Add
          </button>
        )}
      </div>
      {preview && (
        <p data-testid={`${testId}-preview`} className="mt-1 px-1 text-[11px] text-[var(--muted)]">
          {preview}
        </p>
      )}
    </form>
  );
}
