"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Member {
  id: string;
  name: string;
}

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  members: Member[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function MentionInput({
  value,
  onChange,
  onSubmit,
  members,
  placeholder,
  className,
  disabled,
}: MentionInputProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

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
    if (match) {
      setQuery(match[1].trim());
      setOpen(true);
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
  };

  const filtered = members.filter((m) =>
    !query || m.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div ref={containerRef} className="relative min-w-0 flex-1">
      <input
        type="text"
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit?.();
          }
          if (e.key === "Escape") setOpen(false);
        }}
        className={cn(
          "h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900",
          className
        )}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute bottom-full z-20 mb-1 max-h-32 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {filtered.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-xs hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                onClick={() => insertMention(m.name)}
              >
                @{m.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
