"use client";

import { Download } from "lucide-react";

/** CSV / PDF download links for the current report scope. */
export function ExportButtons({ type, workspaceId, projectId, range }: { type: "tasks" | "time"; workspaceId?: string | null; projectId?: string | null; range?: string }) {
  const href = (format: "csv" | "pdf") => {
    const p = new URLSearchParams({ type, format, tzOffset: String(new Date().getTimezoneOffset()) });
    if (workspaceId) p.set("workspaceId", workspaceId);
    if (projectId) p.set("projectId", projectId);
    if (range) p.set("range", range);
    return `/api/reports/export?${p}`;
  };
  const cls = "inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface-hover)]";
  const what = type === "tasks" ? "tasks" : "time entries";
  return (
    <div className="flex items-center gap-2" data-testid={`export-${type}`}>
      <a href={href("csv")} download className={cls} aria-label={`Export ${what} as CSV`}>
        <Download className="h-4 w-4" aria-hidden="true" /> CSV
      </a>
      <a href={href("pdf")} download className={cls} aria-label={`Export ${what} as PDF`}>
        <Download className="h-4 w-4" aria-hidden="true" /> PDF
      </a>
    </div>
  );
}
