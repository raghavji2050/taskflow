"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export interface WorkspaceMember {
  user: { id: string; name: string; email: string };
  role: string;
}

export interface Workspace {
  id: string;
  name: string;
  _count?: { tasks: number };
  members: WorkspaceMember[];
}

interface WorkspaceContextValue {
  workspaces: Workspace[];
  selectedWorkspaceId: string | null;
  selectedWorkspace: Workspace | null;
  isPersonal: boolean;
  members: WorkspaceMember[];
  isLoading: boolean;
  selectWorkspace: (id: string | null) => void;
  refreshWorkspaces: () => Promise<void>;
  createWorkspace: (name: string) => Promise<Workspace | null>;
  inviteMember: (email: string) => Promise<boolean>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const STORAGE_KEY = "taskflow-workspace";

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshWorkspaces = useCallback(async () => {
    const res = await fetch("/api/workspaces");
    const data = await res.json();
    if (res.ok) setWorkspaces(data.workspaces);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved !== "personal") setSelectedWorkspaceId(saved);
    refreshWorkspaces().finally(() => setIsLoading(false));
  }, [refreshWorkspaces]);

  const selectWorkspace = useCallback((id: string | null) => {
    setSelectedWorkspaceId(id);
    localStorage.setItem(STORAGE_KEY, id ?? "personal");
  }, []);

  const createWorkspace = useCallback(async (name: string) => {
    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (res.ok) {
      await refreshWorkspaces();
      selectWorkspace(data.workspace.id);
      return data.workspace;
    }
    return null;
  }, [refreshWorkspaces, selectWorkspace]);

  const inviteMember = useCallback(async (email: string) => {
    if (!selectedWorkspaceId) return false;
    const res = await fetch(`/api/workspaces/${selectedWorkspaceId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (res.ok) {
      await refreshWorkspaces();
      return true;
    }
    return false;
  }, [selectedWorkspaceId, refreshWorkspaces]);

  const selectedWorkspace = workspaces.find((w) => w.id === selectedWorkspaceId) ?? null;
  const isPersonal = selectedWorkspaceId === null;

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        selectedWorkspaceId,
        selectedWorkspace,
        isPersonal,
        members: selectedWorkspace?.members ?? [],
        isLoading,
        selectWorkspace,
        refreshWorkspaces,
        createWorkspace,
        inviteMember,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
