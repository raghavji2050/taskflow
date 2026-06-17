"use client";

import Link from "next/link";
import { Settings, Shield, Users } from "lucide-react";
import { useWorkspace } from "@/components/WorkspaceProvider";

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
  VIEWER: "Viewer",
};

export function TeamContextBar() {
  const {
    isPersonal,
    selectedWorkspace,
    members,
    currentMembership,
    canEditTasks,
  } = useWorkspace();

  if (isPersonal || !selectedWorkspace) return null;

  const roleLabel = currentMembership
    ? ROLE_LABELS[currentMembership.role] ?? currentMembership.role
    : "Member";

  return (
    <div className="border-b border-[var(--card-border)] bg-[var(--card)]">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-6 lg:px-8">
        <div className="min-w-0 flex-1 space-y-2">
          {!canEditTasks && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
              <Shield className="h-3.5 w-3.5 shrink-0" />
              View only — you cannot edit tasks in this workspace.
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
            <Users className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span className="font-semibold text-[var(--foreground)]">{selectedWorkspace.name}</span>
            <span>· {members.length} members</span>
            <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
              {roleLabel}
            </span>
          </div>
        </div>
        <Link
          href="/dashboard/team"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
        >
          <Settings className="h-3.5 w-3.5" />
          Team settings
        </Link>
      </div>
    </div>
  );
}
