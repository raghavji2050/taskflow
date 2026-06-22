"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { cn, getInitials } from "@/lib/utils";

interface MentionSuggestionListProps {
  items: { id: string; label: string }[];
  command: (item: { id: string; label: string }) => void;
}

export interface MentionSuggestionListHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const MentionSuggestionList = forwardRef<
  MentionSuggestionListHandle,
  MentionSuggestionListProps
>(function MentionSuggestionList({ items, command }, ref) {
  const [index, setIndex] = useState(0);

  useEffect(() => setIndex(0), [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === "ArrowUp") {
        setIndex((i) => (i + items.length - 1) % items.length);
        return true;
      }
      if (event.key === "ArrowDown") {
        setIndex((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const item = items[index];
        if (item) command(item);
        return true;
      }
      return false;
    },
  }));

  if (!items.length) return null;

  return (
    <div
      className="max-h-48 min-w-[180px] overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] p-1 shadow-lg"
      role="listbox"
      aria-label="Mention suggestions"
    >
      {items.map((item, i) => (
        <button
          key={item.id}
          type="button"
          role="option"
          aria-selected={i === index}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
            i === index ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-hover)]"
          )}
          onMouseEnter={() => setIndex(i)}
          onMouseDown={(e) => {
            e.preventDefault();
            command(item);
          }}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[10px] font-semibold text-[var(--accent)]">
            {getInitials(item.label)}
          </span>
          <span className="truncate">{item.label}</span>
        </button>
      ))}
    </div>
  );
});
