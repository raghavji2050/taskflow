"use client";

interface CreateTaskTimerOptionsProps {
  startTimer: boolean;
  onStartTimerChange: (value: boolean) => void;
  promoteStatus: boolean;
  onPromoteStatusChange: (value: boolean) => void;
  taskStatus: string;
  compact?: boolean;
}

export function CreateTaskTimerOptions({
  startTimer,
  onStartTimerChange,
  promoteStatus,
  onPromoteStatusChange,
  taskStatus,
  compact = false,
}: CreateTaskTimerOptionsProps) {
  const showPromote =
    startTimer && (taskStatus === "PENDING" || taskStatus === "COMPLETED");

  return (
    <div className={compact ? "space-y-1" : "space-y-2"}>
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={startTimer}
          onChange={(e) => onStartTimerChange(e.target.checked)}
          className="h-4 w-4 shrink-0 rounded border-[var(--card-border)] accent-[var(--accent)]"
        />
        <span className="text-sm text-[var(--foreground)]">
          Start timer immediately after creating
        </span>
      </label>
      {showPromote && (
        <label className="flex cursor-pointer items-center gap-2 pl-6">
          <input
            type="checkbox"
            checked={promoteStatus}
            onChange={(e) => onPromoteStatusChange(e.target.checked)}
            className="h-4 w-4 shrink-0 rounded border-[var(--card-border)] accent-[var(--accent)]"
          />
          <span className="text-xs text-[var(--muted)]">
            Set status to <span className="font-medium text-[var(--foreground)]">In progress</span>
          </span>
        </label>
      )}
    </div>
  );
}
