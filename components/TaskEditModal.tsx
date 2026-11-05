"use client";

import { useEffect, useRef, useState } from "react";
import { CreateTaskTimerOptions } from "@/components/tasks/CreateTaskTimerOptions";
import { FileText, MessageSquare } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { TaskForm, TASK_FORM_ID } from "@/components/TaskForm";
import { TaskDetail } from "@/components/TaskDetail";
import { useWorkspace } from "@/components/WorkspaceProvider";
import type { Task } from "@/components/TaskCard";
import type { TaskInput } from "@/lib/validations";
import type { TaskFormSubmitOptions } from "@/lib/client-task-submit";
import { cn } from "@/lib/utils";
import { saveTaskWithOptionalTimer } from "@/lib/client-task-submit";

interface Member {
  id: string;
  name: string;
  email: string;
}

interface TaskEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  editingTask: Task | null;
  workspaceId?: string;
  members?: Member[];
  lockWorkspace?: boolean;
  isPersonal?: boolean;
  workspaceName?: string;
  onSubmit: (data: TaskInput, options?: TaskFormSubmitOptions) => Promise<void>;
  isSubmitting?: boolean;
  defaultDueDate?: string;
  defaultCategoryId?: string | null;
  readOnly?: boolean;
  /** Called after an autosave so the page behind the side panel can refresh. */
  onSaved?: () => void;
}

export function TaskEditModal({
  isOpen,
  onClose,
  title,
  editingTask,
  workspaceId,
  members,
  lockWorkspace,
  isPersonal,
  workspaceName,
  onSubmit,
  isSubmitting,
  defaultDueDate,
  defaultCategoryId,
  readOnly: readOnlyProp,
  onSaved,
}: TaskEditModalProps) {
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const savedSinceOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen) {
      setSaveState("idle");
      savedSinceOpenRef.current = false;
    }
  }, [isOpen, editingTask?.id]);
  const [tab, setTab] = useState<"details" | "more">("details");
  const [startTimerAfterCreate, setStartTimerAfterCreate] = useState(false);
  const [promoteStatusOnStart, setPromoteStatusOnStart] = useState(true);
  const [taskStatus, setTaskStatus] = useState("PENDING");

  useEffect(() => {
    if (!isOpen) {
      setStartTimerAfterCreate(false);
      setPromoteStatusOnStart(true);
      setTaskStatus("PENDING");
    }
  }, [isOpen]);
  const { canEditTasks } = useWorkspace();
  const readOnly = readOnlyProp ?? !canEditTasks;
  const commentCount = editingTask?._count?.comments ?? 0;
  const attachmentCount = editingTask?._count?.attachments ?? 0;
  const collabBadgeCount = commentCount + attachmentCount;

  const handleClose = () => {
    setTab("details");
    if (savedSinceOpenRef.current) onSaved?.();
    onClose();
  };

  const isPanel = !!editingTask;
  const autoSave = async (data: TaskInput) => {
    if (!editingTask) return;
    setSaveState("saving");
    try {
      await saveTaskWithOptionalTimer({ ...data, workspaceId: editingTask.workspaceId ?? data.workspaceId }, editingTask.id);
      savedSinceOpenRef.current = true;
      setSaveState("saved");
      onSaved?.();
    } catch {
      setSaveState("error");
    }
  };

  // Editing uses the one-scroll side panel (details + subtasks + comments inline); no tabs.
  const showTabs = false;
  const modalTitle = readOnly && editingTask ? "View Task" : title;
  const onDetailsTab = !showTabs || tab === "details";

  const showCreateTimerOptions = !editingTask && !readOnly && onDetailsTab;

  const saveBadge = isPanel && !readOnly ? (
    <span
      data-testid="autosave-status"
      aria-live="polite"
      className={cn(
        "hidden text-xs sm:inline",
        saveState === "error" ? "text-red-500" : "text-[var(--muted)]"
      )}
    >
      {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Couldn’t save" : "Changes save automatically"}
    </span>
  ) : null;

  const footer = isPanel ? (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-[var(--muted)] sm:hidden" aria-hidden="true">
        {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}
      </span>
      <div className="ml-auto flex gap-3">
        {!readOnly && (
          <Button type="submit" variant="secondary" form={TASK_FORM_ID} isLoading={isSubmitting}>
            Update Task
          </Button>
        )}
        <Button type="button" onClick={handleClose}>
          {readOnly ? "Close" : "Done"}
        </Button>
      </div>
    </div>
  ) : onDetailsTab ? (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {showCreateTimerOptions ? (
        <CreateTaskTimerOptions
          startTimer={startTimerAfterCreate}
          onStartTimerChange={setStartTimerAfterCreate}
          promoteStatus={promoteStatusOnStart}
          onPromoteStatusChange={setPromoteStatusOnStart}
          taskStatus={taskStatus}
          compact
        />
      ) : (
        <span />
      )}
      <div className="flex gap-3">
        <Button type="button" variant="secondary" onClick={handleClose}>
          {readOnly ? "Close" : "Cancel"}
        </Button>
        {!readOnly && (
          <Button type="submit" form={TASK_FORM_ID} isLoading={isSubmitting}>
            {editingTask ? "Update Task" : "Create Task"}
          </Button>
        )}
      </div>
    </div>
  ) : undefined;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={modalTitle}
      description={
        readOnly && editingTask
          ? "You can view this task but cannot make changes in this workspace."
          : editingTask
            ? "Edits save as you type. Subtasks, comments and files are below."
            : isPersonal
              ? "Add a task to your personal workspace."
              : `This task will be shared with everyone in ${workspaceName}.`
      }
      size={editingTask ? "full" : "lg"}
      variant={isPanel ? "panel" : "center"}
      headerExtra={saveBadge}
      bodyClassName="py-3"
      footer={footer}
    >
      {showTabs && (
        <div className="mb-4 flex gap-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-1">
          <button
            type="button"
            onClick={() => setTab("details")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              tab === "details"
                ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            )}
          >
            <FileText className="h-4 w-4" />
            Details
          </button>
          <button
            type="button"
            onClick={() => setTab("more")}
            className={cn(
              "relative flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              tab === "more"
                ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            )}
          >
            <MessageSquare className="h-4 w-4" />
            Collaboration
            {collabBadgeCount > 0 && (
              <span className="ml-0.5 rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-bold text-white">
                {collabBadgeCount}
              </span>
            )}
          </button>
        </div>
      )}

      {onDetailsTab && (
        <TaskForm
          key={editingTask?.id ?? `new-${defaultCategoryId ?? ""}-${defaultDueDate ?? ""}`}
          initialData={editingTask}
          workspaceId={workspaceId}
          members={members}
          lockWorkspace={lockWorkspace}
          defaultDueDate={defaultDueDate}
          defaultCategoryId={defaultCategoryId}
          onSubmit={onSubmit}
          onCancel={handleClose}
          isSubmitting={isSubmitting}
          readOnly={readOnly}
          hideFooter
          startTimerAfterCreate={showCreateTimerOptions ? startTimerAfterCreate : undefined}
          promoteStatusOnStart={showCreateTimerOptions ? promoteStatusOnStart : undefined}
          onStatusChange={setTaskStatus}
          onAutoSave={isPanel && !readOnly ? autoSave : undefined}
        />
      )}

      {isPanel && editingTask && (
        <div className="mt-6">
          <TaskDetail
            taskId={editingTask.id}
            readOnly={readOnly}
            layout="stack"
            members={members?.map((m) => ({ id: m.id, name: m.name })) ?? []}
          />
        </div>
      )}

      {showTabs && tab === "more" && editingTask && (
        <TaskDetail
          taskId={editingTask.id}
          readOnly={readOnly}
          layout="sidebar"
          members={members?.map((m) => ({ id: m.id, name: m.name })) ?? []}
        />
      )}
    </Modal>
  );
}
