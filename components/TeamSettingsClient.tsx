"use client";

import { useWorkspace } from "@/components/WorkspaceProvider";
import { WorkspacePanel } from "@/components/WorkspacePanel";
import { PageHeader } from "@/components/PageHeader";
import { WorkspaceSetupCard } from "@/components/WorkspaceSetupCard";
import { PageLoader } from "@/components/ui/PageLoader";

export function TeamSettingsClient() {
  const { isPersonal, isLoading, selectedWorkspace, members } = useWorkspace();

  if (isLoading) return <PageLoader />;

  if (isPersonal) {
    return (
      <div className="space-y-6">
        <PageHeader title="Team" subtitle="Members, workload & automations" />
        <WorkspaceSetupCard reason="Teams live in a workspace. Open one or create it here, then invite people." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={selectedWorkspace?.name ?? "Team"}
        subtitle={`${members.length} team member${members.length !== 1 ? "s" : ""} · members, workload & automations`}
      />
      <WorkspacePanel />
    </div>
  );
}
