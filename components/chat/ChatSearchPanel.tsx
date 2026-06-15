"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import type { ChatMessage } from "@/components/chat/MessageBubble";
import { cn } from "@/lib/utils";

interface ChatSearchPanelProps {
  conversationId: string;
  onClose: () => void;
  onSelectMessage: (message: ChatMessage) => void;
}

export function ChatSearchPanel({
  conversationId,
  onClose,
  onSelectMessage,
}: ChatSearchPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.trim().length < 1) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/conversations/${conversationId}/messages?search=${encodeURIComponent(query.trim())}`
        );
        const data = await res.json();
        if (res.ok) setResults(data.results ?? []);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, conversationId]);

  return (
    <div className="shrink-0 border-b border-[var(--card-border)] bg-[var(--card)] px-3 py-2 md:px-4">
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 shrink-0 text-[var(--muted)]" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search in conversation…"
          className="min-w-0 flex-1 bg-transparent text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)]"
          autoFocus
        />
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-hover)]"
          aria-label="Close search"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {(loading || results.length > 0 || query.trim().length > 0) && (
        <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-[var(--card-border)] bg-[var(--background)]">
          {loading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--muted)]" />
            </div>
          )}
          {!loading && query.trim() && results.length === 0 && (
            <p className="px-3 py-4 text-center text-xs text-[var(--muted)]">No messages found</p>
          )}
          {!loading &&
            results.map((msg) => (
              <button
                key={msg.id}
                type="button"
                onClick={() => onSelectMessage(msg)}
                className="flex w-full flex-col gap-0.5 border-b border-[var(--card-border)] px-3 py-2.5 text-left last:border-0 hover:bg-[var(--surface-hover)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[var(--foreground)]">
                    {msg.user.name}
                  </span>
                  <span className="shrink-0 text-[10px] text-[var(--muted)]">
                    {new Date(msg.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className={cn("line-clamp-2 text-xs text-[var(--muted)]", msg.deletedAt && "italic")}>
                  {msg.deletedAt ? "Message deleted" : msg.body || "📎 Attachment"}
                </p>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
