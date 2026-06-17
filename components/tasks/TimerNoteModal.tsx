"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";

export type TimerNoteMode = "start" | "add";

export interface TimerStartSubmitData {
  note: string;
  promoteStatus: boolean;
}

type TimerNoteModalBaseProps = {
  isOpen: boolean;
  initialNote?: string | null;
  onClose: () => void;
};

type TimerNoteModalStartProps = TimerNoteModalBaseProps & {
  mode: "start";
  taskStatus?: string | null;
  onSubmit: (data: TimerStartSubmitData) => Promise<void>;
};

type TimerNoteModalAddProps = TimerNoteModalBaseProps & {
  mode: "add";
  onSubmit: (note: string) => Promise<void>;
};

export type TimerNoteModalProps = TimerNoteModalStartProps | TimerNoteModalAddProps;

const TITLES: Record<TimerNoteMode, string> = {
  start: "Start timer",
  add: "Edit note",
};

const PLACEHOLDERS: Record<TimerNoteMode, string> = {
  start: "What are you working on? (optional)",
  add: "Session note…",
};

function wouldPromoteTaskStatusOnTimerStart(status?: string | null): boolean {
  return status === "PENDING" || status === "COMPLETED";
}

export function TimerNoteModal(props: TimerNoteModalProps) {
  const { isOpen, mode, initialNote = "", onClose } = props;
  const [note, setNote] = useState("");
  const [promoteStatus, setPromoteStatus] = useState(true);
  const [saving, setSaving] = useState(false);

  const showPromoteToggle =
    mode === "start" && wouldPromoteTaskStatusOnTimerStart(props.taskStatus);

  useEffect(() => {
    if (!isOpen) return;
    setNote(initialNote ?? "");
    setPromoteStatus(true);
  }, [isOpen, initialNote]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (mode === "start") {
        await props.onSubmit({
          note: note.trim(),
          promoteStatus: showPromoteToggle ? promoteStatus : true,
        });
      } else {
        await props.onSubmit(note.trim());
      }
      onClose();
      setNote("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={TITLES[mode]} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={PLACEHOLDERS[mode]}
          maxLength={500}
          rows={4}
          autoFocus
        />
        <p className="text-xs text-[var(--muted)]">{note.length}/500</p>

        {showPromoteToggle && (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[var(--card-border)] bg-[var(--surface-hover)] px-3 py-2.5">
            <input
              type="checkbox"
              checked={promoteStatus}
              onChange={(e) => setPromoteStatus(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-[var(--card-border)] accent-[var(--accent)]"
            />
            <span className="text-sm text-[var(--foreground)]">
              Set task status to <span className="font-medium">In progress</span>
              <span className="mt-0.5 block text-xs text-[var(--muted)]">
                On by default when you start the timer.
              </span>
            </span>
          </label>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving} variant="primary">
            {saving ? "Saving…" : mode === "start" ? "Start" : "Save note"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
