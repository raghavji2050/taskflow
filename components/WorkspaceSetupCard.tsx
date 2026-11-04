"use client";

import { useState } from "react";
import { ArrowRight, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

/**
 * Shown where a page needs a workspace but the user is in Personal mode.
 * Instead of a dead end it lets them jump into an existing workspace or create one right here.
 */
export function WorkspaceSetupCard({ reason }: { reason: string }) {
  const { activeWorkspaces, selectWorkspace, createWorkspace } = useWorkspace();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    const res = await createWorkspace(trimmed);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error ?? "Could not create workspace");
      return;
    }
    setName("");
    toast.success(`Workspace “${trimmed}” created`);
  };

  return (
    <div data-testid="workspace-setup" className="mx-auto max-w-lg rounded-2xl border border-[var(--card-border)] bg-[var(--surface-1)] p-5 sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <Users className="h-5 w-5" />
        </div>
        <div>
          <p className="text-base font-semibold text-[var(--foreground)]">You&apos;re in Personal</p>
          <p className="mt-0.5 text-sm text-[var(--muted)]">{reason}</p>
        </div>
      </div>

      {activeWorkspaces.length > 0 && (
        <div className="mb-4 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Open a workspace</p>
          {activeWorkspaces.map((ws) => (
            <button
              key={ws.id}
              type="button"
              onClick={() => selectWorkspace(ws.id)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--border)] px-3 py-3 text-left text-sm font-medium text-[var(--foreground)] hover:border-[var(--accent)] hover:bg-[var(--surface-hover)]"
            >
              <span className="truncate">{ws.name}</span>
              <ArrowRight className="h-4 w-4 shrink-0 text-[var(--muted)]" />
            </button>
          ))}
        </div>
      )}

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          {activeWorkspaces.length > 0 ? "Or create a new one" : "Create your first workspace"}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            hideLabel
            label="Workspace name"
            name="workspaceName"
            aria-label="Workspace name"
            placeholder="e.g. Acme Team"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
          />
          <Button type="submit" disabled={!name.trim() || saving} className="shrink-0">
            <Plus className="h-4 w-4" />
            Create workspace
          </Button>
        </div>
      </form>
    </div>
  );
}
