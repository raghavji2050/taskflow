"use client";

import { useState } from "react";
import { toast } from "sonner";
import { WORKSPACE_STORAGE_KEY } from "@/components/WorkspaceProvider";

export function JoinInviteButton({ token, workspaceName }: { token: string; workspaceName: string }) {
  const [busy, setBusy] = useState(false);
  const join = async () => {
    setBusy(true);
    const res = await fetch(`/api/join/${token}`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      toast.error(data.error ?? "Could not join");
      return;
    }
    try {
      localStorage.setItem(WORKSPACE_STORAGE_KEY, data.workspaceId);
    } catch {
      /* ignore */
    }
    toast.success(data.alreadyMember ? `You're already in ${workspaceName}` : `Welcome to ${workspaceName}!`);
    window.location.href = "/dashboard";
  };
  return (
    <button
      type="button"
      onClick={() => void join()}
      disabled={busy}
      className="w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
    >
      {busy ? "Joining…" : `Join ${workspaceName}`}
    </button>
  );
}
