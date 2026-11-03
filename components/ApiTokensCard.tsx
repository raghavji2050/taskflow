"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";

type ApiToken = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleString() : "Never";
}

export function ApiTokensCard() {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [name, setName] = useState("Claude");
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch("/api/user/api-tokens")
      .then((r) => r.json())
      .then((d) => d.tokens && setTokens(d.tokens))
      .catch(() => undefined);
  }, []);

  useEffect(load, [load]);

  const create = async () => {
    setBusy(true);
    const res = await fetch("/api/user/api-tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setBusy(false);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(d.error ?? "Could not create token");
    setCreated(d.token);
    load();
  };

  const revoke = async (id: string) => {
    if (!confirm("Revoke this token? Apps using it will stop working.")) return;
    const res = await fetch(`/api/user/api-tokens/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Token revoked");
      load();
    } else toast.error("Could not revoke token");
  };

  const mcpUrl = typeof window !== "undefined" ? `${window.location.origin}/api/mcp` : "/api/mcp";

  return (
    <Card className="mb-6 p-6" data-testid="api-tokens-card">
      <h2 className="section-label mb-2">API tokens (Claude / MCP)</h2>
      <p className="mb-4 text-sm text-[var(--muted)]">
        Connect Claude or another MCP client to <code>{mcpUrl}</code> with a personal token. Tokens act as you.
      </p>

      {created && (
        <div className="mb-4 rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900" data-testid="new-api-token">
          <p className="mb-2 font-medium">Copy this token now. It will not be shown again.</p>
          <code className="block break-all">{created}</code>
          <div className="mt-2 flex gap-2">
            <Button type="button" onClick={() => navigator.clipboard?.writeText(created).then(() => toast.success("Copied"))}>
              Copy
            </Button>
            <Button type="button" variant="secondary" onClick={() => setCreated(null)}>
              Done
            </Button>
          </div>
        </div>
      )}

      <div className="mb-4 flex items-end gap-2">
        <div className="flex-1">
          <Input label="Token name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button type="button" onClick={create} disabled={busy || !name.trim()}>
          Create token
        </Button>
      </div>

      {tokens.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No tokens yet.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)] text-sm">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-2">
              <div>
                <p className="font-medium">
                  {t.name} <span className="text-[var(--muted)]">{t.prefix}…</span>
                </p>
                <p className="text-xs text-[var(--muted)]">
                  Created {fmt(t.createdAt)} · Last used {fmt(t.lastUsedAt)}
                  {t.revokedAt && ` · Revoked ${fmt(t.revokedAt)}`}
                </p>
              </div>
              {!t.revokedAt && (
                <Button type="button" variant="secondary" onClick={() => revoke(t.id)}>
                  Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
