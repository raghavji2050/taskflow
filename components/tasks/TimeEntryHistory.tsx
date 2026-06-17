"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { formatDurationHms } from "@/lib/time-format";
import { useTimeRealtime } from "@/lib/useTimeRealtime";
import { EditTimeEntryModal, type TimeEntryRow } from "@/components/tasks/EditTimeEntryModal";
import { parseDurationInput } from "@/lib/time-format";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type RangePreset = "today" | "week" | "month" | "all";
type PageSize = 10 | 25 | 50;

interface Entry extends TimeEntryRow {
  user?: { id: string; name: string };
  canEdit?: boolean;
}

interface TimeEntryHistoryProps {
  taskId: string;
  readOnly?: boolean;
  showUserFilter?: boolean;
  memberOptions?: { id: string; name: string }[];
}

export function TimeEntryHistory({
  taskId,
  readOnly = false,
  showUserFilter = false,
  memberOptions = [],
}: TimeEntryHistoryProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [range, setRange] = useState<RangePreset>("all");
  const [filterUserId, setFilterUserId] = useState("");
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Entry | null>(null);

  useEffect(() => {
    setPage(1);
  }, [range, filterUserId, pageSize, taskId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
        range,
      });
      if (filterUserId) params.set("userId", filterUserId);
      const res = await fetch(`/api/time/task/${taskId}?${params}`);
      const data = await res.json();
      if (res.ok) {
        setEntries(data.entries ?? []);
        setTotalPages(data.pagination?.totalPages ?? 1);
      }
    } finally {
      setLoading(false);
    }
  }, [taskId, page, pageSize, range, filterUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  useTimeRealtime({ taskId, onEvent: () => void load() });

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this time entry?")) return;
    const res = await fetch(`/api/time/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error ?? "Could not delete");
      return;
    }
    toast.success("Time entry deleted");
    void load();
  };

  const handleEdit = async (input: {
    description: string;
    date: string;
    hours: number;
    minutes: number;
  }) => {
    if (!editing) return;
    const durationSeconds = parseDurationInput(input.hours, input.minutes);
    const end = new Date(`${input.date}T12:00:00`);
    const start = new Date(end.getTime() - durationSeconds * 1000);
    const res = await fetch(`/api/time/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: input.description || null,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        durationSeconds,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error ?? "Could not update");
    }
    toast.success("Time entry updated");
    setEditing(null);
    void load();
  };

  const userSelectOptions = [
    { value: "", label: "All users" },
    ...memberOptions.map((m) => ({ value: m.id, label: m.name })),
  ];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-wrap gap-1">
          {(["today", "week", "month", "all"] as RangePreset[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium",
                range === r
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
              )}
            >
              {r === "all" ? "All" : r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>
        {showUserFilter && memberOptions.length > 0 && (
          <Select
            hideLabel
            aria-label="Filter by user"
            value={filterUserId}
            onChange={(e) => setFilterUserId(e.target.value)}
            options={userSelectOptions}
            className="h-8 min-w-[120px] w-auto text-xs"
          />
        )}
        <Select
          hideLabel
          aria-label="Page size"
          value={String(pageSize)}
          onChange={(e) => setPageSize(Number(e.target.value) as PageSize)}
          options={[
            { value: "10", label: "10 / page" },
            { value: "25", label: "25 / page" },
            { value: "50", label: "50 / page" },
          ]}
          className="h-8 min-w-[100px] w-auto text-xs"
        />
      </div>

      {loading && entries.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Loading history…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No time entries match these filters.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--card-border)]">
          <table className="w-full min-w-[320px] text-left text-sm">
            <thead className="bg-[var(--surface-hover)] text-xs text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">User</th>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 font-medium">Duration</th>
                {!readOnly && <th className="px-3 py-2 font-medium" />}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t border-[var(--card-border)]">
                  <td className="px-3 py-2 text-[var(--foreground)]">
                    {format(new Date(entry.startTime), "MMM d, yyyy")}
                  </td>
                  <td className="px-3 py-2 text-[var(--muted)]">{entry.user?.name ?? "—"}</td>
                  <td className="max-w-[140px] truncate px-3 py-2 text-[var(--foreground)]">
                    {entry.description || "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-[var(--foreground)]">
                    {formatDurationHms(entry.duration)}
                  </td>
                  {!readOnly && (
                    <td className="px-3 py-2">
                      {entry.canEdit && (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => setEditing(entry)}
                            className="rounded p-1 text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
                            aria-label="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(entry.id)}
                            className="rounded p-1 text-[var(--muted)] hover:bg-red-500/10 hover:text-red-500"
                            aria-label="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-xs text-[var(--muted)]">
            Page {page} of {totalPages}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <EditTimeEntryModal
        entry={editing}
        isOpen={Boolean(editing)}
        onClose={() => setEditing(null)}
        onSubmit={handleEdit}
      />
    </div>
  );
}
