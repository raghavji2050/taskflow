"use client";

import { useState } from "react";
import { Archive, Check, ChevronsUpDown, Plus, RotateCcw, User, Users } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

interface WorkspaceSwitcherProps {
  layout?: "default" | "sidebar";
  collapsed?: boolean;
}

export function WorkspaceSwitcher({ layout = "default", collapsed = false }: WorkspaceSwitcherProps) {
  const { data: session } = useSession();
  const {
    activeWorkspaces,
    archivedWorkspaces,
    selectedWorkspaceId,
    selectedWorkspace,
    isPersonal,
    currentMembership,
    selectWorkspace,
    createWorkspace,
    restoreWorkspace,
  } = useWorkspace();

  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const roleLabel = !isPersonal && currentMembership
    ? ({ OWNER: "Owner", ADMIN: "Admin", MEMBER: "Member", VIEWER: "Viewer" } as const)[currentMembership.role] ?? currentMembership.role
    : null;

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const result = await createWorkspace(newName.trim());
    if (result.ok && result.workspace) {
      toast.success(`Workspace "${result.workspace.name}" created`);
      setNewName("");
      setShowCreate(false);
      setOpen(false);
    } else {
      toast.error(result.error ?? "Could not create workspace");
    }
  };

  const handleRestore = async (workspaceId: string, name: string) => {
    setRestoringId(workspaceId);
    const result = await restoreWorkspace(workspaceId);
    if (result.ok) {
      toast.success(`"${name}" restored`);
      selectWorkspace(workspaceId);
      setOpen(false);
    } else {
      toast.error(result.error ?? "Could not restore workspace");
    }
    setRestoringId(null);
  };

  const isOwnerOf = (workspaceId: string) => {
    const ws = archivedWorkspaces.find((w) => w.id === workspaceId);
    if (!ws || !session?.user?.id) return false;
    return ws.members.some((m) => m.user.id === session.user.id && m.role === "OWNER");
  };

  const isSidebar = layout === "sidebar";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-2.5 text-sm transition-colors",
          isSidebar
            ? cn("rounded-lg hover:bg-[var(--sidebar-hover)]", collapsed ? "w-full justify-center p-2" : "w-full px-2 py-2")
            : "rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 shadow-sm hover:bg-[var(--surface-hover)]"
        )}
        title={collapsed && isSidebar ? (isPersonal ? "Personal" : selectedWorkspace?.name) : undefined}
      >
        <div className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold",
          isPersonal ? "bg-[var(--sidebar-hover)] text-[var(--muted)]" : "bg-[var(--accent)] text-white"
        )}>
          {isPersonal ? (
            <User className="h-4 w-4" />
          ) : (
            <span>{(selectedWorkspace?.name ?? "T").charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className="min-w-0 flex-1 text-left">
          {!isSidebar && (
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Workspace</p>
          )}
          {!collapsed && (
            <>
              <p className="truncate text-sm font-medium text-[var(--foreground)]">
                {isPersonal ? "Personal" : selectedWorkspace?.name}
              </p>
              {roleLabel && isSidebar && (
                <p className="text-[11px] text-[var(--muted)]">{roleLabel}</p>
              )}
              {roleLabel && !isSidebar && (
                <p className="text-[10px] font-medium text-[var(--accent)]">{roleLabel}</p>
              )}
            </>
          )}
        </div>
        {!collapsed && <ChevronsUpDown className="h-4 w-4 shrink-0 text-[var(--muted-foreground)] opacity-60" />}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setShowCreate(false); }} />
          <div className={cn(
            "absolute z-50 mt-2 w-72 rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-2 shadow-lg",
            isSidebar ? "left-0 top-full" : "left-0 top-full"
          )}>
            <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
              Switch workspace
            </p>

            <button
              type="button"
              onClick={() => { selectWorkspace(null); setOpen(false); }}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors",
                isPersonal ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "hover:bg-[var(--surface-hover)]"
              )}
            >
              <User className="h-4 w-4" />
              <span className="flex-1 text-left">Personal</span>
              {isPersonal && <Check className="h-4 w-4" />}
            </button>

            {activeWorkspaces.map((ws) => (
              <button
                key={ws.id}
                type="button"
                onClick={() => { selectWorkspace(ws.id); setOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors",
                  selectedWorkspaceId === ws.id ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "hover:bg-[var(--surface-hover)]"
                )}
              >
                <Users className="h-4 w-4" />
                <span className="flex-1 truncate text-left">{ws.name}</span>
                <span className="text-xs text-[var(--muted)]">{ws._count?.tasks ?? 0}</span>
                {selectedWorkspaceId === ws.id && <Check className="h-4 w-4" />}
              </button>
            ))}

            {archivedWorkspaces.length > 0 && (
              <div className="mt-1 border-t border-[var(--card-border)] pt-1">
                <p className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                  <Archive className="h-3 w-3" />
                  Archived
                </p>
                {archivedWorkspaces.map((ws) => {
                  const canRestore = isOwnerOf(ws.id);
                  return (
                    <div
                      key={ws.id}
                      className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-[var(--muted)]"
                    >
                      <Users className="h-4 w-4 shrink-0 opacity-50" />
                      <span className="min-w-0 flex-1 truncate">{ws.name}</span>
                      {canRestore ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 shrink-0 px-2 text-[11px]"
                          isLoading={restoringId === ws.id}
                          onClick={() => void handleRestore(ws.id, ws.name)}
                        >
                          <RotateCcw className="h-3 w-3" />
                          Restore
                        </Button>
                      ) : (
                        <span className="shrink-0 text-[10px]">Owner only</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-1 border-t border-[var(--card-border)] pt-1">
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
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-[var(--muted)] hover:bg-[var(--surface-hover)]"
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
