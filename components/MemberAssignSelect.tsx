"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface Member {
  id: string;
  name: string;
}

interface MemberAssignSelectProps {
  members: Member[];
  selectedIds: string[];
  primaryId: string | null;
  onChange: (ids: string[], primaryId: string | null) => void;
}

export function MemberAssignSelect({
  members,
  selectedIds,
  primaryId,
  onChange,
}: MemberAssignSelectProps) {
  const toggle = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    let nextPrimary = primaryId;
    if (!next.includes(primaryId ?? "")) {
      nextPrimary = next[0] ?? null;
    }
    if (next.length === 1) nextPrimary = next[0];
    onChange(next, nextPrimary);
  };

  const setPrimary = (id: string) => {
    if (!selectedIds.includes(id)) {
      onChange([...selectedIds, id], id);
    } else {
      onChange(selectedIds, id);
    }
  };

  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
        Responsible members
      </p>
      <div className="flex flex-wrap gap-1.5">
        {members.map((m) => {
          const selected = selectedIds.includes(m.id);
          const isLead = primaryId === m.id;
          return (
            <div key={m.id} className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => toggle(m.id)}
                className={cn(
                  "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                  selected
                    ? "border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                    : "border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                )}
              >
                {m.name}
              </button>
              {selected && (
                <button
                  type="button"
                  onClick={() => setPrimary(m.id)}
                  className={cn(
                    "rounded p-1",
                    isLead ? "text-amber-500" : "text-zinc-300 hover:text-amber-400"
                  )}
                  title="Set as lead"
                >
                  <Star className={cn("h-3.5 w-3.5", isLead && "fill-current")} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {selectedIds.length > 0 && (
        <p className="mt-1.5 text-[11px] text-zinc-400">
          Star marks the lead responsible person
        </p>
      )}
    </div>
  );
}
