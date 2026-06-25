"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { GIPHY_PAGE_SIZE, giphyHasMore, type GiphyGif } from "@/lib/giphy";
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

type GifListResponse = {
  gifs?: GiphyGif[];
  offset?: number;
  total?: number;
};

const clientPageCache = new Map<string, GifListResponse>();

function pageCacheKey(search: string, offset: number) {
  return `${search || "__trending__"}:${offset}`;
}

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
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const requestIdRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const debouncedQueryRef = useRef(debouncedQuery);
  const hasMoreRef = useRef(hasMore);
  const loadingRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const nextOffsetRef = useRef(0);

  debouncedQueryRef.current = debouncedQuery;
  hasMoreRef.current = hasMore;
  loadingRef.current = loading;
  loadingMoreRef.current = loadingMore;
  nextOffsetRef.current = nextOffset;

  useEffect(() => {
    setRecent(readRecentGifs());
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 400);
    return () => clearTimeout(timer);
  }, [query]);

  const fetchPage = useCallback(async (search: string, offset: number) => {
    const cacheKey = pageCacheKey(search, offset);
    const cached = clientPageCache.get(cacheKey);
    if (cached) return cached;

    const params = new URLSearchParams({
      offset: String(offset),
      limit: String(GIPHY_PAGE_SIZE),
    });
    const endpoint = search
      ? `/api/giphy/search?${params}&q=${encodeURIComponent(search)}`
      : `/api/giphy/trending?${params}`;

    const res = await fetch(endpoint);
    const data = (await res.json()) as GifListResponse & { error?: string };
    if (!res.ok) {
      throw new Error(data.error || "Failed to load GIFs");
    }

    clientPageCache.set(cacheKey, data);
    return data;
  }, []);

  const applyPage = useCallback((data: GifListResponse, append: boolean) => {
    const page = (data.gifs ?? []) as GiphyGif[];
    const baseOffset = data.offset ?? 0;
    setGifs((prev) => (append ? [...prev, ...page] : page));
    const next = baseOffset + page.length;
    setNextOffset(next);
    setHasMore(giphyHasMore(baseOffset, page.length, data.total ?? 0));
  }, []);

  const loadPage = useCallback(
    async (search: string, offset: number, append: boolean, requestId: number) => {
      const setBusy = append ? setLoadingMore : setLoading;
      setBusy(true);
      if (!append) setError(null);

      try {
        const data = await fetchPage(search, offset);
        if (requestIdRef.current !== requestId) return;
        applyPage(data, append);
      } catch (err) {
        if (requestIdRef.current !== requestId) return;
        if (!append) {
          setGifs([]);
          setHasMore(false);
          setNextOffset(0);
        }
        setError(err instanceof Error ? err.message : "Failed to load GIFs");
      } finally {
        if (requestIdRef.current === requestId) {
          setBusy(false);
        }
      }
    },
    [applyPage, fetchPage]
  );

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    setGifs([]);
    setHasMore(false);
    setNextOffset(0);

    const cacheKey = pageCacheKey(debouncedQuery, 0);
    const cached = clientPageCache.get(cacheKey);
    if (cached) {
      applyPage(cached, false);
      setError(null);
      setLoading(false);
      return;
    }

    void loadPage(debouncedQuery, 0, false, requestId);
  }, [debouncedQuery, loadPage, applyPage]);

  const loadMore = useCallback(() => {
    if (loadingRef.current || loadingMoreRef.current || !hasMoreRef.current) return;
    const requestId = requestIdRef.current;
    void loadPage(debouncedQueryRef.current, nextOffsetRef.current, true, requestId);
  }, [loadPage]);

  useEffect(() => {
    const root = scrollRef.current;
    const target = loadMoreRef.current;
    if (!root || !target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { root, rootMargin: "120px", threshold: 0 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [loadMore, gifs.length, hasMore, debouncedQuery]);

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

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-2">
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
        ) : error && gifs.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs text-red-500">{error}</p>
        ) : gifs.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs text-[var(--muted)]">
            {debouncedQuery ? "No GIFs found" : "No trending GIFs"}
          </p>
        ) : (
          <>
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

            <div ref={loadMoreRef} className="flex min-h-8 items-center justify-center py-2">
              {loadingMore && (
                <span className="flex items-center gap-2 text-[10px] text-[var(--muted)]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading more…
                </span>
              )}
              {!loadingMore && hasMore && (
                <button
                  type="button"
                  onClick={loadMore}
                  className="text-[10px] font-medium text-[var(--accent)] hover:underline"
                >
                  Load more
                </button>
              )}
            </div>

            {error && gifs.length > 0 && (
              <p className="px-2 pb-2 text-center text-[10px] text-red-500">{error}</p>
            )}
          </>
        )}
      </div>

      <GiphyAttribution />
    </div>
  );
}
