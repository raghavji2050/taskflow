"use client";

import { useEffect, useState } from "react";
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
}: TaskEditModalProps) {
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
    onClose();
  };

  const showTabs = !!editingTask;
  const modalTitle = readOnly && editingTask ? "View Task" : title;
  const onDetailsTab = !showTabs || tab === "details";

  const showCreateTimerOptions = !editingTask && !readOnly && onDetailsTab;

  const footer = onDetailsTab ? (
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
            ? "Update task fields or collaborate with your team."
            : isPersonal
              ? "Add a task to your personal workspace."
              : `This task will be shared with everyone in ${workspaceName}.`
      }
      size={editingTask ? "full" : "lg"}
      bodyClassName={editingTask && tab === "more" ? "min-h-[min(50vh,480px)]" : "py-3"}
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
        />
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
