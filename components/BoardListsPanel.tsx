"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

export interface BoardColumn {
  id: string;
  name: string;
  color: string;
  position: number;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | null;
}

interface BoardListsPanelProps {
  workspaceId: string | null;
  readOnly?: boolean;
  compact?: boolean;
  variant?: "card" | "inline" | "sidebar";
  onChange?: () => void;
}

const PRESET_COLORS = ["#38bdf8", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#6366f1"];

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
};

export function BoardListsPanel({
  workspaceId,
  readOnly = false,
  compact = false,
  variant = "card",
  onChange,
}: BoardListsPanelProps) {
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [expanded, setExpanded] = useState(false);

  const isInline = variant === "inline";
  const isSidebar = variant === "sidebar" || (variant === "card" && compact);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (workspaceId) params.set("workspaceId", workspaceId);
    const res = await fetch(`/api/board-columns?${params}`);
    const data = await res.json();
    if (res.ok) setColumns(data.columns ?? []);
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const notify = () => {
    void load();
    onChange?.();
  };

  const addColumn = async () => {
    if (!newName.trim()) return;
    const color = PRESET_COLORS[columns.length % PRESET_COLORS.length];
    const res = await fetch("/api/board-columns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), color, workspaceId }),
    });
    if (res.ok) {
      toast.success("List added");
      setNewName("");
      setShowAdd(false);
      notify();
    } else {
      toast.error((await res.json()).error ?? "Could not add list");
    }
  };

  const saveRename = async (id: string) => {
    if (!editName.trim()) return;
    const col = columns.find((c) => c.id === id);
    if (!col) return;
    const res = await fetch(`/api/board-columns/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim(), color: col.color }),
    });
    if (res.ok) {
      setEditingId(null);
      notify();
    } else {
      toast.error("Could not rename list");
    }
  };

  const deleteColumn = async (id: string) => {
    if (columns.length <= 1) {
      toast.error("Keep at least one list");
      return;
    }
    const res = await fetch(`/api/board-columns/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("List removed");
      notify();
    } else {
      toast.error("Could not delete list");
    }
  };

  if (loading) {
    return (
      <div
        className={cn(
          "animate-pulse rounded-lg bg-[var(--surface-hover)]",
          isInline ? "h-9" : isSidebar ? "h-9" : compact ? "h-28" : "h-32"
        )}
      />
    );
  }

  const addForm = showAdd && !readOnly && (
    <div
      className={cn(
        isInline && "flex min-w-[10rem] flex-1 items-center gap-1.5",
        isSidebar && "mt-2 space-y-1.5",
        !isInline && !isSidebar && "mt-3 space-y-2"
      )}
    >
      {isInline ? (
        <>
          <Input
            hideLabel
            placeholder="New list name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addColumn();
              if (e.key === "Escape") { setShowAdd(false); setNewName(""); }
            }}
            className="h-7 min-w-0 flex-1 text-xs"
            autoFocus
          />
          <Button size="sm" onClick={() => void addColumn()} className="h-7 px-2 text-xs">
            Add
          </Button>
          <button
            type="button"
            onClick={() => { setShowAdd(false); setNewName(""); }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-hover)]"
            aria-label="Cancel"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      ) : isSidebar ? (
        <>
          <Input
            hideLabel
            placeholder="List name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addColumn();
              if (e.key === "Escape") { setShowAdd(false); setNewName(""); }
            }}
            className="h-7 w-full text-xs"
            autoFocus
          />
          <div className="flex gap-1">
            <Button size="sm" onClick={() => void addColumn()} className="h-7 flex-1 text-xs">
              Add
            </Button>
            <button
              type="button"
              onClick={() => { setShowAdd(false); setNewName(""); }}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-hover)]"
              aria-label="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </>
      ) : (
        <>
          <Input
            hideLabel
            placeholder="e.g. Review, Backlog"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addColumn();
              if (e.key === "Escape") { setShowAdd(false); setNewName(""); }
            }}
            className="h-9 w-full text-sm"
            autoFocus
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void addColumn()} className="h-9 flex-1">
              Add
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setShowAdd(false); setNewName(""); }}
              className="h-9 w-9 shrink-0 p-0"
              aria-label="Cancel"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );

  const listChip = (col: BoardColumn) => {
    if (editingId === col.id) {
      return (
        <div key={col.id} className="flex min-w-[8rem] items-center gap-1">
          <Input
            hideLabel
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void saveRename(col.id);
              if (e.key === "Escape") setEditingId(null);
            }}
            className="h-7 min-w-0 flex-1 text-xs"
            autoFocus
          />
          <Button size="sm" className="h-7 px-2 text-xs" onClick={() => void saveRename(col.id)}>
            Save
          </Button>
        </div>
      );
    }

    if (isInline) {
      return (
        <div
          key={col.id}
          className="group inline-flex h-7 max-w-[10rem] items-center gap-1.5 rounded-md border border-[var(--card-border)] bg-[var(--background)] px-2"
          title={col.status ? `${col.name} · ${STATUS_LABELS[col.status]}` : col.name}
        >
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: col.color }} />
          <span className="truncate text-xs font-medium text-[var(--foreground)]">{col.name}</span>
          {!readOnly && (
            <span className="ml-0.5 flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                aria-label="Rename list"
                onClick={() => { setEditingId(col.id); setEditName(col.name); }}
                className="rounded p-0.5 text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                type="button"
                aria-label="Delete list"
                onClick={() => void deleteColumn(col.id)}
                className="rounded p-0.5 text-red-500 hover:bg-red-500/10"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>
      );
    }

    if (isSidebar) {
      return (
        <li
          key={col.id}
          className="group flex h-7 items-center gap-1.5 rounded-md px-1 hover:bg-[var(--surface-hover)]"
          title={col.status ? `${col.name} · ${STATUS_LABELS[col.status]}` : col.name}
        >
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: col.color }} />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--foreground)]">
            {col.name}
          </span>
          {!readOnly && (
            <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                aria-label="Rename list"
                onClick={() => { setEditingId(col.id); setEditName(col.name); }}
                className="rounded p-0.5 text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                type="button"
                aria-label="Delete list"
                onClick={() => void deleteColumn(col.id)}
                className="rounded p-0.5 text-red-500 hover:bg-red-500/10"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          )}
        </li>
      );
    }

    return (
      <li
        key={col.id}
        className="group rounded-lg border border-transparent px-2 py-2 transition-colors hover:border-[var(--card-border)] hover:bg-[var(--surface-hover)]"
        title={col.status ? `Maps to ${STATUS_LABELS[col.status] ?? col.status}` : col.name}
      >
        <div className="flex items-start gap-2">
          <span
            className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white dark:ring-[var(--card)]"
            style={{ background: col.color }}
          />
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-medium leading-snug text-[var(--foreground)]">
              {col.name}
            </p>
            {col.status && (
              <p className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
                {STATUS_LABELS[col.status]}
              </p>
            )}
          </div>
          {!readOnly && (
            <div className="flex shrink-0 gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
              <button
                type="button"
                aria-label="Rename list"
                onClick={() => { setEditingId(col.id); setEditName(col.name); }}
                className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--card)] hover:text-[var(--foreground)]"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Delete list"
                onClick={() => void deleteColumn(col.id)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-red-500 hover:bg-red-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </li>
    );
  };

  if (isSidebar) {
    return (
      <Card className="p-2.5">
        <div className="flex items-center justify-between gap-1">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex min-w-0 items-center gap-1 text-xs font-semibold text-[var(--foreground)]"
          >
            <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-[var(--muted)] transition-transform", expanded && "rotate-180")} />
            <span className="truncate">Lists</span>
            <span className="rounded-full bg-[var(--surface-hover)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
              {columns.length}
            </span>
          </button>
          {!readOnly && !showAdd && (
            <button
              type="button"
              onClick={() => { setExpanded(true); setShowAdd(true); }}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--accent)]"
              aria-label="Add list"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {expanded && !showAdd && (
          <ul className="mt-1.5 space-y-0.5">
            {columns.map((col) =>
              editingId === col.id ? (
                <li key={col.id} className="py-0.5">
                  <div className="flex gap-1">
                    <Input
                      hideLabel
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void saveRename(col.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="h-7 min-w-0 flex-1 text-xs"
                      autoFocus
                    />
                    <Button size="sm" className="h-7 px-2 text-xs" onClick={() => void saveRename(col.id)}>
                      Save
                    </Button>
                  </div>
                </li>
              ) : (
                listChip(col)
              )
            )}
          </ul>
        )}

        {columns.length === 0 && expanded && (
          <p className="mt-2 text-center text-[10px] text-[var(--muted)]">No lists yet</p>
        )}

        {addForm}
      </Card>
    );
  }

  if (isInline) {
    return (
      <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />
            Lists
            <span className="rounded-full bg-[var(--surface-hover)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--foreground)]">
              {columns.length}
            </span>
          </button>

          {(expanded || showAdd) && (
            <>
              <div className="hidden h-4 w-px bg-[var(--card-border)] sm:block" />
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                {columns.map(listChip)}
              </div>
            </>
          )}

          {!readOnly && !showAdd && (
            <button
              type="button"
              onClick={() => { setExpanded(true); setShowAdd(true); }}
              className="ml-auto inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-[var(--card-border)] px-2 text-xs font-medium text-[var(--muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          )}

          {addForm}
        </div>
      </div>
    );
  }

  return (
    <Card className={cn(compact ? "p-3" : "p-4")}>
      <div className={cn("mb-3", compact ? "space-y-2" : "flex items-start justify-between gap-3")}>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--foreground)]">Board lists</p>
          <p className="mt-0.5 text-xs leading-snug text-[var(--muted)]">
            {compact ? "Board columns" : "Manage columns on the Board view"}
          </p>
        </div>
        {!readOnly && !showAdd && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowAdd(true)}
            className={cn("shrink-0", compact && "w-full justify-center")}
          >
            <Plus className="h-3.5 w-3.5" />
            Add list
          </Button>
        )}
      </div>

      <ul className="space-y-1">
        {columns.map((col) => (
          editingId === col.id ? (
            <li key={col.id} className="px-2 py-1">
              <div className="flex gap-1.5">
                <Input
                  hideLabel
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveRename(col.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="h-8 min-w-0 flex-1 text-sm"
                  autoFocus
                />
                <Button size="sm" className="h-8 shrink-0 px-2 text-xs" onClick={() => void saveRename(col.id)}>
                  Save
                </Button>
              </div>
            </li>
          ) : (
            listChip(col)
          )
        ))}
      </ul>

      {columns.length === 0 && (
        <p className="py-4 text-center text-xs text-[var(--muted)]">No lists yet</p>
      )}

      {showAdd && !readOnly && (
        <div className={cn(compact && "border-t border-[var(--card-border)] pt-3")}>
          {addForm}
        </div>
      )}
    </Card>
  );
}
