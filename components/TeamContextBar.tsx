"use client";

import { useState } from "react";
import { BarChart3, ChevronDown, ChevronUp, Shield, Users, Zap } from "lucide-react";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { WorkloadPanel } from "@/components/WorkloadPanel";
import { AutomationRulesPanel } from "@/components/AutomationRulesPanel";
import { cn } from "@/lib/utils";

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
  VIEWER: "Viewer",
};

export function TeamContextBar() {
  const {
    isPersonal,
    selectedWorkspaceId,
    selectedWorkspace,
    members,
    currentMembership,
    canEditTasks,
    canManageWorkspace,
  } = useWorkspace();

  const [expanded, setExpanded] = useState(false);

  if (isPersonal || !selectedWorkspaceId) return null;

  const roleLabel = currentMembership
    ? ROLE_LABELS[currentMembership.role] ?? currentMembership.role
    : "Member";

  return (
    <div className="border-b border-[var(--card-border)] bg-[var(--card)]">
      <div className="px-4 py-2.5 sm:px-6 lg:px-8">
        {!canEditTasks && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            <Shield className="h-3.5 w-3.5 shrink-0" />
            View only — you cannot edit tasks in this workspace.
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
            <Users className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span className="font-semibold text-[var(--foreground)]">{selectedWorkspace?.name}</span>
            <span>· {members.length} members</span>
            <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
              {roleLabel}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--surface-hover)]"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Team insights
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
        <div
          className={cn(
            "grid gap-3 overflow-hidden transition-all",
            expanded ? "mt-3 grid-rows-[1fr] opacity-100" : "max-h-0 opacity-0"
          )}
        >
          <div className={cn("grid gap-3", canManageWorkspace ? "md:grid-cols-2" : "")}>
            <WorkloadPanel workspaceId={selectedWorkspaceId} />
            {canManageWorkspace && (
              <div>
                <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                  <Zap className="h-3 w-3" /> Automations
                </p>
                <AutomationRulesPanel workspaceId={selectedWorkspaceId} embedded />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
