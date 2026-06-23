"use client";

import { useEffect, useRef, useState } from "react";
import type { LinkPreviewData } from "@/lib/link-preview";
import { normalizePreviewUrl } from "@/lib/link-preview";

type CacheEntry = LinkPreviewData | "error";

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CacheEntry>>();

async function loadPreview(url: string, signal: AbortSignal): Promise<CacheEntry> {
  const key = normalizePreviewUrl(url);
  const cached = cache.get(key);
  if (cached) return cached;

  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = (async (): Promise<CacheEntry> => {
    try {
      const res = await fetch(`/api/link-preview?url=${encodeURIComponent(key)}`, {
        signal,
      });
      const data = await res.json();
      if (!res.ok) {
        cache.set(key, "error");
        return "error";
      }
      const entry = data as LinkPreviewData;
      cache.set(key, entry);
      return entry;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw err;
      }
      cache.set(key, "error");
      return "error";
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

export function useLinkPreview(url: string | null, debounceMs = 300) {
  const [data, setData] = useState<LinkPreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();

    if (!url) {
      setData(null);
      setLoading(false);
      setError(false);
      return;
    }

    const key = normalizePreviewUrl(url);
    const cached = cache.get(key);
    if (cached && cached !== "error") {
      setData(cached);
      setLoading(false);
      setError(false);
      return;
    }
    if (cached === "error") {
      setData(null);
      setLoading(false);
      setError(true);
      return;
    }

    setLoading(true);
    setError(false);
    setData(null);

    debounceRef.current = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;

      void loadPreview(url, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return;
          if (result === "error") {
            setData(null);
            setError(true);
          } else {
            setData(result);
            setError(false);
          }
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setData(null);
          setError(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, debounceMs);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, [url, debounceMs]);

  return { data, loading, error };
}

/** Exposed for tests */
export function clearLinkPreviewCache() {
  cache.clear();
  inflight.clear();
}
