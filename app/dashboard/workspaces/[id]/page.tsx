"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useWorkspace } from "@/components/WorkspaceProvider";

export default function WorkspaceRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const { selectWorkspace } = useWorkspace();
  const workspaceId = params.id as string;

  useEffect(() => {
    selectWorkspace(workspaceId);
    router.replace("/dashboard");
  }, [workspaceId, selectWorkspace, router]);

  return (
    <div className="flex items-center justify-center py-20 text-sm text-zinc-500">
      Switching to team workspace...
    </div>
  );
}
