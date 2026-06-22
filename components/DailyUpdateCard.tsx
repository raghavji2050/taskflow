"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Copy, Check } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatDailyUpdateText, type DailyUpdateGroup } from "@/lib/daily-update-format";

interface DailyUpdateCardProps {
  groups: DailyUpdateGroup[];
  onSelectTask?: (taskId: string) => void;
}

export function DailyUpdateCard({ groups, onSelectTask }: DailyUpdateCardProps) {
  const [copied, setCopied] = useState(false);
  const todayLabel = format(new Date(), "EEEE, MMM d");
  const copyText = useMemo(() => formatDailyUpdateText(groups), [groups]);

  const handleCopy = async () => {
    if (!copyText) return;
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      toast.success("Daily update copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Daily Update</h2>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--muted)]">
            <CalendarDays className="h-3 w-3" />
            {todayLabel}
          </p>
        </div>
        {groups.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 px-2"
            onClick={handleCopy}
            title="Copy daily update"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        )}
      </div>

      {groups.length === 0 ? (
        <p className="py-6 text-center text-xs text-[var(--muted)]">No updates for today yet</p>
      ) : (
        <div className="max-h-[28rem] space-y-4 overflow-y-auto pr-1 text-sm">
          {groups.map((group) => (
            <div key={group.categoryId ?? group.categoryName}>
              <p className="font-semibold text-[var(--foreground)]">
                Worked on {group.categoryName}
              </p>
              <ol className="mt-1.5 list-none space-y-1 pl-0">
                {group.tasks.map((task, index) => (
                  <li key={task.id} className="text-[var(--muted)]">
                    {onSelectTask ? (
                      <button
                        type="button"
                        onClick={() => onSelectTask(task.id)}
                        className="w-full text-left hover:text-[var(--accent)]"
                      >
                        {index + 1}. {task.title}
                      </button>
                    ) : (
                      <span>
                        {index + 1}. {task.title}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
