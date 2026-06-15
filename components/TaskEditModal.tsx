"use client";

import { useState } from "react";
import { FileText, MessageSquare } from "lucide-react";
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
  const { canEditTasks } = useWorkspace();
  const readOnly = readOnlyProp ?? !canEditTasks;
  const commentCount = editingTask?._count?.comments ?? 0;

  const handleClose = () => {
    setTab("details");
    onClose();
  };

  const showTabs = !!editingTask;
  const modalTitle = readOnly && editingTask ? "View Task" : title;

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
      size={editingTask ? "xl" : "lg"}
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
            {commentCount > 0 && (
              <span className="ml-0.5 rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-bold text-white">
                {commentCount}
              </span>
            )}
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
        <TaskDetail
          taskId={editingTask.id}
          readOnly={readOnly}
          members={members?.map((m) => ({ id: m.id, name: m.name })) ?? []}
        />
      )}
    </Modal>
  );
}
