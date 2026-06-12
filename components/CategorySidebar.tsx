"use client";

import { useEffect, useState } from "react";
import { Folder, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export interface Category {
  id: string;
  name: string;
  color: string;
  _count?: { tasks: number };
}

interface CategorySidebarProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  refreshKey?: number;
}

export function CategorySidebar({ selectedId, onSelect, refreshKey = 0 }: CategorySidebarProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [newName, setNewName] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const fetchCategories = async () => {
    const res = await fetch("/api/categories");
    const data = await res.json();
    if (res.ok) setCategories(data.categories);
  };

  useEffect(() => {
    fetchCategories();
  }, [refreshKey]);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const data = await res.json();
    setNewName("");
    setShowAdd(false);
    await fetchCategories();
    if (res.ok && data.category?.id) {
      onSelect(data.category.id);
    }
  };

  const cancelAdd = () => {
    setShowAdd(false);
    setNewName("");
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
        Categories
      </p>

      <div className="space-y-0.5">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors",
            selectedId === null
              ? "bg-indigo-500/10 font-medium text-indigo-600 dark:text-indigo-400"
              : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/80"
          )}
        >
          <Folder className="h-4 w-4 shrink-0" />
          <span className="truncate">All Tasks</span>
        </button>

        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => onSelect(cat.id)}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors",
              selectedId === cat.id
                ? "bg-indigo-500/10 font-medium text-indigo-600 dark:text-indigo-400"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/80"
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: cat.color }}
              />
              <span className="truncate">{cat.name}</span>
            </span>
            {cat._count != null && (
              <span className="shrink-0 text-xs tabular-nums text-zinc-400">
                {cat._count.tasks}
              </span>
            )}
          </button>
        ))}
      </div>

      {showAdd ? (
        <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50/50 p-2.5 dark:border-zinc-700 dark:bg-zinc-800/40">
          <Input
            hideLabel
            placeholder="Category name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
              if (e.key === "Escape") cancelAdd();
            }}
            className="h-8 text-sm"
            autoFocus
          />
          <div className="flex gap-1.5">
            <Button size="sm" onClick={handleAdd} className="h-8 flex-1 text-xs">
              Add
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={cancelAdd}
              className="h-8 w-8 shrink-0 p-0"
              aria-label="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex w-full items-center gap-2 rounded-lg border border-dashed border-zinc-200 px-2.5 py-2 text-xs text-zinc-400 transition-colors hover:border-indigo-300 hover:text-indigo-500 dark:border-zinc-700 dark:hover:border-indigo-700"
        >
          <Plus className="h-3.5 w-3.5 shrink-0" />
          <span>New category</span>
        </button>
      )}
    </div>
  );
}
