"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { CheckSquare, FileText, FolderKanban, Loader2, MessageSquare, Navigation, Search } from "lucide-react";
import { matchPages, MIN_QUERY, type SearchHit, type SearchKind } from "@/lib/global-search";
import { dispatchOpenTask } from "@/lib/open-task-event";
import { OPEN_PALETTE_EVENT } from "@/lib/command-palette-event";
import { cn } from "@/lib/utils";

type Group = { key: SearchKind; label: string; hits: SearchHit[] };

const ICONS: Record<SearchKind, typeof Search> = {
  task: CheckSquare, project: FolderKanban, document: FileText, message: MessageSquare, page: Navigation,
};

// Pages that already listen for the open-task event, so a task opens in place.
const TASK_PAGES = ["/dashboard", "/dashboard/board", "/dashboard/calendar", "/dashboard/timeline", "/dashboard/my-work"];

export function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < MIN_QUERY) {
      setGroups([{ key: "page", label: "Go to", hits: matchPages(q, q ? 5 : 8) }]);
      setLoading(false);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=5`);
        const data = await res.json();
        if (id !== reqId.current) return;
        if (!res.ok) throw new Error(data.error);
        setGroups(
          ([
            { key: "task", label: "Tasks", hits: data.tasks },
            { key: "project", label: "Projects", hits: data.projects },
            { key: "document", label: "Docs", hits: data.documents },
            { key: "message", label: "Messages", hits: data.messages },
            { key: "page", label: "Go to", hits: data.pages },
          ] as Group[]).filter((g) => g.hits?.length)
        );
      } catch {
        if (id === reqId.current) setGroups([]);
      } finally {
        if (id === reqId.current) { setLoading(false); setActive(0); }
      }
    }, 180);
    return () => clearTimeout(t);
  }, [query, open]);

  const flat = useMemo(() => groups.flatMap((g) => g.hits), [groups]);

  const choose = useCallback((hit: SearchHit | undefined) => {
    if (!hit) return;
    setOpen(false);
    if (hit.kind === "task" && TASK_PAGES.includes(pathname)) {
      dispatchOpenTask(hit.id);
      return;
    }
    router.push(hit.href);
  }, [pathname, router]);

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, flat.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(flat[active]); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
  };

  useEffect(() => {
    document.getElementById(`cmdk-item-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open || typeof document === "undefined") return null;

  let index = -1;
  const q = query.trim();
  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-start justify-center bg-black/50 px-3 pt-[12vh]" onMouseDown={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="w-full max-w-xl overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-1)] shadow-[var(--shadow-lg)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4">
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-[var(--muted)]" /> : <Search className="h-4 w-4 text-[var(--muted)]" />}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search tasks, projects, docs, messages…"
            aria-label="Search everything"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-list"
            aria-activedescendant={flat.length ? `cmdk-item-${active}` : undefined}
            className="h-12 flex-1 bg-transparent text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)]"
          />
          <kbd className="hidden rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--muted)] sm:inline">Esc</kbd>
        </div>
        <div id="cmdk-list" role="listbox" className="max-h-[60vh] overflow-y-auto py-2">
          {groups.map((g) => (
            <div key={g.key} className="pb-1">
              <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">{g.label}</p>
              {g.hits.map((hit) => {
                index += 1;
                const i = index;
                const Icon = ICONS[hit.kind];
                return (
                  <button
                    key={`${hit.kind}-${hit.id}`}
                    id={`cmdk-item-${i}`}
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(hit)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-2 text-left text-sm",
                      i === active ? "bg-[var(--accent)]/10 text-[var(--foreground)]" : "text-[var(--foreground)]/90"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-[var(--muted)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{hit.title}</span>
                      {hit.subtitle && <span className="block truncate text-xs text-[var(--muted)]">{hit.subtitle}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
          {!loading && q.length >= MIN_QUERY && flat.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-[var(--muted)]">No results for “{q}”</p>
          )}
        </div>
        <div className="flex items-center gap-3 border-t border-[var(--border)] px-4 py-2 text-[11px] text-[var(--muted)]">
          <span>↑↓ to move</span><span>Enter to open</span><span className="ml-auto">Ctrl/⌘ K</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
