"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type ConnectedApp = {
  clientId: string;
  name: string;
  connectedAt: string;
  lastActiveAt: string;
};

function fmt(d: string) {
  return new Date(d).toLocaleString();
}

export function ConnectedAppsCard() {
  const [apps, setApps] = useState<ConnectedApp[] | null>(null);

  const load = useCallback(() => {
    fetch("/api/user/oauth-apps")
      .then((r) => r.json())
      .then((d) => setApps(Array.isArray(d.apps) ? d.apps : []))
      .catch(() => setApps([]));
  }, []);

  useEffect(load, [load]);

  const disconnect = async (app: ConnectedApp) => {
    if (
      !confirm(
        `Disconnect ${app.name}? It will lose access until you authorize it again.`,
      )
    )
      return;
    const res = await fetch(
      `/api/user/oauth-apps/${encodeURIComponent(app.clientId)}`,
      { method: "DELETE" },
    );
    if (res.ok) {
      toast.success(`${app.name} disconnected`);
      load();
    } else toast.error("Could not disconnect app");
  };

  return (
    <section data-testid="connected-apps-card">
      <Card className="mb-6 p-6">
        <h2 className="section-label mb-2">Connected apps</h2>
        <p className="mb-4 text-sm text-[var(--muted)]">
          Apps you authorized with OAuth (for example a Claude connector). They
          act as you until disconnected.
        </p>
        {apps === null ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : apps.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No connected apps.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)] text-sm">
            {apps.map((a) => (
              <li
                key={a.clientId}
                className="flex items-center justify-between gap-3 py-2"
                data-testid="connected-app"
              >
                <div>
                  <p className="font-medium">{a.name}</p>
                  <p className="text-xs text-[var(--muted)]">
                    Connected {fmt(a.connectedAt)} · Last token{" "}
                    {fmt(a.lastActiveAt)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => disconnect(a)}
                >
                  Disconnect
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
