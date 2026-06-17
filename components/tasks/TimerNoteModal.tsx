"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";

export type TimerNoteMode = "start" | "add";

interface TimerNoteModalProps {
  isOpen: boolean;
  mode: TimerNoteMode;
  initialNote?: string | null;
  onClose: () => void;
  onSubmit: (note: string) => Promise<void>;
}

const TITLES: Record<TimerNoteMode, string> = {
  start: "Start timer",
  add: "Edit note",
};

const PLACEHOLDERS: Record<TimerNoteMode, string> = {
  start: "What are you working on? (optional)",
  add: "Session note…",
};

export function TimerNoteModal({
  isOpen,
  mode,
  initialNote = "",
  onClose,
  onSubmit,
}: TimerNoteModalProps) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) setNote(initialNote ?? "");
  }, [isOpen, initialNote]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit(note.trim());
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
