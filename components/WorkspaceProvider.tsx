"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import type { WorkspaceRole } from "@prisma/client";
import {
  canInviteMembers,
  canManageWorkspace,
  canEditWorkspaceTasks,
} from "@/lib/workspace-permissions";

export interface WorkspaceMember {
  id: string;
  user: { id: string; name: string; email: string };
  role: WorkspaceRole;
  canInviteMembers: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  allowMemberInvites: boolean;
  archivedAt?: string | null;
  _count?: { tasks: number };
  members: WorkspaceMember[];
}

interface WorkspaceContextValue {
  workspaces: Workspace[];
  selectedWorkspaceId: string | null;
  selectedWorkspace: Workspace | null;
  isPersonal: boolean;
  members: WorkspaceMember[];
  currentMembership: WorkspaceMember | null;
  canInvite: boolean;
  canManageWorkspace: boolean;
  isLoading: boolean;
  selectWorkspace: (id: string | null) => void;
  refreshWorkspaces: () => Promise<Workspace[]>;
  createWorkspace: (name: string) => Promise<{ ok: boolean; workspace?: Workspace; error?: string }>;
  inviteMember: (email: string) => Promise<{ ok: boolean; error?: string }>;
  updateWorkspaceSettings: (allowMemberInvites: boolean) => Promise<{ ok: boolean; error?: string }>;
  updateMemberPermissions: (
    memberId: string,
    canInviteMembers: boolean
  ) => Promise<{ ok: boolean; error?: string }>;
  updateMemberRole: (
    memberId: string,
    role: string
  ) => Promise<{ ok: boolean; error?: string }>;
  canEditTasks: boolean;
  removeMember: (memberId: string) => Promise<{ ok: boolean; error?: string }>;
  revokeInvitation: (invitationId: string) => Promise<{ ok: boolean; error?: string }>;
  archiveWorkspace: (workspaceId: string) => Promise<{ ok: boolean; error?: string }>;
  restoreWorkspace: (workspaceId: string) => Promise<{ ok: boolean; error?: string }>;
  activeWorkspaces: Workspace[];
  archivedWorkspaces: Workspace[];
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export const WORKSPACE_STORAGE_KEY = "taskflow-workspace";

/** Per-user memory of the last workspace, so signing back in reopens it. */
export const LAST_WORKSPACE_KEY_PREFIX = "taskflow-last-workspace:";

export function lastWorkspaceKey(userId: string) {
  return `${LAST_WORKSPACE_KEY_PREFIX}${userId}`;
}

/**
 * Called on sign-out / session end. Clears the active (device-wide) selection so the
 * next account doesn't inherit it; each user's own last workspace is kept per user id
 * and is only ever applied if that user is still a member.
 */
export function clearWorkspaceSelection() {
  try {
    localStorage.removeItem(WORKSPACE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function pickSavedWorkspace(active: string | null, lastForUser: string | null): string | null {
  return active ?? lastForUser;
}

function resolveWorkspaceSelection(
  workspaceList: Workspace[],
  saved: string | null
): string | null {
  if (!saved || saved === "personal") return null;
  const match = workspaceList.find((w) => w.id === saved);
  if (!match || match.archivedAt) return null;
  return match.id;
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const selectedWorkspaceIdRef = useRef<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = session?.user?.id ?? null;

  const persistSelection = useCallback((id: string | null) => {
    const value = id ?? "personal";
    try {
      localStorage.setItem(WORKSPACE_STORAGE_KEY, value);
      if (userIdRef.current) localStorage.setItem(lastWorkspaceKey(userIdRef.current), value);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshWorkspaces = useCallback(async () => {
    const res = await fetch("/api/workspaces");
    const data = await res.json();
    if (!res.ok) return [] as Workspace[];

    const workspaceList = data.workspaces as Workspace[];
    setWorkspaces(workspaceList);

    const saved = pickSavedWorkspace(
      localStorage.getItem(WORKSPACE_STORAGE_KEY),
      userIdRef.current ? localStorage.getItem(lastWorkspaceKey(userIdRef.current)) : null
    );
    const nextId = resolveWorkspaceSelection(workspaceList, saved);
    const previousId = selectedWorkspaceIdRef.current;

    if (previousId && saved === previousId && !nextId) {
      const archived = workspaceList.find((w) => w.id === previousId)?.archivedAt;
      toast.info(
        archived ? "That workspace was archived" : "You no longer have access to that workspace"
      );
    }

    selectedWorkspaceIdRef.current = nextId;
    setSelectedWorkspaceId(nextId);
    persistSelection(nextId);

    return workspaceList;
  }, [persistSelection]);

  useEffect(() => {
    if (status === "loading") return;

    if (!session?.user?.id) {
      setWorkspaces([]);
      setSelectedWorkspaceId(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    refreshWorkspaces().finally(() => setIsLoading(false));
  }, [session?.user?.id, status, refreshWorkspaces]);

  useEffect(() => {
    const onWorkspaceChange = () => void refreshWorkspaces();
    window.addEventListener("taskflow:workspace", onWorkspaceChange);
    return () => {
      window.removeEventListener("taskflow:workspace", onWorkspaceChange);
    };
  }, [refreshWorkspaces]);

  const selectWorkspace = useCallback((id: string | null) => {
    selectedWorkspaceIdRef.current = id;
    setSelectedWorkspaceId(id);
    persistSelection(id);
  }, [persistSelection]);

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
      return { ok: true, workspace: data.workspace as Workspace };
    }
    return { ok: false, error: data.error ?? "Could not create workspace" };
  }, [refreshWorkspaces, selectWorkspace]);

  const inviteMember = useCallback(async (email: string) => {
    if (!selectedWorkspaceId) return { ok: false, error: "No workspace selected" };
    const res = await fetch(`/api/workspaces/${selectedWorkspaceId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (res.ok) {
      return { ok: true };
    }
    return { ok: false, error: data.error ?? "Could not send invitation" };
  }, [selectedWorkspaceId]);

  const updateWorkspaceSettings = useCallback(
    async (allowMemberInvites: boolean) => {
      if (!selectedWorkspaceId) return { ok: false, error: "No workspace selected" };
      const res = await fetch(`/api/workspaces/${selectedWorkspaceId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowMemberInvites }),
      });
      const data = await res.json();
      if (res.ok) {
        await refreshWorkspaces();
        return { ok: true };
      }
      return { ok: false, error: data.error ?? "Could not update settings" };
    },
    [selectedWorkspaceId, refreshWorkspaces]
  );

  const updateMemberPermissions = useCallback(
    async (memberId: string, canInviteMembers: boolean) => {
      if (!selectedWorkspaceId) return { ok: false, error: "No workspace selected" };
      const res = await fetch(`/api/workspaces/${selectedWorkspaceId}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canInviteMembers }),
      });
      const data = await res.json();
      if (res.ok) {
        await refreshWorkspaces();
        return { ok: true };
      }
      return { ok: false, error: data.error ?? "Could not update member permissions" };
    },
    [selectedWorkspaceId, refreshWorkspaces]
  );

  const updateMemberRole = useCallback(
    async (memberId: string, role: string) => {
      if (!selectedWorkspaceId) return { ok: false, error: "No workspace selected" };
      const res = await fetch(`/api/workspaces/${selectedWorkspaceId}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (res.ok) {
        await refreshWorkspaces();
        return { ok: true };
      }
      return { ok: false, error: data.error ?? "Could not update member role" };
    },
    [selectedWorkspaceId, refreshWorkspaces]
  );

  const removeMember = useCallback(
    async (memberId: string) => {
      if (!selectedWorkspaceId) return { ok: false, error: "No workspace selected" };
      const res = await fetch(`/api/workspaces/${selectedWorkspaceId}/members/${memberId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok) {
        await refreshWorkspaces();
        return { ok: true };
      }
      return { ok: false, error: data.error ?? "Could not remove member" };
    },
    [selectedWorkspaceId, refreshWorkspaces]
  );

  const revokeInvitation = useCallback(async (invitationId: string) => {
    const res = await fetch(`/api/invitations/${invitationId}`, { method: "DELETE" });
    const data = await res.json();
    if (res.ok) {
      return { ok: true };
    }
    return { ok: false, error: data.error ?? "Could not revoke invitation" };
  }, []);

  const setWorkspaceArchived = useCallback(
    async (workspaceId: string, archived: boolean) => {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.error ?? "Could not update workspace" };
      }
      await refreshWorkspaces();
      if (archived && selectedWorkspaceIdRef.current === workspaceId) {
        selectWorkspace(null);
      }
      return { ok: true };
    },
    [refreshWorkspaces, selectWorkspace]
  );

  const archiveWorkspace = useCallback(
    (workspaceId: string) => setWorkspaceArchived(workspaceId, true),
    [setWorkspaceArchived]
  );

  const restoreWorkspace = useCallback(
    (workspaceId: string) => setWorkspaceArchived(workspaceId, false),
    [setWorkspaceArchived]
  );

  const activeWorkspaces = useMemo(
    () => workspaces.filter((w) => !w.archivedAt),
    [workspaces]
  );

  const archivedWorkspaces = useMemo(
    () => workspaces.filter((w) => w.archivedAt),
    [workspaces]
  );

  const selectedWorkspace =
    activeWorkspaces.find((w) => w.id === selectedWorkspaceId) ?? null;
  const isPersonal = selectedWorkspaceId === null;

  const currentMembership = useMemo(() => {
    if (!selectedWorkspace || !session?.user?.id) return null;
    return selectedWorkspace.members.find((m) => m.user.id === session.user.id) ?? null;
  }, [selectedWorkspace, session?.user?.id]);

  const canInvite = useMemo(
    () => canInviteMembers(currentMembership, selectedWorkspace),
    [currentMembership, selectedWorkspace]
  );

  const canManage = useMemo(() => canManageWorkspace(currentMembership), [currentMembership]);

  const canEditTasks = useMemo(
    () => isPersonal || canEditWorkspaceTasks(currentMembership),
    [isPersonal, currentMembership]
  );

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        selectedWorkspaceId,
        selectedWorkspace,
        isPersonal,
        members: selectedWorkspace?.members ?? [],
        currentMembership,
        canInvite,
        canManageWorkspace: canManage,
        canEditTasks,
        isLoading,
        selectWorkspace,
        refreshWorkspaces,
        createWorkspace,
        inviteMember,
        updateWorkspaceSettings,
        updateMemberPermissions,
        updateMemberRole,
        removeMember,
        revokeInvitation,
        archiveWorkspace,
        restoreWorkspace,
        activeWorkspaces,
        archivedWorkspaces,
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
