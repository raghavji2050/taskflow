"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Send, Trash2, Webhook } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { WEBHOOK_EVENTS } from "@/lib/webhook-events";

type Hook = { id: string; url: string; events: string[]; active: boolean; failureCount: number; lastStatus: number | null; lastDeliveryAt: string | null; disabledReason: string | null; secretHint: string };

/** Workspace webhooks (owners/admins). Uses the public REST API with the browser session. */
export function WebhooksCard({ workspaceId }: { workspaceId: string }) {
  const base = `/api/v1/workspaces/${workspaceId}/webhooks`;
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>([...WEBHOOK_EVENTS]);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(base);
    if (res.ok) setHooks((await res.json()).webhooks);
  }, [base]);
  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    setBusy(true);
    const res = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url.trim(), events }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return toast.error(data.error?.message ?? "Could not add webhook");
    setSecret(data.secret);
    setUrl("");
    void load();
  };
  const test = async (id: string) => {
    const res = await fetch(`${base}/${id}/test`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) toast.success(`Ping delivered (HTTP ${data.status})`);
    else toast.error(`Ping failed: ${typeof data.error === "string" ? data.error : data.error?.message ?? "unknown error"}`);
    void load();
  };
  const remove = async (id: string) => {
    if (!confirm("Remove this webhook?")) return;
    await fetch(`${base}/${id}`, { method: "DELETE" });
    void load();
  };
  const toggle = async (h: Hook) => {
    await fetch(`${base}/${h.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !h.active }) });
    void load();
  };

  return (
    <section className="mt-4 rounded-lg border border-[var(--border)] p-3" aria-label="Webhooks" data-testid="webhooks">
      <p className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        <Webhook className="h-3 w-3" aria-hidden="true" /> Webhooks
      </p>
      <p className="mb-2 text-xs text-[var(--muted)]">TaskFlow POSTs signed JSON to your URL when tasks in this workspace change (Zapier, Make, Slack bots, your server). See the REST API docs for the signature format.</p>
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void add(); }}>
        <div className="min-w-0 flex-1">
          <Input id="webhook-url" label="Webhook URL" hideLabel aria-label="Webhook URL" placeholder="https://example.com/taskflow-hook" value={url} onChange={(e) => setUrl(e.target.value)} className="h-9 text-sm" />
        </div>
        <Button type="submit" size="sm" className="h-9" isLoading={busy} disabled={!url.trim() || events.length === 0}>Add webhook</Button>
      </form>
      <fieldset className="mt-2 flex flex-wrap gap-3 text-xs">
        <legend className="sr-only">Events</legend>
        {WEBHOOK_EVENTS.map((e) => (
          <label key={e} className="inline-flex items-center gap-1">
            <input type="checkbox" checked={events.includes(e)} onChange={(ev) => setEvents(ev.target.checked ? [...events, e] : events.filter((x) => x !== e))} />
            {e}
          </label>
        ))}
      </fieldset>
      {secret && (
        <div className="mt-2 rounded-md bg-[var(--surface-hover)] p-2 text-xs" data-testid="webhook-secret">
          <p className="font-medium">Signing secret (shown once — store it now):</p>
          <div className="mt-1 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate">{secret}</code>
            <button type="button" aria-label="Copy signing secret" className="rounded p-1 hover:bg-[var(--surface-1)]" onClick={() => { void navigator.clipboard?.writeText(secret); toast.success("Copied"); }}>
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
      {hooks.length > 0 && (
        <ul className="mt-3 space-y-2" aria-label="Webhook endpoints">
          {hooks.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--border)] p-2 text-xs">
              <span className={`h-2 w-2 shrink-0 rounded-full ${h.active ? (h.failureCount ? "bg-amber-500" : "bg-emerald-600") : "bg-zinc-400"}`} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-[var(--foreground)]">{h.url}</span>
                <span className="block text-[var(--muted)]">
                  {h.events.join(", ")} · {h.active ? "on" : "off"}{h.lastStatus ? ` · last HTTP ${h.lastStatus}` : ""}{h.failureCount ? ` · ${h.failureCount} failed` : ""}{h.disabledReason ? ` · ${h.disabledReason}` : ""}
                </span>
              </span>
              <button type="button" onClick={() => void toggle(h)} className="rounded px-2 py-1 hover:bg-[var(--surface-hover)]">{h.active ? "Pause" : "Resume"}</button>
              <button type="button" onClick={() => void test(h.id)} aria-label={`Send test ping to ${h.url}`} className="rounded p-1 hover:bg-[var(--surface-hover)]"><Send className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => void remove(h.id)} aria-label={`Remove webhook ${h.url}`} className="rounded p-1 text-red-700 hover:bg-[var(--surface-hover)] dark:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
