"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { Users } from "lucide-react";
import { MENTION_ALL_ID } from "@/lib/mentions";
import { cn, getAvatarColorClasses, getInitials } from "@/lib/utils";

interface MentionSuggestionItem {
  id: string;
  label: string;
  image?: string | null;
  tagAll?: boolean;
}

interface MentionSuggestionListProps {
  items: MentionSuggestionItem[];
  command: (item: MentionSuggestionItem) => void;
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
      className="max-h-56 min-w-[200px] overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] p-1 shadow-lg"
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
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-semibold",
              item.tagAll || item.id === MENTION_ALL_ID
                ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                : !item.image && getAvatarColorClasses(item.label)
            )}
          >
            {item.tagAll || item.id === MENTION_ALL_ID ? (
              <Users className="h-3.5 w-3.5" />
            ) : item.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.image} alt="" className="h-full w-full object-cover" />
            ) : (
              getInitials(item.label)
            )}
          </span>
          <span className="min-w-0 truncate">
            {item.tagAll || item.id === MENTION_ALL_ID ? (
              <>
                <span className="font-semibold">@all</span>
                <span className="ml-1.5 text-xs text-[var(--muted)]">Notify everyone</span>
              </>
            ) : (
              item.label
            )}
          </span>
        </button>
      ))}
    </div>
  );
});
