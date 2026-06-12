"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { taskSchema, type TaskInput } from "@/lib/validations";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import type { Task } from "@/components/TaskCard";
import { toDateInputValue } from "@/lib/utils";

interface Category { id: string; name: string; color: string }
interface Tag { id: string; name: string }

interface Member { id: string; name: string; email: string }

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
}

function toTimeInputValue(date: string | null | undefined) {
  if (!date) return "";
  const d = new Date(date);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function TaskForm({
  initialData, onSubmit, onCancel, isSubmitting, workspaceId, members, lockWorkspace, defaultDueDate, defaultCategoryId,
}: TaskFormProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [dueTime, setDueTime] = useState("");
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<TaskInput>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: "", description: "", priority: "MEDIUM", status: "PENDING",
      dueDate: "", categoryId: null, recurrenceRule: null,
    },
  });

  const dueDate = watch("dueDate");

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
        workspaceId: workspaceId ?? (initialData as Task & { workspaceId?: string }).workspaceId ?? null,
        assigneeId: (initialData as Task & { assigneeId?: string }).assigneeId ?? null,
        recurrenceRule: ((initialData as Task & { recurrenceRule?: string }).recurrenceRule ?? null) as TaskInput["recurrenceRule"],
      });
      setDueTime(toTimeInputValue(initialData.dueDate));
      setSelectedTags(
        ((initialData as Task & { tags?: { tag: Tag }[] }).tags ?? []).map((t) => t.tag.id)
      );
    } else {
      reset({
        title: "", description: "", priority: "MEDIUM", status: "PENDING",
        dueDate: defaultDueDate ?? "",
        categoryId: defaultCategoryId ?? null,
        recurrenceRule: null, workspaceId: workspaceId ?? null, assigneeId: null,
      });
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

  const selectedCategoryId = watch("categoryId");
  const titleField = register("title");

  useEffect(() => {
    if (initialData) return;
    const timer = setTimeout(() => titleInputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, [initialData]);

  const handleFormSubmit = async (data: TaskInput) => {
    let finalDueDate = data.dueDate;
    if (data.dueDate && dueTime) {
      finalDueDate = `${data.dueDate}T${dueTime}:00`;
    }
    await onSubmit({ ...data, dueDate: finalDueDate, tagIds: selectedTags });
  };

  const toggleTag = (tagId: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
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

        <Select label="Status" options={[
          { value: "PENDING", label: "Pending" },
          { value: "IN_PROGRESS", label: "In Progress" },
          { value: "COMPLETED", label: "Completed" },
        ]} error={errors.status?.message} {...register("status")} />
      </div>

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

      {(members?.length || workspaceId) && (
        <Select label="Assign To" options={[
          { value: "", label: "Unassigned" },
          ...(members ?? []).map((m) => ({ value: m.id, label: m.name })),
        ]} {...register("assigneeId")} />
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

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" isLoading={isSubmitting}>
          {initialData ? "Update Task" : "Create Task"}
        </Button>
      </div>
    </form>
  );
}
