"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { taskSchema, type TaskInput } from "@/lib/validations";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import type { Task } from "@/components/TaskCard";
import { MemberAssignSelect } from "@/components/MemberAssignSelect";
import { getAssigneePayloadFromTask } from "@/lib/task-ui";
import { toDateInputValue } from "@/lib/utils";

interface Category { id: string; name: string; color: string }
interface Tag { id: string; name: string }
interface BoardColumnOption { id: string; name: string; color: string; status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | null }

interface Member { id: string; name: string; email: string }

const taskFormSchema = taskSchema.omit({ assigneeIds: true, primaryAssigneeId: true });
type TaskFormValues = z.infer<typeof taskFormSchema>;

interface TaskFormProps {
  initialData?: Task | null;
  onSubmit: (data: TaskInput) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
  workspaceId?: string;
  members?: Member[];
  lockWorkspace?: boolean;
  defaultDueDate?: string;
  defaultCategoryId?: string | null;
  readOnly?: boolean;
}

function toTimeInputValue(date: string | null | undefined) {
  if (!date) return "";
  const d = new Date(date);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function TaskForm({
  initialData, onSubmit, onCancel, isSubmitting, workspaceId, members, lockWorkspace, defaultDueDate, defaultCategoryId, readOnly = false,
}: TaskFormProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [boardColumns, setBoardColumns] = useState<BoardColumnOption[]>([]);
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [primaryAssigneeId, setPrimaryAssigneeId] = useState<string | null>(null);
  const [dueTime, setDueTime] = useState("");
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: "", description: "", priority: "MEDIUM", status: "PENDING",
      dueDate: "", categoryId: null, boardColumnId: null, recurrenceRule: null,
    },
  });

  const dueDate = watch("dueDate");
  const selectedCategoryId = watch("categoryId");
  const selectedBoardColumnId = watch("boardColumnId");
  const selectedStatus = watch("status");
  const selectedWorkspaceId = watch("workspaceId");

  const effectiveWorkspaceId = workspaceId ?? selectedWorkspaceId ?? null;

  useEffect(() => {
    const params = new URLSearchParams();
    if (effectiveWorkspaceId) params.set("workspaceId", effectiveWorkspaceId);
    fetch(`/api/board-columns?${params}`)
      .then((r) => r.json())
      .then((data) => setBoardColumns(data.columns ?? []));
  }, [effectiveWorkspaceId]);

  useEffect(() => {
    Promise.all([
      fetch("/api/categories").then((r) => r.json()),
      fetch("/api/tags").then((r) => r.json()),
      fetch("/api/workspaces").then((r) => r.json()),
    ]).then(([catData, tagData, wsData]) => {
      setCategories(catData.categories ?? []);
      setTags(tagData.tags ?? []);
      setWorkspaces(wsData.workspaces ?? []);
    });
  }, []);

  useEffect(() => {
    if (initialData) {
      reset({
        title: initialData.title,
        description: initialData.description ?? "",
        priority: initialData.priority,
        status: initialData.status,
        dueDate: toDateInputValue(initialData.dueDate),
        categoryId: (initialData as Task & { categoryId?: string }).categoryId ?? null,
        boardColumnId: initialData.boardColumnId ?? null,
        workspaceId: workspaceId ?? (initialData as Task & { workspaceId?: string }).workspaceId ?? null,
        recurrenceRule: ((initialData as Task & { recurrenceRule?: string }).recurrenceRule ?? null) as TaskInput["recurrenceRule"],
      });
      const { assigneeIds: ids, primaryAssigneeId: primary } = getAssigneePayloadFromTask(initialData);
      setAssigneeIds(ids);
      setPrimaryAssigneeId(primary);
      setDueTime(toTimeInputValue(initialData.dueDate));
      setSelectedTags(
        ((initialData as Task & { tags?: { tag: Tag }[] }).tags ?? []).map((t) => t.tag.id)
      );
    } else {
      reset({
        title: "", description: "", priority: "MEDIUM", status: "PENDING",
        dueDate: defaultDueDate ?? "",
        categoryId: defaultCategoryId ?? null,
        boardColumnId: null,
        recurrenceRule: null, workspaceId: workspaceId ?? null,
      });
      setAssigneeIds([]);
      setPrimaryAssigneeId(null);
      setDueTime("");
      setSelectedTags([]);
    }
  }, [initialData, reset, workspaceId, defaultDueDate, defaultCategoryId]);

  // Re-apply category after options load (select can't show value before options exist)
  useEffect(() => {
    if (initialData || !defaultCategoryId || categories.length === 0) return;
    if (categories.some((c) => c.id === defaultCategoryId)) {
      setValue("categoryId", defaultCategoryId, { shouldDirty: false });
    }
  }, [categories, defaultCategoryId, initialData, setValue]);

  useEffect(() => {
    if (boardColumns.length === 0) return;

    const resolved =
      selectedBoardColumnId && boardColumns.some((c) => c.id === selectedBoardColumnId)
        ? selectedBoardColumnId
        : boardColumns.find((c) => c.status === selectedStatus)?.id
          ?? boardColumns.find((c) => c.status === "PENDING")?.id
          ?? boardColumns[0]?.id
          ?? null;

    if (resolved && resolved !== selectedBoardColumnId) {
      setValue("boardColumnId", resolved, { shouldDirty: false });
    }
  }, [boardColumns, selectedBoardColumnId, selectedStatus, setValue]);

  const titleField = register("title");

  useEffect(() => {
    if (initialData) return;
    const timer = setTimeout(() => titleInputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, [initialData]);

  const handleFormSubmit = async (data: TaskFormValues) => {
    let finalDueDate = data.dueDate;
    if (data.dueDate && dueTime) {
      finalDueDate = `${data.dueDate}T${dueTime}:00`;
    }
    await onSubmit({
      ...data,
      dueDate: finalDueDate,
      tagIds: selectedTags,
      assigneeIds: workspaceId || members?.length ? assigneeIds : [],
      primaryAssigneeId,
    });
  };

  const toggleTag = (tagId: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const handleBoardListChange = (columnId: string | null) => {
    setValue("boardColumnId", columnId, { shouldDirty: true });
    const column = boardColumns.find((c) => c.id === columnId);
    if (column?.status) {
      setValue("status", column.status, { shouldDirty: true });
    }
  };

  const handleStatusChange = (status: TaskFormValues["status"]) => {
    setValue("status", status, { shouldDirty: true });
    const currentColumn = boardColumns.find((c) => c.id === selectedBoardColumnId);
    if (currentColumn && currentColumn.status === null) return;
    const match = boardColumns.find((c) => c.status === status);
    if (match) setValue("boardColumnId", match.id, { shouldDirty: true });
  };

  return (
    <form onSubmit={readOnly ? (e) => e.preventDefault() : handleSubmit(handleFormSubmit)} className="space-y-4">
      <fieldset disabled={readOnly} className="m-0 min-w-0 space-y-4 border-0 p-0">
      <Input
        label="Title"
        placeholder="Enter task title"
        error={errors.title?.message}
        {...titleField}
        ref={(el) => {
          titleField.ref(el);
          titleInputRef.current = el;
        }}
      />
      <Textarea label="Description" placeholder="Add details" error={errors.description?.message} {...register("description")} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Priority" options={[
          { value: "LOW", label: "Low" }, { value: "MEDIUM", label: "Medium" }, { value: "HIGH", label: "High" },
        ]} error={errors.priority?.message} {...register("priority")} />

        <Select
          label="Status"
          value={selectedStatus}
          onChange={(e) => handleStatusChange(e.target.value as TaskFormValues["status"])}
          options={[
            { value: "PENDING", label: "Pending" },
            { value: "IN_PROGRESS", label: "In Progress" },
            { value: "COMPLETED", label: "Completed" },
          ]}
          error={errors.status?.message}
        />
      </div>

      {boardColumns.length > 0 && (
        <Select
          label="Board list"
          value={selectedBoardColumnId ?? ""}
          onChange={(e) =>
            handleBoardListChange(e.target.value === "" ? null : e.target.value)
          }
          options={boardColumns.map((c) => ({ value: c.id, label: c.name }))}
          error={errors.boardColumnId?.message}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Due Date" type="date" error={errors.dueDate?.message} {...register("dueDate")} />
        <Input label="Due Time" type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} disabled={!dueDate} />
      </div>

      <Select
        label="Category"
        value={selectedCategoryId ?? ""}
        onChange={(e) =>
          setValue("categoryId", e.target.value === "" ? null : e.target.value, { shouldDirty: true })
        }
        options={[
          { value: "", label: "No category" },
          ...categories.map((c) => ({ value: c.id, label: c.name })),
        ]}
      />

      {!lockWorkspace && !workspaceId && workspaces.length > 0 && (
        <Select label="Team / Workspace" options={[
          { value: "", label: "Personal (no team)" },
          ...workspaces.map((w) => ({ value: w.id, label: w.name })),
        ]} {...register("workspaceId")} />
      )}

      {(members?.length || workspaceId) && members && members.length > 0 && (
        <MemberAssignSelect
          members={members}
          selectedIds={assigneeIds}
          primaryId={primaryAssigneeId}
          onChange={(ids, primary) => {
            setAssigneeIds(ids);
            setPrimaryAssigneeId(primary);
          }}
        />
      )}

      <Select label="Recurrence" options={[
        { value: "", label: "None" },
        { value: "DAILY", label: "Daily" },
        { value: "WEEKLY", label: "Weekly" },
        { value: "MONTHLY", label: "Monthly" },
      ]} {...register("recurrenceRule")} />

      {tags.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                  selectedTags.includes(tag.id)
                    ? "bg-indigo-500 text-white"
                    : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
              >
                {tag.name}
              </button>
            ))}
          </div>
        </div>
      )}

      </fieldset>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>{readOnly ? "Close" : "Cancel"}</Button>
        {!readOnly && (
          <Button type="submit" isLoading={isSubmitting}>
            {initialData ? "Update Task" : "Create Task"}
          </Button>
        )}
      </div>
    </form>
  );
}
