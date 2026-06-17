"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { WorkspacePanel } from "@/components/WorkspacePanel";
import { PageHeader } from "@/components/PageHeader";

export function TeamSettingsClient() {
  const router = useRouter();
  const { isPersonal, selectedWorkspace, members } = useWorkspace();

  useEffect(() => {
    if (isPersonal) router.replace("/dashboard");
  }, [isPersonal, router]);

  if (isPersonal) return null;

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
