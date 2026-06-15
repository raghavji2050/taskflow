"use client";

import { useEffect, useState } from "react";
import { Calendar, Loader2, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { formatDatePickerLabel, groupDatesByMonth } from "@/lib/chat-dates";
import { cn } from "@/lib/utils";

interface ChatDateJumpModalProps {
  isOpen: boolean;
  conversationId: string;
  onClose: () => void;
  onSelectDate: (dateKey: string) => void;
}

export function ChatDateJumpModal({
  isOpen,
  conversationId,
  onClose,
  onSelectDate,
}: ChatDateJumpModalProps) {
  const [dates, setDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [customDate, setCustomDate] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setCustomDate("");
      return;
    }

    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/conversations/${conversationId}/messages/dates`);
        const data = await res.json();
        if (res.ok) setDates(data.dates ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen, conversationId]);

  const groups = groupDatesByMonth(dates);

  const handleCustomJump = () => {
    if (!customDate) return;
    onSelectDate(customDate);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Go to date" description="Jump to messages from a specific day">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            className="flex-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)]"
          />
          <button
            type="button"
            onClick={handleCustomJump}
            disabled={!customDate}
            className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Go
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--muted)]" />
          </div>
        ) : dates.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--muted)]">No message history yet</p>
        ) : (
          <div className="max-h-64 space-y-4 overflow-y-auto">
            {groups.map((group) => (
              <div key={group.month}>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  <Calendar className="h-3.5 w-3.5" />
                  {group.label}
                </p>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {group.dates.map((dateKey) => (
                    <button
                      key={dateKey}
                      type="button"
                      onClick={() => {
                        onSelectDate(dateKey);
                        onClose();
                      }}
                      className={cn(
                        "rounded-lg border border-[var(--card-border)] px-2 py-2 text-left text-xs",
                        "hover:border-[var(--accent)] hover:bg-[var(--accent)]/5"
                      )}
                    >
                      {formatDatePickerLabel(dateKey)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-[var(--muted)] hover:bg-[var(--surface-hover)]"
          >
            <X className="h-4 w-4" /> Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
