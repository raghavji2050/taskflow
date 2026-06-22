"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { Card } from "@/components/ui/Card";

interface WorkloadEntry {
  member: { id: string; name: string };
  role: string;
  taskCount: number;
}

export function WorkloadPanel({ workspaceId }: { workspaceId: string }) {
  const [workload, setWorkload] = useState<WorkloadEntry[]>([]);
  const [unassigned, setUnassigned] = useState(0);

  const load = useCallback(async () => {
    const res = await fetch(`/api/workspaces/${workspaceId}/workload`);
    if (res.ok) {
      const data = await res.json();
      setWorkload(data.workload ?? []);
      setUnassigned(data.unassigned ?? 0);
    }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const max = Math.max(...workload.map((w) => w.taskCount), 1);

  return (
    <Card className="p-4">
      <p className="mb-3 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        <BarChart3 className="h-3 w-3" /> Team workload
      </p>
      <div className="space-y-2">
        {workload.map((w) => (
          <div key={w.member.id}>
            <div className="mb-0.5 flex justify-between text-xs">
              <span>{w.member.name}</span>
              <span className="text-[var(--muted-foreground)]">{w.taskCount} tasks</span>
            </div>
            <div className="h-2 rounded-full bg-[var(--surface-3)]">
              <div
                className="h-2 rounded-full bg-[var(--accent)]"
                style={{ width: `${(w.taskCount / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      {unassigned > 0 && (
        <p className="mt-2 text-xs text-amber-600">{unassigned} unassigned tasks</p>
      )}
    </Card>
  );
}
