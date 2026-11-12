/** Pure helpers for the global search / Cmd-K palette (no DB, safe on client and server). */

export type SearchKind = "task" | "project" | "document" | "message" | "page";

export type SearchHit = {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle?: string | null;
  href: string;
  score: number;
};

export const MIN_QUERY = 2;
export const MAX_QUERY = 100;

/** Trim, collapse whitespace and cap length. Returns "" when too short to search. */
export function normalizeQuery(raw: string | null | undefined): string {
  const q = (raw ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY);
  return q.length >= MIN_QUERY ? q : "";
}

/**
 * Relevance of `text` for `query` (case-insensitive). 0 = no match.
 * exact 100 > prefix 80 > word-prefix 60 > substring 40 > every word present 20.
 */
export function scoreMatch(text: string | null | undefined, query: string): number {
  const t = (text ?? "").toLowerCase();
  const q = query.toLowerCase().trim();
  if (!t || !q) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  const idx = t.indexOf(q);
  if (idx > 0 && /[\s\-_/.:([]/.test(t[idx - 1])) return 60;
  if (idx >= 0) return 40;
  const words = q.split(" ").filter(Boolean);
  if (words.length > 1 && words.every((w) => t.includes(w))) return 20;
  return 0;
}

/** Best score across title (full weight) and secondary text (half weight). */
export function scoreHit(title: string, query: string, secondary?: string | null): number {
  return Math.max(scoreMatch(title, query), Math.floor(scoreMatch(secondary, query) / 2));
}

/** Sort by score desc, then keep original (recency) order; drop zero scores; cap. */
export function rankHits<T extends { score: number }>(hits: T[], limit: number): T[] {
  return hits
    .map((h, i) => ({ h, i }))
    .filter((x) => x.h.score > 0)
    .sort((a, b) => b.h.score - a.h.score || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.h);
}

export type PageCommand = { id: string; title: string; href: string; keywords: string };

export const PAGE_COMMANDS: PageCommand[] = [
  { id: "list", title: "My Tasks", href: "/dashboard", keywords: "list home tasks" },
  { id: "my-work", title: "My Work", href: "/dashboard/my-work", keywords: "assigned inbox today" },
  { id: "board", title: "Board", href: "/dashboard/board", keywords: "kanban columns" },
  { id: "calendar", title: "Calendar", href: "/dashboard/calendar", keywords: "dates schedule month" },
  { id: "timeline", title: "Timeline", href: "/dashboard/timeline", keywords: "gantt dependencies" },
  { id: "projects", title: "Projects", href: "/dashboard/projects", keywords: "project list" },
  { id: "messages", title: "Messages", href: "/dashboard/messages", keywords: "chat dm conversations" },
  { id: "docs", title: "Docs", href: "/dashboard/docs", keywords: "documents notes wiki" },
  { id: "insights", title: "Insights", href: "/dashboard/reports/insights", keywords: "dashboard reports charts stats" },
  { id: "goals", title: "Goals", href: "/dashboard/goals", keywords: "okr objectives key results targets" },
  { id: "time", title: "Time Reports", href: "/dashboard/reports/time", keywords: "timesheet hours tracking" },
  { id: "team", title: "Team", href: "/dashboard/team", keywords: "members workspace people" },
  { id: "trash", title: "Trash", href: "/dashboard/trash", keywords: "deleted restore bin" },
  { id: "settings", title: "Settings", href: "/settings", keywords: "profile account tokens preferences" },
];

/** Page shortcuts matching the query (all pages when the query is empty). */
export function matchPages(query: string, limit = 5): SearchHit[] {
  const q = query.trim();
  if (!q) return PAGE_COMMANDS.slice(0, limit).map((p) => ({ kind: "page", id: p.id, title: p.title, href: p.href, score: 1 }));
  return rankHits(
    PAGE_COMMANDS.map((p) => ({ kind: "page" as const, id: p.id, title: p.title, href: p.href, score: scoreHit(p.title, q, p.keywords) })),
    limit
  );
}

/** Strip simple markup and cut a snippet around the first match. */
export function snippet(text: string | null | undefined, query: string, width = 80): string | null {
  if (!text) return null;
  const plain = text.replace(/<[^>]+>/g, " ").replace(/[#*_`>\[\]]/g, "").replace(/\s+/g, " ").trim();
  if (!plain) return null;
  const idx = plain.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0 || plain.length <= width) return plain.length > width ? `${plain.slice(0, width)}…` : plain;
  const start = Math.max(0, idx - Math.floor(width / 3));
  const out = plain.slice(start, start + width);
  return `${start > 0 ? "…" : ""}${out}${start + width < plain.length ? "…" : ""}`;
}
