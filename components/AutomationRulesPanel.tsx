"use client";

import { useCallback, useEffect, useState } from "react";
import { Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";

interface Rule {
  id: string;
  name: string;
  trigger: string;
  action: string;
  enabled: boolean;
}

export function AutomationRulesPanel({ workspaceId }: { workspaceId: string }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("task_overdue");
  const [action, setAction] = useState("notify_assignees");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/workspaces/${workspaceId}/automations`);
    if (res.ok) {
      const data = await res.json();
      setRules(data.rules ?? []);
    }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const addRule = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/workspaces/${workspaceId}/automations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, trigger, action, config: { message: `Rule: ${name}` } }),
    });
    if (res.ok) {
      toast.success("Automation created");
      setName("");
      await load();
    } else {
      toast.error("Could not create rule");
    }
    setSaving(false);
  };

  const toggleRule = async (ruleId: string, enabled: boolean) => {
    await fetch(`/api/workspaces/${workspaceId}/automations/${ruleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    await load();
  };

  const deleteRule = async (ruleId: string) => {
    await fetch(`/api/workspaces/${workspaceId}/automations/${ruleId}`, { method: "DELETE" });
    await load();
  };

  return (
    <Card className="p-4">
      <p className="mb-3 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        <Zap className="h-3 w-3" /> Automations
      </p>
      <div className="mb-3 space-y-2">
        {rules.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-zinc-100 px-2.5 py-2 text-xs dark:bg-zinc-800">
            <div>
              <span className="font-medium">{r.name}</span>
              <span className="ml-1 text-zinc-400">· {r.trigger} → {r.action}</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={(e) => void toggleRule(r.id, e.target.checked)}
              />
              <Button variant="ghost" size="sm" className="h-6 text-[10px] text-red-500" onClick={() => void deleteRule(r.id)}>
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Input hideLabel placeholder="Rule name" value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-xs" />
        <Select hideLabel className="h-8 text-xs" value={trigger} onChange={(e) => setTrigger(e.target.value)} options={[
          { value: "task_overdue", label: "Task overdue" },
          { value: "task_assigned", label: "Task assigned" },
          { value: "status_changed", label: "Status changed" },
        ]} />
        <Select hideLabel className="h-8 text-xs" value={action} onChange={(e) => setAction(e.target.value)} options={[
          { value: "notify_assignees", label: "Notify assignees" },
          { value: "notify_user", label: "Notify user" },
        ]} />
        <Button size="sm" className="h-8" onClick={() => void addRule()} isLoading={saving}>Add</Button>
      </div>
    </Card>
  );
}
