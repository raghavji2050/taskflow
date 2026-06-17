"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { DashboardStats, CompletionRing, type DashboardStatsData } from "@/components/DashboardStats";
import { StatsBreakdown } from "@/components/StatsBreakdown";
import { TaskCard, type Task } from "@/components/TaskCard";
import { TaskFilters, type TaskFiltersState } from "@/components/TaskFilters";
import { DeleteConfirmModal } from "@/components/DeleteConfirmModal";
import { RecentTasks } from "@/components/RecentTasks";
import { DailyUpdateCard } from "@/components/DailyUpdateCard";
import type { DailyUpdateGroup } from "@/lib/daily-update-format";
import { Pagination } from "@/components/Pagination";
import { CategorySidebar } from "@/components/CategorySidebar";
import { BoardListsPanel } from "@/components/BoardListsPanel";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TaskEditModal } from "@/components/TaskEditModal";
import type { TaskInput } from "@/lib/validations";
import { PageHeader } from "@/components/PageHeader";
import { cn, getTimeGreeting } from "@/lib/utils";
import { toTaskInput } from "@/lib/task-ui";
import { format } from "date-fns";
import { useRealtimeSync } from "@/lib/useRealtimeSync";

const defaultFilters: TaskFiltersState = {
  search: "", status: "ALL", priority: "ALL", sort: "dueDate", order: "asc",
  archived: "false", categoryId: "", assignee: "all",
};

const defaultStats: DashboardStatsData = {
  total: 0, completed: 0, pending: 0, highPriority: 0, completionPercentage: 0,
};

interface DashboardClientProps { userName: string; }

export function DashboardClient({ userName }: DashboardClientProps) {
  const { data: session } = useSession();
  const { selectedWorkspaceId, selectedWorkspace, isPersonal, members, canEditTasks } = useWorkspace();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<DashboardStatsData>(defaultStats);
  const [recentTasks, setRecentTasks] = useState<Task[]>([]);
  const [dailyUpdates, setDailyUpdates] = useState<DailyUpdateGroup[]>([]);
  const [filters, setFilters] = useState<TaskFiltersState>(defaultFilters);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [categoryRefreshKey, setCategoryRefreshKey] = useState(0);
  const [boardListsKey, setBoardListsKey] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const fetchTasks = useCallback(async (
    currentFilters: TaskFiltersState,
    currentPage: number,
    catId: string | null,
    wsId: string | null,
    silent = false
  ) => {
    if (!silent) setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (currentFilters.search) params.set("search", currentFilters.search);
      if (currentFilters.status !== "ALL") params.set("status", currentFilters.status);
      if (currentFilters.priority !== "ALL") params.set("priority", currentFilters.priority);
      params.set("sort", currentFilters.sort);
      params.set("order", currentFilters.order);
      params.set("archived", currentFilters.archived);
      params.set("page", String(currentPage));
      params.set("limit", "10");
      if (catId) params.set("categoryId", catId);
      if (wsId) {
        params.set("workspaceId", wsId);
        if (currentFilters.assignee !== "all") params.set("assignee", currentFilters.assignee);
      }

      const response = await fetch(`/api/tasks?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to fetch tasks");

      setTasks(data.tasks);
      setStats(data.stats);
      setRecentTasks(data.stats.recentTasks);
      setDailyUpdates(data.stats.dailyUpdates ?? []);
      setTotalPages(data.pagination?.totalPages ?? 1);
      if (!wsId) setCategoryRefreshKey((k) => k + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load tasks");
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  const refreshTasks = useCallback(() => {
    fetchTasks(filters, page, categoryId, selectedWorkspaceId, true);
  }, [fetchTasks, filters, page, categoryId, selectedWorkspaceId]);

  useRealtimeSync({
    workspaceId: selectedWorkspaceId,
    onRefresh: refreshTasks,
  });

  useEffect(() => {
    setPage(1);
    setCategoryId(null);
    setSelectedIds(new Set());
    setBulkMode(false);
  }, [selectedWorkspaceId]);

  useEffect(() => {
    const timeout = setTimeout(() => fetchTasks(filters, page, categoryId, selectedWorkspaceId), 300);
    return () => clearTimeout(timeout);
  }, [filters, page, categoryId, selectedWorkspaceId, fetchTasks]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === "Escape") { setIsFormOpen(false); setEditingTask(null); }
        return;
      }
      if (canEditTasks && (e.key === "n" || e.key === "N")) { setEditingTask(null); setIsFormOpen(true); }
      if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "Escape") { setIsFormOpen(false); setEditingTask(null); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const withWorkspace = (formData: TaskInput): TaskInput => ({
    ...formData,
    workspaceId: selectedWorkspaceId,
  });

  const handleCreateOrUpdate = async (formData: TaskInput) => {
    setIsSubmitting(true);
    try {
      const payload = withWorkspace(formData);
      const url = editingTask ? `/api/tasks/${editingTask.id}` : "/api/tasks";
      const response = await fetch(url, {
        method: editingTask ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to save task");
      toast.success(editingTask ? "Task updated" : "Task created");
      setIsFormOpen(false); setEditingTask(null);
      await fetchTasks(filters, page, categoryId, selectedWorkspaceId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save task");
    } finally { setIsSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!deletingTask) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/tasks/${deletingTask.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error((await response.json()).error);
      toast.success("Task deleted");
      setDeletingTask(null);
      await fetchTasks(filters, page, categoryId, selectedWorkspaceId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete");
    } finally { setIsDeleting(false); }
  };

  const handleArchive = async (task: Task) => {
    const response = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: !task.archived }),
    });
    if (response.ok) {
      toast.success(task.archived ? "Task restored" : "Task archived");
      await fetchTasks(filters, page, categoryId, selectedWorkspaceId);
    }
  };

  const handleToggleStatus = async (task: Task) => {
    const nextStatus =
      task.status === "PENDING" ? "IN_PROGRESS" : task.status === "IN_PROGRESS" ? "COMPLETED" : "PENDING";
    setUpdatingTaskId(task.id);
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withWorkspace(toTaskInput(task, { status: nextStatus }))),
      });
      if (!response.ok) throw new Error((await response.json()).error);
      await fetchTasks(filters, page, categoryId, selectedWorkspaceId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update");
    } finally { setUpdatingTaskId(null); }
  };

  const handleBulk = async (action: "complete" | "archive" | "delete" | "pending") => {
    const response = await fetch("/api/tasks/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskIds: Array.from(selectedIds), action }),
    });
    if (response.ok) {
      toast.success(`Bulk ${action} done`);
      setSelectedIds(new Set());
      setBulkMode(false);
      await fetchTasks(filters, page, categoryId, selectedWorkspaceId);
    }
  };

  const openEdit = (task: Task) => { setEditingTask(task); setIsFormOpen(true); };

  const openTaskById = async (taskId: string) => {
    const cached = tasks.find((t) => t.id === taskId) ?? recentTasks.find((t) => t.id === taskId);
    if (cached) {
      openEdit(cached);
      return;
    }
    try {
      const response = await fetch(`/api/tasks/${taskId}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load task");
      openEdit(data.task);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to open task");
    }
  };
  const displayName = session?.user?.name ?? userName;
  const firstName = displayName.split(" ")[0];
  const pageTitle = isPersonal ? "My Tasks" : (selectedWorkspace?.name ?? "Team");
  const pageSubtitle = isPersonal
    ? format(new Date(), "EEEE, MMMM d")
    : `${members.length} team member${members.length !== 1 ? "s" : ""} · shared workspace`;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${getTimeGreeting()}, ${firstName}`}
        title={pageTitle}
        subtitle={pageSubtitle}
        actions={
          <>
            {canEditTasks && (
              <>
                <Button variant="secondary" size="sm" onClick={() => setBulkMode(!bulkMode)}>{bulkMode ? "Cancel" : "Select"}</Button>
                <Button onClick={() => { setEditingTask(null); setIsFormOpen(true); }}>
                  <Plus className="h-4 w-4" />New Task
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="sm:col-span-2 xl:col-span-3">
          <DashboardStats stats={stats} />
        </div>
        <CompletionRing stats={stats} />
      </div>
      {stats.breakdown && stats.total > 0 && (
        <StatsBreakdown breakdown={stats.breakdown} />
      )}

      {bulkMode && selectedIds.size > 0 && (
        <div className="flex flex-wrap gap-2 rounded-xl border border-[var(--accent)]/20 bg-[var(--accent-soft)] p-3">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Button size="sm" variant="secondary" onClick={() => handleBulk("complete")}>Complete</Button>
          <Button size="sm" variant="secondary" onClick={() => handleBulk("archive")}>Archive</Button>
          <Button size="sm" variant="danger" onClick={() => handleBulk("delete")}>Delete</Button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(11rem,13rem)_1fr_minmax(14rem,16rem)]">
        <div className="hidden space-y-4 lg:block">
          {isPersonal && (
            <Card className="p-4">
              <CategorySidebar
                selectedId={categoryId}
                onSelect={(id) => { setCategoryId(id); setPage(1); }}
                refreshKey={categoryRefreshKey}
              />
            </Card>
          )}
          <BoardListsPanel
            workspaceId={selectedWorkspaceId}
            readOnly={!canEditTasks}
            variant="sidebar"
            onChange={() => setBoardListsKey((k) => k + 1)}
            key={boardListsKey}
          />
        </div>

        <Card className="overflow-hidden">
          <div className="border-b border-[var(--card-border)] px-4 py-3 sm:px-5">
            <TaskFilters
              filters={filters}
              onChange={(f) => { setFilters(f); setPage(1); }}
              taskCount={tasks.length}
              searchRef={searchRef}
              showAssigneeFilter={!isPersonal}
            />
          </div>
          <div className="p-3 sm:p-4">
            {isLoading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800/60" />
              ))}</div>
            ) : tasks.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-soft)]">
                  <Sparkles className="h-7 w-7 text-[var(--accent)]" />
                </div>
                <p className="text-base font-semibold text-[var(--foreground)]">No tasks in this workspace</p>
                <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">
                  {isPersonal
                    ? "Press N or use New Task above to get started"
                    : "Create a team task or open Team in the sidebar to invite members"}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {tasks.map((task) => (
                  <div key={task.id}>
                    <TaskCard
                      task={task}
                      onEdit={openEdit}
                      onDelete={setDeletingTask}
                      onArchive={handleArchive}
                      onToggleStatus={handleToggleStatus}
                      isUpdating={updatingTaskId === task.id}
                      bulkMode={bulkMode && canEditTasks}
                      showMeta={!isPersonal}
                      readOnly={!canEditTasks}
                      selected={selectedIds.has(task.id)}
                      onSelect={(id, sel) => setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (sel) next.add(id); else next.delete(id);
                        return next;
                      })}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </Card>

        <div className="hidden space-y-4 lg:sticky lg:top-28 lg:block lg:self-start">
          <RecentTasks tasks={recentTasks} onSelect={openEdit} showMeta={!isPersonal} />
          {isPersonal && (
            <DailyUpdateCard groups={dailyUpdates} onSelectTask={openTaskById} />
          )}
        </div>
      </div>

      <TaskEditModal
        isOpen={isFormOpen}
        onClose={() => { setIsFormOpen(false); setEditingTask(null); }}
        title={editingTask ? (canEditTasks ? "Edit Task" : "View Task") : isPersonal ? "New Personal Task" : `New Task in ${selectedWorkspace?.name}`}
        editingTask={editingTask}
        workspaceId={selectedWorkspaceId ?? undefined}
        members={!isPersonal ? members.map((m) => m.user) : undefined}
        lockWorkspace={!isPersonal}
        isPersonal={isPersonal}
        workspaceName={selectedWorkspace?.name}
        defaultCategoryId={!editingTask ? categoryId : undefined}
        readOnly={!canEditTasks}
        onSubmit={handleCreateOrUpdate}
        isSubmitting={isSubmitting}
      />

      <DeleteConfirmModal task={deletingTask} isOpen={!!deletingTask} onClose={() => setDeletingTask(null)}
        onConfirm={handleDelete} isDeleting={isDeleting} />
    </div>
  );
}
