"use client";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { Task } from "@/components/TaskCard";

interface DeleteConfirmModalProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isDeleting?: boolean;
}

export function DeleteConfirmModal({
  task,
  isOpen,
  onClose,
  onConfirm,
  isDeleting,
}: DeleteConfirmModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Delete Task" size="sm">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Are you sure you want to delete{" "}
        <span className="font-medium text-zinc-900 dark:text-zinc-100">
          {task?.title}
        </span>
        ? This action cannot be undone.
      </p>
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose} disabled={isDeleting}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm} isLoading={isDeleting}>
          Delete Task
        </Button>
      </div>
    </Modal>
  );
}
