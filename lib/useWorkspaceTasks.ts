"use client";

import { useWorkspace } from "@/components/WorkspaceProvider";

export function useWorkspaceQueryParam() {
  const { selectedWorkspaceId } = useWorkspace();

  const params = new URLSearchParams();
  if (selectedWorkspaceId) {
    params.set("workspaceId", selectedWorkspaceId);
  }

  return {
    workspaceId: selectedWorkspaceId,
    queryString: params.toString(),
    appendToUrl: (base: string) => {
      const url = new URL(base, "http://local");
      if (selectedWorkspaceId) url.searchParams.set("workspaceId", selectedWorkspaceId);
      return `${url.pathname}${url.search}`;
    },
    appendParams: (existing: URLSearchParams) => {
      if (selectedWorkspaceId) existing.set("workspaceId", selectedWorkspaceId);
      return existing;
    },
  };
}
