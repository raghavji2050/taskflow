"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { TaskViewFiltersState } from "@/lib/task-view-filters";

interface TaskViewFiltersProps {
  filters: TaskViewFiltersState;
  onChange: (filters: TaskViewFiltersState) => void;
  taskCount: number;
  showAssigneeFilter?: boolean;
}

const selectClass = "h-8 min-w-[7.5rem] text-xs";

export function TaskViewFilters({
  filters,
  onChange,
  taskCount,
  showAssigneeFilter = false,
}: TaskViewFiltersProps) {
  const update = (partial: Partial<TaskViewFiltersState>) => {
    onChange({ ...filters, ...partial });
  };

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-hover)] p-3">
      <span className="text-xs font-medium text-[var(--muted)]">
        {taskCount} {taskCount === 1 ? "task" : "tasks"}
      </span>
      <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
        <div className="relative w-full sm:w-44">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted)]" />
          <Input
            hideLabel
            placeholder="Search tasks..."
            className="h-8 pl-8 text-xs"
            value={filters.search}
            onChange={(e) => update({ search: e.target.value })}
          />
        </div>
        <Select
          hideLabel
          className={selectClass}
          value={filters.status}
          onChange={(e) => update({ status: e.target.value as TaskViewFiltersState["status"] })}
          options={[
            { value: "ALL", label: "All statuses" },
            { value: "PENDING", label: "Pending" },
            { value: "IN_PROGRESS", label: "In Progress" },
            { value: "COMPLETED", label: "Completed" },
          ]}
        />
        {showAssigneeFilter && (
          <Select
            hideLabel
            className={selectClass}
            value={filters.assignee}
            onChange={(e) => update({ assignee: e.target.value as TaskViewFiltersState["assignee"] })}
            options={[
              { value: "all", label: "All assignees" },
              { value: "me", label: "Assigned to me" },
              { value: "unassigned", label: "Unassigned" },
            ]}
          />
        )}
      </div>
    </div>
  );
}
