"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, History, ShieldCheck } from "lucide-react";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { AUDIT_CATEGORIES, AUDIT_RETENTION_DAYS, auditActionLabel } from "@/lib/audit-labels";
import { formatRelativeDate } from "@/lib/utils";

interface Entry {
  id: string;
  action: string;
  targetType: string;
  targetLabel: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
  actor: { id: string; name: string; email: string } | null;
}

function detailText(e: Entry) {
  const d = e.details;
  if (!d) return null;
  if (typeof d.filename === "string") return d.filename;
  if (d.from && d.to) return `${String(d.from).toLowerCase()} → ${String(d.to).toLowerCase()}`;
  if (typeof d.role === "string") return String(d.role).toLowerCase();
  if (Array.isArray(d.changed)) return `changed ${d.changed.join(", ")}`;
  if (typeof d.allowMemberInvites === "boolean") return d.allowMemberInvites ? "members can invite" : "only admins invite";
  return null;
}

export function AuditLogClient() {
  const { selectedWorkspaceId, isPersonal, members, canManageWorkspace } = useWorkspace();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [scope, setScope] = useState<string>("account");
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [actorId, setActorId] = useState("");
  const [loading, setLoading] = useState(false);

  const query = useCallback(
    (extra: Record<string, string> = {}) => {
      const p = new URLSearchParams();
      if (!isPersonal && selectedWorkspaceId) p.set("workspaceId", selectedWorkspaceId);
      if (category) p.set("category", category);
      if (actorId) p.set("actorId", actorId);
      for (const [k, v] of Object.entries(extra)) p.set(k, v);
      return p.toString();
    },
    [isPersonal, selectedWorkspaceId, category, actorId]
  );

  const load = useCallback(
    async (before?: string) => {
      setLoading(true);
      const res = await fetch(`/api/audit?${query(before ? { before } : {})}`);
      setLoading(false);
      if (!res.ok) return;
      const data = await res.json();
      setScope(data.scope);
      setNextBefore(data.nextBefore);
      setEntries((prev) => (before ? [...prev, ...data.entries] : data.entries));
    },
    [query]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const subtitle =
    scope === "workspace"
      ? `Everything that changed in this workspace. Kept for ${AUDIT_RETENTION_DAYS} days.`
      : scope === "mine"
        ? "Your own actions in this workspace. Owners and admins see everyone's."
        : "Security events on your account: tokens, sign-outs and password changes.";

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <PageHeader
        title="Activity log"
        subtitle={subtitle}
        actions={
          <a href={`/api/audit?${query({ format: "csv" })}`} download>
            <Button variant="secondary">
              <Download className="mr-1 h-4 w-4" /> Export CSV
            </Button>
          </a>
        }
      />
      <div className="flex flex-wrap gap-2">
        <div className="w-full sm:w-56">
          <Select
            id="audit-category"
            label="Type"
            hideLabel
            aria-label="Filter by type"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={[{ value: "", label: "All activity" }, ...Object.entries(AUDIT_CATEGORIES).map(([value, c]) => ({ value, label: c.label }))]}
          />
        </div>
        {scope === "workspace" && canManageWorkspace && (
          <div className="w-full sm:w-56">
            <Select
              id="audit-actor"
              label="Member"
              hideLabel
              aria-label="Filter by member"
              value={actorId}
              onChange={(e) => setActorId(e.target.value)}
              options={[{ value: "", label: "All members" }, ...members.map((m) => ({ value: m.user.id, label: m.user.name }))]}
            />
          </div>
        )}
      </div>
      <Card className="overflow-hidden p-0">
        {entries.length === 0 ? (
          <div className="p-8 text-center">
            {scope === "account" ? <ShieldCheck className="mx-auto mb-3 h-9 w-9 text-indigo-500" /> : <History className="mx-auto mb-3 h-9 w-9 text-indigo-500" />}
            <p className="text-sm text-[var(--muted)]">{loading ? "Loading…" : "Nothing recorded yet."}</p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--card-border)]" aria-label="Activity entries">
            {entries.map((e) => {
              const detail = detailText(e);
              return (
                <li key={e.id} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-4" data-testid="audit-entry">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-[var(--foreground)]">
                      <span className="font-medium">{e.actor?.name ?? "Someone"}</span>{" "}
                      <span className="text-[var(--muted)]">{auditActionLabel(e.action).toLowerCase()}</span>{" "}
                      {e.targetLabel && <span className="font-medium">{e.targetLabel}</span>}
                    </p>
                    {detail && <p className="truncate text-xs text-[var(--muted)]">{detail}</p>}
                  </div>
                  <div className="flex shrink-0 gap-3 text-xs text-[var(--muted)]">
                    {e.ip && <span className="tabular-nums">{e.ip}</span>}
                    <time dateTime={e.createdAt} title={new Date(e.createdAt).toLocaleString()}>
                      {formatRelativeDate(e.createdAt)}
                    </time>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {nextBefore && (
        <div className="text-center">
          <Button variant="secondary" onClick={() => void load(nextBefore)} disabled={loading}>
            Load older
          </Button>
        </div>
      )}
    </div>
  );
}
