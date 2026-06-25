export interface GiphyGif {
  id: string;
  title: string;
  previewUrl: string;
  width: number;
  height: number;
}

interface GiphyImageSet {
  url?: string;
  width?: string;
  height?: string;
}

interface GiphyApiItem {
  id: string;
  title?: string;
  images?: {
    fixed_height?: GiphyImageSet;
    preview_gif?: GiphyImageSet;
    downsized?: GiphyImageSet;
    original?: GiphyImageSet;
  };
}

interface GiphyListResponse {
  data?: GiphyApiItem[] | GiphyApiItem;
  pagination?: { total_count?: number; count?: number; offset?: number };
}

const GIPHY_BASE = "https://api.giphy.com/v1/gifs";
export const GIPHY_PAGE_SIZE = 24;
const SEARCH_CACHE_TTL_MS = 60_000;
const TRENDING_CACHE_TTL_MS = 120_000;

type GifListResult = { gifs: GiphyGif[]; offset: number; total: number };

const listCache = new Map<string, { expires: number; value: GifListResult }>();

function getListCache(key: string): GifListResult | null {
  const entry = listCache.get(key);
  if (!entry || entry.expires < Date.now()) {
    listCache.delete(key);
    return null;
  }
  return entry.value;
}

function setListCache(key: string, value: GifListResult, ttlMs: number) {
  listCache.set(key, { expires: Date.now() + ttlMs, value });
}

function getGiphyApiKey() {
  const key = process.env.GIPHY_API_KEY?.trim();
  if (!key) throw new Error("Giphy is not configured");
  return key;
}

export function normalizeGiphyItem(item: GiphyApiItem): GiphyGif | null {
  if (!item.id) return null;
  const images = item.images ?? {};
  const preview =
    images.fixed_height?.url ??
    images.preview_gif?.url ??
    images.downsized?.url ??
    images.original?.url;
  if (!preview) return null;

  const width = Number(images.fixed_height?.width ?? images.original?.width ?? 200);
  const height = Number(images.fixed_height?.height ?? images.original?.height ?? 200);

  return {
    id: item.id,
    title: item.title?.trim() || "GIF",
    previewUrl: preview,
    width: Number.isFinite(width) ? width : 200,
    height: Number.isFinite(height) ? height : 200,
  };
}

export function normalizeGiphyList(data: GiphyApiItem[]): GiphyGif[] {
  return data.map(normalizeGiphyItem).filter((g): g is GiphyGif => g !== null);
}

async function giphyFetch(path: string, params: Record<string, string>) {
  const url = new URL(`${GIPHY_BASE}${path}`);
  url.searchParams.set("api_key", getGiphyApiKey());
  url.searchParams.set("rating", "pg");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (res.status === 429) {
    throw new Error("Giphy rate limit reached. Try again in a moment.");
  }
  if (!res.ok) {
    throw new Error(`Giphy request failed (${res.status})`);
  }
  return (await res.json()) as GiphyListResponse;
}

export function giphyHasMore(offset: number, count: number, total: number) {
  if (count === 0) return false;
  return offset + count < total;
}

export async function searchGifs(query: string, offset = 0, limit = GIPHY_PAGE_SIZE) {
  const q = query.trim();
  if (!q) return { gifs: [], offset: 0, total: 0 };

  const cacheKey = `search:${q.toLowerCase()}:${offset}:${limit}`;
  const cached = getListCache(cacheKey);
  if (cached) return cached;

  const json = await giphyFetch("/search", {
    q,
    limit: String(Math.min(limit, 50)),
    offset: String(Math.max(0, offset)),
  });

  const result = {
    gifs: normalizeGiphyList(Array.isArray(json.data) ? json.data : []),
    offset: json.pagination?.offset ?? offset,
    total: json.pagination?.total_count ?? 0,
  };
  setListCache(cacheKey, result, SEARCH_CACHE_TTL_MS);
  return result;
}

export async function getTrendingGifs(offset = 0, limit = GIPHY_PAGE_SIZE) {
  const cacheKey = `trending:${offset}:${limit}`;
  const cached = getListCache(cacheKey);
  if (cached) return cached;

  const json = await giphyFetch("/trending", {
    limit: String(Math.min(limit, 50)),
    offset: String(Math.max(0, offset)),
  });

  const items = Array.isArray(json.data) ? json.data : [];

  const result = {
    gifs: normalizeGiphyList(items),
    offset: json.pagination?.offset ?? offset,
    total: json.pagination?.total_count ?? 0,
  };
  setListCache(cacheKey, result, TRENDING_CACHE_TTL_MS);
  return result;
}

export function resolveGifDownloadUrl(item: GiphyApiItem): string | null {
  const images = item.images ?? {};
  return (
    images.downsized?.url ??
    images.fixed_height?.url ??
    images.original?.url ??
    images.preview_gif?.url ??
    null
  );
}

export async function getGiphyById(giphyId: string) {
  const json = await giphyFetch(`/${encodeURIComponent(giphyId)}`, {});
  const raw = json.data;
  const item = Array.isArray(raw) ? raw[0] : raw;
  if (!item) throw new Error("GIF not found");

  const normalized = normalizeGiphyItem(item);
  if (!normalized) throw new Error("GIF not found");

  const downloadUrl = resolveGifDownloadUrl(item);
  if (!downloadUrl) throw new Error("GIF not found");

  return { ...normalized, downloadUrl };
}

export async function fetchGiphyAsFile(giphyId: string) {
  const { downloadUrl, title } = await getGiphyById(giphyId);
  const res = await fetch(downloadUrl);
  if (!res.ok) throw new Error("Failed to download GIF");

  const buffer = await res.arrayBuffer();
  if (buffer.byteLength > 20 * 1024 * 1024) {
    throw new Error("GIF exceeds size limit");
  }

  const filename = `giphy-${giphyId}.gif`;
  const file = new File([buffer], filename, { type: "image/gif" });
  return { file, title };
}
