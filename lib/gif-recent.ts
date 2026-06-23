export const RECENT_GIFS_STORAGE_KEY = "taskflow:recent-gifs";
export const MAX_RECENT_GIFS = 12;

export interface RecentGif {
  id: string;
  title: string;
  previewUrl: string;
}

export function readRecentGifs(): RecentGif[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_GIFS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentGif[];
    return Array.isArray(parsed) ? parsed.filter((g) => g.id && g.previewUrl) : [];
  } catch {
    return [];
  }
}

export function rememberRecentGif(gif: RecentGif) {
  if (typeof window === "undefined") return;
  const next = [gif, ...readRecentGifs().filter((g) => g.id !== gif.id)].slice(
    0,
    MAX_RECENT_GIFS
  );
  localStorage.setItem(RECENT_GIFS_STORAGE_KEY, JSON.stringify(next));
}
