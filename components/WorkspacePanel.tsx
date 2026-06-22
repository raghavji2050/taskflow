"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, Clock, Mail, Shield, UserMinus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { WorkloadPanel } from "@/components/WorkloadPanel";
import { AutomationRulesPanel } from "@/components/AutomationRulesPanel";
import { Select } from "@/components/ui/Select";

interface PendingInvitation {
  id: string;
  status: string;
  createdAt: string;
  invitee: { id: string; name: string; email: string };
}

interface WorkspacePermissions {
  canInvite: boolean;
  canManage: boolean;
  allowMemberInvites: boolean;
}

function PermissionToggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-[var(--border)] px-3 py-2.5",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      <div className="min-w-0">
        <p className="text-xs font-medium text-[var(--foreground)]">{label}</p>
        {description && <p className="mt-0.5 text-[11px] text-[var(--muted)]">{description}</p>}
      </div>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--ring)]"
      />
    </label>
  );
}

export function WorkspacePanel() {
  const {
    isPersonal,
    selectedWorkspace,
    selectedWorkspaceId,
    members,
    canInvite,
    canManageWorkspace,
    inviteMember,
    refreshWorkspaces,
    updateWorkspaceSettings,
    updateMemberPermissions,
    updateMemberRole,
    removeMember,
    revokeInvitation,
    archiveWorkspace,
    currentMembership,
  } = useWorkspace();
  const [inviteEmail, setInviteEmail] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
  const [permissions, setPermissions] = useState<WorkspacePermissions | null>(null);
  const [savingSetting, setSavingSetting] = useState(false);
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);

  const fetchPending = useCallback(async () => {
    if (!selectedWorkspaceId) return;
    const res = await fetch(`/api/workspaces/${selectedWorkspaceId}/members`);
    if (res.ok) {
      const data = await res.json();
      setPendingInvitations(data.pendingInvitations ?? []);
      setPermissions(data.permissions ?? null);
    }
  }, [selectedWorkspaceId]);

  useEffect(() => {
    if (!isPersonal && selectedWorkspaceId) {
      void fetchPending();
    }
  }, [isPersonal, selectedWorkspaceId, members.length, fetchPending]);

  useEffect(() => {
    const onWorkspaceChange = (event: Event) => {
      const detail = (event as CustomEvent<{ workspaceId?: string }>).detail;
      if (
        !selectedWorkspaceId ||
        !detail?.workspaceId ||
        detail.workspaceId === selectedWorkspaceId
      ) {
        void fetchPending();
        void refreshWorkspaces();
      }
    };

    window.addEventListener("taskflow:workspace", onWorkspaceChange);
    return () => window.removeEventListener("taskflow:workspace", onWorkspaceChange);
  }, [selectedWorkspaceId, fetchPending, refreshWorkspaces]);

  if (isPersonal) return null;

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !canInvite) return;
    setIsInviting(true);
    const result = await inviteMember(inviteEmail.trim());
    if (result.ok) {
      toast.success("Invitation sent — they can accept from notifications");
      setInviteEmail("");
      await fetchPending();
    } else {
      toast.error(result.error ?? "Could not send invitation");
    }
    setIsInviting(false);
  };

  const handleAllowMemberInvites = async (allowMemberInvites: boolean) => {
    setSavingSetting(true);
    const result = await updateWorkspaceSettings(allowMemberInvites);
    if (result.ok) {
      toast.success(allowMemberInvites ? "All members can now invite" : "Only owner can invite now");
      await fetchPending();
    } else {
      toast.error(result.error ?? "Could not update settings");
    }
    setSavingSetting(false);
  };

  const handleMemberRole = async (memberId: string, role: string) => {
    setSavingMemberId(memberId);
    const result = await updateMemberRole(memberId, role);
    if (result.ok) {
      toast.success("Member role updated");
      await fetchPending();
    } else {
      toast.error(result.error ?? "Could not update role");
    }
    setSavingMemberId(null);
  };

  const handleMemberInvitePermission = async (memberId: string, canInviteMembers: boolean) => {
    setSavingMemberId(memberId);
    const result = await updateMemberPermissions(memberId, canInviteMembers);
    if (result.ok) {
      toast.success(canInviteMembers ? "Member can invite others" : "Invite permission removed");
      await fetchPending();
    } else {
      toast.error(result.error ?? "Could not update permissions");
    }
    setSavingMemberId(null);
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!confirm(`Remove ${memberName} from this workspace? They will lose access immediately.`)) {
      return;
    }
    setRemovingMemberId(memberId);
    const result = await removeMember(memberId);
    if (result.ok) {
      toast.success(`${memberName} removed from workspace`);
      await fetchPending();
    } else {
      toast.error(result.error ?? "Could not remove member");
    }
    setRemovingMemberId(null);
  };

  const handleRevokeInvite = async (invitationId: string, inviteeName: string) => {
    if (!confirm(`Revoke the invitation for ${inviteeName}?`)) {
      return;
    }
    setRevokingInviteId(invitationId);
    const result = await revokeInvitation(invitationId);
    if (result.ok) {
      toast.success("Invitation revoked");
      await fetchPending();
    } else {
      toast.error(result.error ?? "Could not revoke invitation");
    }
    setRevokingInviteId(null);
  };

  const handleArchive = async () => {
    if (!selectedWorkspaceId || !selectedWorkspace) return;
    const confirmed = confirm(
      `Archive "${selectedWorkspace.name}"?\n\nMembers will lose access until the owner restores it. Tasks and messages are kept.`
    );
    if (!confirmed) return;

    setIsArchiving(true);
    const result = await archiveWorkspace(selectedWorkspaceId);
    if (result.ok) {
      toast.success(`"${selectedWorkspace.name}" archived`);
    } else {
      toast.error(result.error ?? "Could not archive workspace");
    }
    setIsArchiving(false);
  };

  const isOwner = currentMembership?.role === "OWNER";

  const allowMemberInvites =
    permissions?.allowMemberInvites ?? selectedWorkspace?.allowMemberInvites ?? false;

  const showPending =
    (canManageWorkspace || canInvite) && pendingInvitations.length > 0;

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-[var(--accent)]" />
          <h3 className="text-sm font-semibold text-[var(--foreground)]">Team Members</h3>
        </div>
        <span className="text-xs text-[var(--muted-foreground)]">{members.length} members</span>
      </div>

      <div className="mb-3 space-y-2">
        {members.map((m) => (
          <div
            key={m.user.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--surface-3)] px-2.5 py-2"
          >
            <div className="min-w-0">
              <span className="text-xs font-medium">{m.user.name}</span>
              <span className="ml-1.5 text-xs text-[var(--muted-foreground)]">· {m.role}</span>
              {m.role === "OWNER" && (
                <span className="ml-1.5 text-[10px] text-[var(--accent)]">can invite</span>
              )}
              {m.role !== "OWNER" && m.canInviteMembers && !allowMemberInvites && (
                <span className="ml-1.5 text-[10px] text-emerald-600 dark:text-emerald-400">can invite</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canManageWorkspace && m.role !== "OWNER" && (
                <Select
                  hideLabel
                  className="h-7 w-24 text-[11px]"
                  value={m.role}
                  disabled={savingMemberId === m.id}
                  onChange={(e) => void handleMemberRole(m.id, e.target.value)}
                  options={[
                    { value: "ADMIN", label: "Admin" },
                    { value: "MEMBER", label: "Member" },
                    { value: "VIEWER", label: "Viewer" },
                  ]}
                />
              )}
              {canManageWorkspace && m.role !== "OWNER" && !allowMemberInvites && (
                <label className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
                  <input
                    type="checkbox"
                    checked={m.canInviteMembers}
                    disabled={savingMemberId === m.id || removingMemberId === m.id}
                    onChange={(e) => void handleMemberInvitePermission(m.id, e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-[var(--border)] text-[var(--accent)]"
                  />
                  Can invite
                </label>
              )}
              {canManageWorkspace && m.role !== "OWNER" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px] text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40"
                  isLoading={removingMemberId === m.id}
                  onClick={() => void handleRemoveMember(m.id, m.user.name)}
                >
                  <UserMinus className="h-3 w-3" />
                  Remove
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {canManageWorkspace && (
        <div className="mb-3 space-y-2">
          <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            <Shield className="h-3 w-3" /> Invite permissions
          </p>
          <PermissionToggle
            label="Allow all members to invite"
            description="When off, only you and members you grant permission can invite."
            checked={allowMemberInvites}
            disabled={savingSetting}
            onChange={(checked) => void handleAllowMemberInvites(checked)}
          />
        </div>
      )}

      {showPending && (
        <div className="mb-3 rounded-lg border border-amber-200/80 bg-amber-50/50 p-2.5 dark:border-amber-900/50 dark:bg-amber-950/20">
          <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            <Clock className="h-3 w-3" /> Pending invites
          </p>
          <div className="space-y-1.5">
            {pendingInvitations.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-2">
                <p className="min-w-0 text-xs text-[var(--muted)]">
                  {inv.invitee.name}{" "}
                  <span className="text-[var(--muted-foreground)]">({inv.invitee.email})</span>
                </p>
                {canManageWorkspace && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 shrink-0 px-1.5 text-[10px] text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                    isLoading={revokingInviteId === inv.id}
                    onClick={() => void handleRevokeInvite(inv.id, inv.invitee.name)}
                  >
                    <X className="h-3 w-3" />
                    Revoke
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {canInvite ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="min-w-0 flex-1">
            <Input
              hideLabel
              type="email"
              placeholder="Invite by email..."
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleInvite()}
              startIcon={<Mail />}
              className="h-9 text-sm"
            />
          </div>
          <Button size="sm" onClick={handleInvite} isLoading={isInviting} className="h-9 shrink-0 sm:px-4">
            Invite
          </Button>
        </div>
      ) : (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-3)] px-3 py-2.5 text-xs text-[var(--muted)]">
          Only the workspace owner can invite members. Ask the owner to grant you invite permission.
        </p>
      )}

      {selectedWorkspace && canInvite && (
        <p className="mt-2.5 text-xs text-[var(--muted-foreground)]">
          Invited users must <span className="font-medium text-[var(--muted)]">accept</span> before joining{" "}
          <span className="font-medium text-[var(--muted)]">{selectedWorkspace.name}</span>
        </p>
      )}

      {selectedWorkspaceId && (
        <div className="mt-4 space-y-4">
          <WorkloadPanel workspaceId={selectedWorkspaceId} />
          {canManageWorkspace && <AutomationRulesPanel workspaceId={selectedWorkspaceId} />}
        </div>
      )}

      {isOwner && selectedWorkspace && (
        <div className="mt-4 rounded-lg border border-red-200/80 bg-red-50/40 p-3 dark:border-red-900/50 dark:bg-red-950/20">
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">
            <Archive className="h-3 w-3" />
            Danger zone
          </p>
          <p className="mb-2 text-xs text-[var(--muted)]">
            Archive this workspace to hide it from everyone. Personal tasks are unaffected. You can restore it later from the workspace switcher.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-red-600 hover:bg-red-100 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40"
            isLoading={isArchiving}
            onClick={() => void handleArchive()}
          >
            <Archive className="h-3.5 w-3.5" />
            Archive workspace
          </Button>
        </div>
      )}
    </Card>
  );
}
