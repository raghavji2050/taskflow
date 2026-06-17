"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { filterMomSuggestions } from "@/lib/mom-suggestions";

const inputClass =
  "h-10 w-full rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 disabled:cursor-not-allowed disabled:opacity-60";

const textareaClass =
  "flex min-h-0 w-full rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 disabled:cursor-not-allowed disabled:opacity-60";

function AddSuggestionInput({
  onAdd,
  placeholder = "Add custom suggestion…",
}: {
  onAdd: (value: string) => void | Promise<void>;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onAdd(trimmed);
      setValue("");
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--card-border)] px-2.5 py-0.5 text-[11px] text-[var(--muted)] transition-colors hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
      >
        <Plus className="h-3 w-3" />
        Add
      </button>
    );
  }

  return (
    <div className="flex min-w-[180px] flex-1 items-center gap-1">
      <input
        ref={inputRef}
        type="text"
        value={value}
        disabled={busy}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
          if (e.key === "Escape") {
            setOpen(false);
            setValue("");
          }
        }}
        className="h-7 min-w-0 flex-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2 text-[11px] outline-none focus:border-[var(--accent)]"
      />
      <button
        type="button"
        disabled={busy || !value.trim()}
        onClick={() => void submit()}
        className="rounded-lg bg-[var(--accent)] px-2 py-1 text-[10px] font-medium text-white disabled:opacity-50"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setValue("");
        }}
        className="rounded p-1 text-[var(--muted)] hover:text-[var(--foreground)]"
        aria-label="Cancel"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function SuggestionChip({
  label,
  onPick,
  onHide,
  manageable,
  dashed,
}: {
  label: string;
  onPick?: () => void;
  onHide?: () => void;
  manageable?: boolean;
  dashed?: boolean;
}) {
  return (
    <span
      className={cn(
        "group/chip inline-flex max-w-full items-center overflow-hidden rounded-full border text-[11px]",
        dashed
          ? "border-dashed border-[var(--card-border)] text-[var(--muted)]"
          : "border-[var(--card-border)] bg-[var(--surface-hover)]/60 text-[var(--foreground)]"
      )}
    >
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onPick}
        className={cn(
          "max-w-[200px] truncate px-2.5 py-0.5 transition-colors",
          onPick && "hover:text-[var(--accent)]"
        )}
      >
        {label}
      </button>
      {manageable && onHide && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            onHide();
          }}
          className="border-l border-[var(--card-border)] px-1.5 py-0.5 text-[var(--muted)] transition-colors hover:bg-red-500/10 hover:text-red-500"
          aria-label={`Remove ${label} from suggestions`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

interface MomSuggestionFieldBaseProps {
  value: string;
  onChange: (value: string) => void;
  suggestions?: string[];
  exclude?: string[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  maxChips?: number;
  manageable?: boolean;
  onAddSuggestion?: (value: string) => void | Promise<void>;
  onHideSuggestion?: (value: string) => void | Promise<void>;
}

type MomSuggestionFieldProps = MomSuggestionFieldBaseProps &
  (
    | { multiline?: false; rows?: never }
    | { multiline: true; rows?: number }
  );

export function MomSuggestionField({
  value,
  onChange,
  suggestions = [],
  exclude = [],
  placeholder,
  disabled,
  className,
  maxChips = 6,
  multiline = false,
  rows = 2,
  manageable = false,
  onAddSuggestion,
  onHideSuggestion,
}: MomSuggestionFieldProps) {
  const [focused, setFocused] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const filtered = useMemo(
    () => filterMomSuggestions(suggestions, value, exclude),
    [suggestions, value, exclude]
  );

  const chipSuggestions = useMemo(
    () => filterMomSuggestions(suggestions, "", exclude).slice(0, maxChips),
    [suggestions, exclude, maxChips]
  );

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [value, filtered.length]);

  const pickSuggestion = (text: string) => {
    onChange(text);
    setDropdownOpen(false);
    requestAnimationFrame(() => fieldRef.current?.focus());
  };

  const handleChange = (next: string) => {
    onChange(next);
    if (suggestions.length > 0 && next.trim()) {
      setDropdownOpen(true);
    } else {
      setDropdownOpen(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!dropdownOpen || filtered.length === 0) {
      if (e.key === "Escape") setDropdownOpen(false);
      return;
    }

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
    if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault();
      pickSuggestion(filtered[activeIndex]!);
      return;
    }
    if (e.key === "Escape") {
      setDropdownOpen(false);
    }
  };

  const showChipRow =
    focused && !disabled && (chipSuggestions.length > 0 || (manageable && onAddSuggestion));
  const showDropdown =
    dropdownOpen && !disabled && filtered.length > 0 && value.trim().length > 0;

  return (
    <div ref={containerRef} className="relative min-w-0 flex-1 space-y-1.5">
      {multiline ? (
        <textarea
          ref={fieldRef as React.RefObject<HTMLTextAreaElement>}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          rows={rows}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className={cn(textareaClass, className)}
        />
      ) : (
        <input
          ref={fieldRef as React.RefObject<HTMLInputElement>}
          type="text"
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onFocus={() => {
            setFocused(true);
            if (value.trim() && suggestions.length > 0) setDropdownOpen(true);
          }}
          onBlur={() => setFocused(false)}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className={cn(inputClass, className)}
        />
      )}

      {showChipRow && (
        <div
          className="flex flex-wrap items-center gap-1.5"
          onMouseDown={(e) => e.preventDefault()}
        >
          {chipSuggestions.map((s) => (
            <SuggestionChip
              key={s}
              label={s}
              manageable={manageable}
              onPick={() => pickSuggestion(s)}
              onHide={onHideSuggestion ? () => void onHideSuggestion(s) : undefined}
            />
          ))}
          {manageable && onAddSuggestion && <AddSuggestionInput onAdd={onAddSuggestion} />}
        </div>
      )}

      {showDropdown && (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-40 overflow-y-auto rounded-xl border border-[var(--card-border)] bg-[var(--card)] py-1 shadow-lg">
          {filtered.map((s, index) => (
            <li key={s} className="flex items-center">
              <button
                type="button"
                className={cn(
                  "min-w-0 flex-1 truncate px-3 py-2 text-left text-sm transition-colors",
                  index === activeIndex
                    ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                    : "hover:bg-[var(--surface-hover)]"
                )}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => pickSuggestion(s)}
              >
                {s}
              </button>
              {manageable && onHideSuggestion && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    void onHideSuggestion(s);
                    setDropdownOpen(false);
                  }}
                  className="shrink-0 px-2 py-2 text-[var(--muted)] hover:text-red-500"
                  aria-label={`Remove ${s}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface MomSuggestionChipsProps {
  suggestions: string[];
  exclude?: string[];
  onPick: (value: string) => void;
  max?: number;
  label?: string;
  manageable?: boolean;
  onAddSuggestion?: (value: string) => void | Promise<void>;
  onHideSuggestion?: (value: string) => void | Promise<void>;
}

export function MomSuggestionChips({
  suggestions,
  exclude = [],
  onPick,
  max = 8,
  label = "Quick add",
  manageable = false,
  onAddSuggestion,
  onHideSuggestion,
}: MomSuggestionChipsProps) {
  const chips = useMemo(
    () => filterMomSuggestions(suggestions, "", exclude).slice(0, max),
    [suggestions, exclude, max]
  );

  if (chips.length === 0 && !manageable) return null;

  return (
    <div className="mb-2">
      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
        {label}
        {manageable && (
          <span className="ml-1.5 font-normal normal-case text-[var(--muted)]">
            · click to use, × to remove
          </span>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {chips.map((s) => (
          <SuggestionChip
            key={s}
            label={s}
            dashed
            manageable={manageable}
            onPick={() => onPick(s)}
            onHide={onHideSuggestion ? () => void onHideSuggestion(s) : undefined}
          />
        ))}
        {manageable && onAddSuggestion && <AddSuggestionInput onAdd={onAddSuggestion} />}
      </div>
    </div>
  );
}
