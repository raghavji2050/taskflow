"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { cn, getInitials } from "@/lib/utils";

interface Member {
  id: string;
  name: string;
}

export interface MentionInputHandle {
  focus: () => void;
}

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  members: Member[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  currentUserId?: string;
}

export const MentionInput = forwardRef<MentionInputHandle, MentionInputProps>(function MentionInput(
  {
    value,
    onChange,
    onSubmit,
    members,
    placeholder,
    className,
    disabled,
    currentUserId,
  },
  ref
) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  const mentionable = members.filter((m) => m.id !== currentUserId);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const handleChange = (text: string) => {
    onChange(text);
    const match = text.match(/@([^\n@]*)$/);
    if (match && mentionable.length > 0) {
      setQuery(match[1].trim());
      setOpen(true);
      setActiveIndex(0);
    } else {
      setOpen(false);
      setQuery("");
    }
  };

  const insertMention = (name: string) => {
    const next = value.replace(/@([^\n@]*)$/, `@${name} `);
    onChange(next);
    setOpen(false);
    setQuery("");
    inputRef.current?.focus();
  };

  const filtered = mentionable.filter((m) =>
    !query || m.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div ref={containerRef} className="relative min-w-0 flex-1">
      <input
        ref={inputRef}
        type="text"
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={(e) => {
          if (open && filtered.length > 0) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIndex((i) => (i + 1) % filtered.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
              return;
            }
            if (e.key === "Tab" || (e.key === "Enter" && open)) {
              e.preventDefault();
              insertMention(filtered[activeIndex]!.name);
              return;
            }
          }
          if (e.key === "Enter" && !open) {
            e.preventDefault();
            if (!disabled) onSubmit?.();
          }
          if (e.key === "Escape") setOpen(false);
        }}
        className={cn(
          "h-9 w-full rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20",
          className
        )}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute bottom-full z-30 mb-1 max-h-40 w-full overflow-y-auto rounded-xl border border-[var(--card-border)] bg-[var(--card)] py-1 shadow-lg">
          <li className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Mention someone
          </li>
          {filtered.map((m, index) => (
            <li key={m.id}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                  index === activeIndex
                    ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                    : "hover:bg-[var(--surface-hover)]"
                )}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => insertMention(m.name)}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/10 text-[10px] font-semibold text-[var(--accent)]">
                  {getInitials(m.name)}
                </span>
                <span className="truncate font-medium">@{m.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
