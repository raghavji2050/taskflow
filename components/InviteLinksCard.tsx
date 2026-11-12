"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Link2, ShieldQuestion, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { INVITE_ROLES, ROLE_HELP } from "@/lib/invite-link-rules";
import { formatRelativeDate } from "@/lib/utils";

interface LinkRow {
  id: string;
  role: string;
  email: string | null;
  maxUses: number | null;
  uses: number;
  expiresAt: string;
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Link copied");
  } catch {
    window.prompt("Copy this link", text);
  }
}

export function InviteLinksCard({ workspaceId, canGrantAdmin }: { workspaceId: string; canGrantAdmin: boolean }) {
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [role, setRole] = useState("MEMBER");
  const [days, setDays] = useState("7");
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/workspaces/${workspaceId}/invite-links`);
    if (res.ok) setLinks((await res.json()).links ?? []);
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setBusy(true);
    const res = await fetch(`/api/workspaces/${workspaceId}/invite-links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, expiresInDays: Number(days) }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      toast.error(data.error ?? "Could not create link");
      return;
    }
    setLastUrl(data.url);
    void copy(data.url);
    await load();
  };

  const revoke = async (id: string) => {
    const res = await fetch(`/api/workspaces/${workspaceId}/invite-links/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Invite link turned off");
      await load();
    }
  };

  const roles = INVITE_ROLES.filter((r) => canGrantAdmin || r !== "ADMIN");

  return (
    <section className="mt-4 rounded-lg border border-[var(--border)] p-3" aria-label="Invite links" data-testid="invite-links">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        <Link2 className="h-3 w-3" /> Invite link
      </p>
      <p className="mb-2 text-xs text-[var(--muted-foreground)]">Share in WhatsApp, Slack or email. Anyone with the link can sign up free and join.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="sm:w-36">
          <Select id="invite-link-role" label="Role" hideLabel aria-label="Invite link role" value={role} onChange={(e) => setRole(e.target.value)} options={roles.map((r) => ({ value: r, label: `As ${ROLE_HELP[r].label}` }))} className="h-9 text-sm" />
        </div>
        <div className="sm:w-36">
          <Select id="invite-link-days" label="Expires" hideLabel aria-label="Invite link expiry" value={days} onChange={(e) => setDays(e.target.value)} options={[{ value: "1", label: "1 day" }, { value: "7", label: "7 days" }, { value: "30", label: "30 days" }]} className="h-9 text-sm" />
        </div>
        <Button size="sm" onClick={() => void create()} isLoading={busy} className="h-9">
          Create link
        </Button>
      </div>
      {lastUrl && (
        <div className="mt-2 flex items-center gap-2 rounded bg-[var(--surface-3)] px-2 py-1.5">
          <code className="min-w-0 flex-1 truncate text-xs" data-testid="invite-link-url">{lastUrl}</code>
          <button type="button" onClick={() => void copy(lastUrl)} aria-label="Copy invite link" className="rounded p-1 hover:bg-[var(--surface-hover)]">
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {links.length > 0 && (
        <ul className="mt-2 space-y-1" aria-label="Active invite links">
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-2 text-xs text-[var(--muted)]">
              <span className="min-w-0 flex-1 truncate">
                {l.email ? `Email invite · ${l.email}` : "Link"} · {ROLE_HELP[l.role as keyof typeof ROLE_HELP]?.label ?? l.role} · used {l.uses}
                {l.maxUses ? `/${l.maxUses}` : ""} · expires {formatRelativeDate(l.expiresAt)}
              </span>
              <button type="button" onClick={() => void revoke(l.id)} aria-label={`Turn off ${l.email ?? "invite link"}`} className="rounded p-1 hover:text-red-500">
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <details className="mt-3 text-xs text-[var(--muted)]">
        <summary className="flex cursor-pointer items-center gap-1.5 font-medium">
          <ShieldQuestion className="h-3 w-3" /> What can each role do?
        </summary>
        <dl className="mt-2 space-y-1.5">
          {(["OWNER", ...INVITE_ROLES] as const).map((r) => (
            <div key={r}>
              <dt className="inline font-semibold text-[var(--foreground)]">{ROLE_HELP[r].label}: </dt>
              <dd className="inline">{ROLE_HELP[r].can}</dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}
