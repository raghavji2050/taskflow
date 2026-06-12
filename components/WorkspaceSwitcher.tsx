"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Plus, User, Users } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

export function WorkspaceSwitcher() {
  const {
    workspaces,
    selectedWorkspaceId,
    selectedWorkspace,
    isPersonal,
    selectWorkspace,
    createWorkspace,
  } = useWorkspace();

  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const ws = await createWorkspace(newName.trim());
    if (ws) {
      toast.success(`Workspace "${ws.name}" created`);
      setNewName("");
      setShowCreate(false);
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
      >
        <div className={cn(
          "flex h-7 w-7 items-center justify-center rounded-lg",
          isPersonal ? "bg-zinc-100 dark:bg-zinc-800" : "bg-indigo-500/15"
        )}>
          {isPersonal ? (
            <User className="h-3.5 w-3.5 text-zinc-600 dark:text-zinc-400" />
          ) : (
            <Users className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
          )}
        </div>
        <div className="text-left">
          <p className="text-[10px] uppercase tracking-wide text-zinc-400">Workspace</p>
          <p className="font-semibold text-zinc-900 dark:text-zinc-100">
            {isPersonal ? "Personal" : selectedWorkspace?.name}
          </p>
        </div>
        <ChevronsUpDown className="ml-2 h-4 w-4 text-zinc-400" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setShowCreate(false); }} />
          <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-xl border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">Switch workspace</p>

            <button
              type="button"
              onClick={() => { selectWorkspace(null); setOpen(false); }}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors",
                isPersonal ? "bg-indigo-500/10 text-indigo-600" : "hover:bg-zinc-50 dark:hover:bg-zinc-800"
              )}
            >
              <User className="h-4 w-4" />
              <span className="flex-1 text-left">Personal</span>
              {isPersonal && <Check className="h-4 w-4" />}
            </button>

            {workspaces.map((ws) => (
              <button
                key={ws.id}
                type="button"
                onClick={() => { selectWorkspace(ws.id); setOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors",
                  selectedWorkspaceId === ws.id ? "bg-indigo-500/10 text-indigo-600" : "hover:bg-zinc-50 dark:hover:bg-zinc-800"
                )}
              >
                <Users className="h-4 w-4" />
                <span className="flex-1 truncate text-left">{ws.name}</span>
                <span className="text-xs text-zinc-400">{ws._count?.tasks ?? 0}</span>
                {selectedWorkspaceId === ws.id && <Check className="h-4 w-4" />}
              </button>
            ))}

            <div className="mt-1 border-t border-zinc-100 pt-1 dark:border-zinc-800">
              {showCreate ? (
                <div className="flex gap-1 p-1">
                  <Input
                    hideLabel
                    placeholder="Team name..."
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                    className="h-8 text-xs"
                  />
                  <Button size="sm" onClick={handleCreate} className="h-8 shrink-0">Add</Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  <Plus className="h-4 w-4" />
                  Create workspace
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
