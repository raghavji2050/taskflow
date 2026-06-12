"use client";

import { useRef } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

export interface TaskFiltersState {
  search: string;
  status: "ALL" | "PENDING" | "IN_PROGRESS" | "COMPLETED";
  priority: "ALL" | "LOW" | "MEDIUM" | "HIGH";
  sort: "dueDate" | "createdAt" | "priority" | "position";
  order: "asc" | "desc";
  archived: "false" | "true" | "all";
  categoryId: string;
}

interface TaskFiltersProps {
  filters: TaskFiltersState;
  onChange: (filters: TaskFiltersState) => void;
  taskCount: number;
  searchRef?: React.RefObject<HTMLInputElement | null>;
}

const filterSelectClass = "h-8 min-w-[7.5rem] text-xs";

export function TaskFilters({ filters, onChange, taskCount, searchRef }: TaskFiltersProps) {
  const internalRef = useRef<HTMLInputElement>(null);
  const ref = searchRef ?? internalRef;

  const update = (partial: Partial<TaskFiltersState>) => {
    onChange({ ...filters, ...partial });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {taskCount} {taskCount === 1 ? "task" : "tasks"}
        </span>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full sm:w-48 sm:shrink-0">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <Input
            ref={ref}
            hideLabel
            placeholder="Search... (/)"
            className="h-8 pl-8 text-xs"
            value={filters.search}
            onChange={(e) => update({ search: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <Select
            hideLabel
            className={filterSelectClass}
            value={filters.archived}
            onChange={(e) => update({ archived: e.target.value as TaskFiltersState["archived"] })}
            options={[
              { value: "false", label: "Active" },
              { value: "true", label: "Archived" },
              { value: "all", label: "All" },
            ]}
          />

          <Select
            hideLabel
            className={filterSelectClass}
            value={filters.status}
            onChange={(e) => update({ status: e.target.value as TaskFiltersState["status"] })}
            options={[
              { value: "ALL", label: "All statuses" },
              { value: "PENDING", label: "Pending" },
              { value: "IN_PROGRESS", label: "In Progress" },
              { value: "COMPLETED", label: "Completed" },
            ]}
          />

          <Select
            hideLabel
            className={filterSelectClass}
            value={filters.priority}
            onChange={(e) => update({ priority: e.target.value as TaskFiltersState["priority"] })}
            options={[
              { value: "ALL", label: "All priorities" },
              { value: "HIGH", label: "High" },
              { value: "MEDIUM", label: "Medium" },
              { value: "LOW", label: "Low" },
            ]}
          />

          <Select
            hideLabel
            className={`${filterSelectClass} col-span-2 sm:col-span-1 sm:min-w-[8.5rem]`}
            value={`${filters.sort}-${filters.order}`}
            onChange={(e) => {
              const [sort, order] = e.target.value.split("-") as [
                TaskFiltersState["sort"],
                TaskFiltersState["order"],
              ];
              update({ sort, order });
            }}
            options={[
              { value: "dueDate-asc", label: "Due date ↑" },
              { value: "dueDate-desc", label: "Due date ↓" },
              { value: "createdAt-desc", label: "Newest first" },
              { value: "priority-desc", label: "Priority" },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
