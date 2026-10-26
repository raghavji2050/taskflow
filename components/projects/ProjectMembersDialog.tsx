"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import type { ProjectRoleName } from "@/lib/project-sections";

const ROLE_OPTIONS = [
  { value: "OWNER", label: "Owner" },
  { value: "ADMIN", label: "Admin" },
  { value: "MEMBER", label: "Member" },
  { value: "VIEWER", label: "Viewer" },
];

export type ProjectMemberRow = {
  id: string;
  role: ProjectRoleName;
  userId: string;
  user: { id: string; name: string; email: string };
};

type ProjectMembersDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  workspaceId: string;
  members: ProjectMemberRow[];
  canManage: boolean;
  onChanged: () => void;
};

export function ProjectMembersDialog({
  isOpen,
  onClose,
  projectId,
  workspaceId,
  members,
  canManage,
  onChanged,
}: ProjectMembersDialogProps) {
  const { workspaces } = useWorkspace();
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<ProjectRoleName>("MEMBER");
  const [pending, setPending] = useState(false);

  const candidates = useMemo(() => {
    const workspace = workspaces.find((item) => item.id === workspaceId);
    const taken = new Set(members.map((member) => member.userId));
    return (workspace?.members ?? []).filter((member) => !taken.has(member.user.id));
  }, [workspaces, workspaceId, members]);

  const run = async (action: () => Promise<Response>, success: string) => {
    setPending(true);
    try {
      const res = await action();
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      toast.success(success);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Request failed");
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Project members"
      description="People on this project, and what they can do."
      size="md"
    >
      <ul className="space-y-2">
        {members.map((member) => (
          <li key={member.id} className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{member.user.name}</p>
              <p className="truncate text-xs text-[var(--muted)]">{member.user.email}</p>
            </div>
            {canManage ? (
              <Select
                hideLabel
                label={`Role for ${member.user.name}`}
                value={member.role}
                options={ROLE_OPTIONS}
                disabled={pending}
                onChange={(event) => {
                  const nextRole = event.target.value as ProjectRoleName;
                  void run(
                    () => fetch(`/api/projects/${projectId}/members/${member.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ role: nextRole }),
                    }),
                    "Role updated"
                  );
                }}
                className="w-32"
              />
            ) : (
              <span className="text-xs font-medium uppercase text-[var(--muted)]">{member.role}</span>
            )}
            {canManage && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => {
                  if (!confirm(`Remove ${member.user.name} from this project?`)) return;
                  void run(
                    () => fetch(`/api/projects/${projectId}/members/${member.id}`, { method: "DELETE" }),
                    "Member removed"
                  );
                }}
              >
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>

      {canManage && (
        <form
          className="mt-4 flex flex-col gap-2 border-t border-[var(--border)] pt-4 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            if (!userId) return;
            void run(async () => {
              const res = await fetch(`/api/projects/${projectId}/members`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, role }),
              });
              if (res.ok) setUserId("");
              return res;
            }, "Member added");
          }}
        >
          <div className="min-w-0 flex-1">
            <Select
              label="Add workspace member"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              options={[
                { value: "", label: candidates.length ? "Choose a person" : "No one else to add" },
                ...candidates.map((member) => ({ value: member.user.id, label: member.user.name })),
              ]}
            />
          </div>
          <div className="w-full sm:w-32">
            <Select
              label="Role"
              value={role}
              onChange={(event) => setRole(event.target.value as ProjectRoleName)}
              options={ROLE_OPTIONS}
            />
          </div>
          <Button type="submit" disabled={pending || !userId}>Add</Button>
        </form>
      )}
    </Modal>
  );
}
