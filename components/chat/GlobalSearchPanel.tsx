"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Search, X } from "lucide-react";
import type { ChatMessage } from "@/components/chat/MessageBubble";
import type { ConversationListItem } from "@/components/chat/ConversationList";
import { cn } from "@/lib/utils";

interface GlobalSearchPanelProps {
  conversations: ConversationListItem[];
  onClose: () => void;
  onSelect: (conversationId: string, message: ChatMessage) => void;
}

export function GlobalSearchPanel({ conversations, onClose, onSelect }: GlobalSearchPanelProps) {
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<(ChatMessage & { conversationId: string })[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/search?q=${encodeURIComponent(q.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        setResults([]);
        setError(data.error ?? "Search failed");
        return;
      }
      setResults(data.results ?? []);
    } catch {
      setResults([]);
      setError("Search failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void search(query), 300);
    return () => clearTimeout(t);
  }, [query, search]);

  const convName = (id: string) => conversations.find((c) => c.id === id)?.name ?? "Chat";

  if (!mounted) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[250] bg-black/50 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search messages"
        className="fixed inset-x-3 top-[max(3.5rem,env(safe-area-inset-top))] z-[251] mx-auto flex max-h-[min(640px,calc(100dvh-5rem))] w-full max-w-xl flex-col overflow-hidden rounded-xl surface-panel border border-[var(--border)] shadow-[var(--shadow-sm)] md:top-24"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-3 py-3">
          <Search className="h-4 w-4 shrink-0 text-[var(--muted)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all messages…"
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)]"
            autoFocus
          />
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
            aria-label="Close search"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {query.trim().length < 2 && (
            <p className="px-2 py-8 text-center text-xs text-[var(--muted)]">
              Type at least 2 characters to search
            </p>
          )}
          {loading && (
            <p className="flex items-center justify-center gap-2 py-8 text-xs text-[var(--muted)]">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </p>
          )}
          {error && (
            <p className="py-8 text-center text-xs text-red-500">{error}</p>
          )}
          {!loading && !error && query.trim().length >= 2 && results.length === 0 && (
            <p className="py-8 text-center text-xs text-[var(--muted)]">No messages found</p>
          )}
          <ul className="space-y-1">
            {results.map((msg) => (
              <li key={msg.id}>
                <button
                  type="button"
                  onClick={() => onSelect(msg.conversationId, msg)}
                  className={cn(
                    "w-full rounded-lg px-3 py-2 text-left hover:bg-[var(--surface-hover)]"
                  )}
                >
                  <p className="text-[10px] font-semibold text-[var(--accent)]">{convName(msg.conversationId)}</p>
                  <p className="truncate text-sm text-[var(--foreground)]">{msg.body}</p>
                  <p className="text-[10px] text-[var(--muted)]">
                    {msg.user.name} · {new Date(msg.createdAt).toLocaleString()}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>,
    document.body
  );
}
