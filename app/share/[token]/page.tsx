"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { getPriorityColor, getStatusColor, formatDueDate, cn } from "@/lib/utils";

interface SharedTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
}

export default function SharePage() {
  const params = useParams();
  const token = params.token as string;
  const [data, setData] = useState<{ category: { name: string; color: string }; tasks: SharedTask[] } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/share/${token}`).then(async (res) => {
      const json = await res.json();
      if (res.ok) setData(json);
      else setError(json.error);
    });
  }, [token]);

  if (error) return <div className="flex flex-1 items-center justify-center p-8 text-zinc-500">{error}</div>;
  if (!data) return <div className="flex flex-1 items-center justify-center p-8">Loading...</div>;

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <div className="mb-6 flex items-center gap-3">
        <span className="h-4 w-4 rounded-full" style={{ background: data.category.color }} />
        <h1 className="text-2xl font-bold">{data.category.name}</h1>
        <span className="text-sm text-zinc-400">Shared list</span>
      </div>
      <div className="space-y-2">
        {data.tasks.map((task) => (
          <Card key={task.id} className="p-4">
            <div className="flex items-center gap-2">
              <span className="font-medium">{task.title}</span>
              <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase", getPriorityColor(task.priority))}>{task.priority}</span>
              <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase", getStatusColor(task.status))}>{task.status}</span>
            </div>
            {task.dueDate && <p className="mt-1 text-xs text-zinc-400">{formatDueDate(task.dueDate)}</p>}
          </Card>
        ))}
      </div>
    </div>
  );
}
