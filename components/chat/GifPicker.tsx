"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import type { GiphyGif } from "@/lib/giphy";
import { rememberRecentGif, readRecentGifs, type RecentGif } from "@/lib/gif-recent";
import { cn } from "@/lib/utils";

export interface SelectedGif {
  id: string;
  title: string;
  previewUrl: string;
}

interface GifPickerProps {
  onSelect: (gif: SelectedGif) => void;
  height?: number;
}

const clientListCache = new Map<string, GiphyGif[]>();

function GiphyAttribution() {
  return (
    <p className="border-t border-[var(--border)] px-3 py-2 text-center text-[10px] text-[var(--muted)]">
      Powered by{" "}
      <a
        href="https://giphy.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-[var(--foreground)] hover:underline"
      >
        GIPHY
      </a>
    </p>
  );
}

export function GifPicker({ onSelect, height = 300 }: GifPickerProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [gifs, setGifs] = useState<GiphyGif[]>([]);
  const [recent, setRecent] = useState<RecentGif[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    setRecent(readRecentGifs());
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 400);
    return () => clearTimeout(timer);
  }, [query]);

  const loadGifs = useCallback(async (search: string, requestId: number) => {
    const cacheKey = search || "__trending__";
    const cached = clientListCache.get(cacheKey);
    if (cached) {
      if (requestIdRef.current === requestId) {
        setGifs(cached);
        setError(null);
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const endpoint = search
        ? `/api/giphy/search?q=${encodeURIComponent(search)}`
        : "/api/giphy/trending";
      const res = await fetch(endpoint);
      const data = await res.json();
      if (requestIdRef.current !== requestId) return;
      if (!res.ok) {
        throw new Error(data.error || "Failed to load GIFs");
      }
      const next = (data.gifs ?? []) as GiphyGif[];
      clientListCache.set(cacheKey, next);
      setGifs(next);
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      setGifs([]);
      setError(err instanceof Error ? err.message : "Failed to load GIFs");
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    const cacheKey = debouncedQuery || "__trending__";
    const cached = clientListCache.get(cacheKey);
    if (cached) {
      setGifs(cached);
      setError(null);
      setLoading(false);
      return;
    }
    void loadGifs(debouncedQuery, requestId);
  }, [debouncedQuery, loadGifs]);

  const handleSelect = (gif: SelectedGif) => {
    rememberRecentGif(gif);
    setRecent(readRecentGifs());
    onSelect(gif);
  };

  const showRecent = !debouncedQuery && recent.length > 0;

  return (
    <div className="flex flex-col" style={{ height }}>
      <div className="border-b border-[var(--border)] px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search GIFs…"
            className="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] pl-8 pr-3 text-xs outline-none focus:border-[var(--accent)]"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {showRecent && (
          <div className="mb-3">
            <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Recent
            </p>
            <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {recent.map((gif) => (
                <button
                  key={gif.id}
                  type="button"
                  onClick={() => handleSelect(gif)}
                  className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)]"
                  title={gif.title}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={gif.previewUrl} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}

        {!debouncedQuery && (
          <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            {showRecent ? "Trending" : "Trending GIFs"}
          </p>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-10 text-xs text-[var(--muted)]">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading GIFs…
          </div>
        ) : error ? (
          <p className="px-2 py-8 text-center text-xs text-red-500">{error}</p>
        ) : gifs.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs text-[var(--muted)]">
            {debouncedQuery ? "No GIFs found" : "No trending GIFs"}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {gifs.map((gif) => (
              <button
                key={gif.id}
                type="button"
                onClick={() =>
                  handleSelect({ id: gif.id, title: gif.title, previewUrl: gif.previewUrl })
                }
                className={cn(
                  "group relative overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)]",
                  "aspect-[4/3] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                )}
                title={gif.title}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={gif.previewUrl}
                  alt={gif.title}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      <GiphyAttribution />
    </div>
  );
}
