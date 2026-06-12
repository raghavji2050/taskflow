"use client";

import { useState } from "react";
import { FileText, Layers } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { TaskForm } from "@/components/TaskForm";
import { TaskDetail } from "@/components/TaskDetail";
import { useWorkspace } from "@/components/WorkspaceProvider";
import type { Task } from "@/components/TaskCard";
import type { TaskInput } from "@/lib/validations";
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
  onSubmit: (data: TaskInput) => Promise<void>;
  isSubmitting?: boolean;
  defaultDueDate?: string;
  defaultCategoryId?: string | null;
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
}: TaskEditModalProps) {
  const [tab, setTab] = useState<"details" | "more">("details");
  const { canEditTasks } = useWorkspace();
  const readOnly = !canEditTasks;

  const handleClose = () => {
    setTab("details");
    onClose();
  };

  const showTabs = !!editingTask;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      description={
        editingTask
          ? "Update task fields or manage subtasks, comments, and attachments."
          : isPersonal
            ? "Add a task to your personal workspace."
            : `This task will be shared with everyone in ${workspaceName}.`
      }
      size={editingTask ? "xl" : "lg"}
    >
      {showTabs && (
        <div className="mb-4 flex gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800/80">
          <button
            type="button"
            onClick={() => setTab("details")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              tab === "details"
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-50"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            )}
          >
            <FileText className="h-4 w-4" />
            Details
          </button>
          <button
            type="button"
            onClick={() => setTab("more")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              tab === "more"
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-50"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            )}
          >
            <Layers className="h-4 w-4" />
            Subtasks & More
          </button>
        </div>
      )}

      {(!showTabs || tab === "details") && (
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
        />
      )}

      {showTabs && tab === "more" && editingTask && (
        <TaskDetail taskId={editingTask.id} readOnly={readOnly} />
      )}
    </Modal>
  );
}
