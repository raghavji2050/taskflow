"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { taskSchema, type TaskInput } from "@/lib/validations";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import type { Task } from "@/components/TaskCard";
import { MemberAssignSelect } from "@/components/MemberAssignSelect";
import { TaskFormSection } from "@/components/tasks/TaskFormSection";
import { getAssigneePayloadFromTask } from "@/lib/task-ui";
import { toDateInputValue, cn } from "@/lib/utils";
import { hoursMinutesToMinutes, minutesToHoursMinutes } from "@/lib/time-format";
import type { TaskFormSubmitOptions } from "@/lib/client-task-submit";
import { parseQuickAdd, formatQuickAddPreview, DEFAULT_QUICK_ADD_TZ } from "@/lib/quick-add";

function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_QUICK_ADD_TZ;
  } catch {
    return DEFAULT_QUICK_ADD_TZ;
  }
}

interface Category { id: string; name: string; color: string }
interface Tag { id: string; name: string }
interface BoardColumnOption { id: string; name: string; color: string; status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | null }

interface Member { id: string; name: string; email: string }

const taskFormSchema = taskSchema.omit({ assigneeIds: true, primaryAssigneeId: true, estimatedMinutes: true });
type TaskFormValues = z.infer<typeof taskFormSchema>;

export const TASK_FORM_ID = "task-form";

interface TaskFormProps {
  initialData?: Task | null;
  onSubmit: (data: TaskInput, options?: TaskFormSubmitOptions) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
  workspaceId?: string;
  members?: Member[];
  lockWorkspace?: boolean;
  defaultDueDate?: string;
  defaultCategoryId?: string | null;
  readOnly?: boolean;
  /** When true, action buttons render in Modal footer instead of inside the form */
  hideFooter?: boolean;
  /** Controlled create-timer options (when footer is external) */
  startTimerAfterCreate?: boolean;
  promoteStatusOnStart?: boolean;
  onStatusChange?: (status: string) => void;
}

function toTimeInputValue(date: string | null | undefined) {
  if (!date) return "";
  const d = new Date(date);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function TaskForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting,
  workspaceId,
  members,
  lockWorkspace,
  defaultDueDate,
  defaultCategoryId,
  readOnly = false,
  hideFooter = false,
  startTimerAfterCreate: startTimerAfterCreateProp,
  promoteStatusOnStart: promoteStatusOnStartProp,
  onStatusChange,
}: TaskFormProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [boardColumns, setBoardColumns] = useState<BoardColumnOption[]>([]);
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [primaryAssigneeId, setPrimaryAssigneeId] = useState<string | null>(null);
  const [dueTime, setDueTime] = useState("");
  const [estimateHours, setEstimateHours] = useState("");
  const [estimateMinutes, setEstimateMinutes] = useState("");
  const [startTimerAfterCreateInternal, setStartTimerAfterCreateInternal] = useState(false);
  const [promoteStatusOnStartInternal, setPromoteStatusOnStartInternal] = useState(true);
  const startTimerAfterCreate = startTimerAfterCreateProp ?? startTimerAfterCreateInternal;
  const promoteStatusOnStart = promoteStatusOnStartProp ?? promoteStatusOnStartInternal;
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: "",
      description: "",
      priority: "MEDIUM",
      status: "PENDING",
      dueDate: "",
      categoryId: null,
      boardColumnId: null,
      recurrenceRule: null,
    },
  });

  const dueDate = watch("dueDate");
  const titleValue = watch("title");
  const quickAdd = useMemo(() => {
    if (initialData || !titleValue) return null;
    const tz = browserTimeZone();
    const r = parseQuickAdd(titleValue, { timeZone: tz });
    return r.matched ? { result: r, preview: formatQuickAddPreview(r, { timeZone: tz }) } : null;
  }, [initialData, titleValue]);
  const selectedCategoryId = watch("categoryId");
  const selectedBoardColumnId = watch("boardColumnId");
  const selectedStatus = watch("status");
  const selectedWorkspaceId = watch("workspaceId");
  const recurrenceRule = watch("recurrenceRule");

  const effectiveWorkspaceId = workspaceId ?? selectedWorkspaceId ?? null;

  const hasCustomBoardColumns = useMemo(
    () => boardColumns.some((c) => c.status === null),
    [boardColumns]
  );

  const showBoardListOnly = boardColumns.length > 0 && !hasCustomBoardColumns;

  const moreOptionsDefaultOpen = useMemo(() => {
    const hasEstimate =
      (initialData as Task & { estimatedMinutes?: number | null })?.estimatedMinutes != null &&
      ((initialData as Task & { estimatedMinutes?: number | null }).estimatedMinutes ?? 0) > 0;
    const hasTags = ((initialData as Task & { tags?: { tag: Tag }[] })?.tags ?? []).length > 0;
    const hasRecurrence = Boolean(
      (initialData as Task & { recurrenceRule?: string | null })?.recurrenceRule
    );
    return hasEstimate || hasTags || hasRecurrence;
  }, [initialData]);

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
      const estimate = (initialData as Task & { estimatedMinutes?: number | null }).estimatedMinutes;
      if (estimate != null && estimate > 0) {
        const { hours, minutes } = minutesToHoursMinutes(estimate);
        setEstimateHours(String(hours));
        setEstimateMinutes(String(minutes));
      } else {
        setEstimateHours("");
        setEstimateMinutes("");
      }
      setSelectedTags(
        ((initialData as Task & { tags?: { tag: Tag }[] }).tags ?? []).map((t) => t.tag.id)
      );
    } else {
      reset({
        title: "",
        description: "",
        priority: "MEDIUM",
        status: "PENDING",
        dueDate: defaultDueDate ?? "",
        categoryId: defaultCategoryId ?? null,
        boardColumnId: null,
        recurrenceRule: null,
        workspaceId: workspaceId ?? null,
      });
      setAssigneeIds([]);
      setPrimaryAssigneeId(null);
      setDueTime("");
      setEstimateHours("");
      setEstimateMinutes("");
      setStartTimerAfterCreateInternal(false);
      setPromoteStatusOnStartInternal(true);
      setSelectedTags([]);
    }
  }, [initialData, reset, workspaceId, defaultDueDate, defaultCategoryId]);

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

  useEffect(() => {
    onStatusChange?.(selectedStatus);
  }, [selectedStatus, onStatusChange]);

  const handleFormSubmit = async (data: TaskFormValues) => {
    let finalDueDate = data.dueDate;
    if (data.dueDate && dueTime) {
      finalDueDate = `${data.dueDate}T${dueTime}:00`;
    }
    if (quickAdd) {
      const q = quickAdd.result;
      data = { ...data, title: q.title };
      if (q.priority) data.priority = q.priority;
      if (q.date && !data.dueDate) {
        finalDueDate = q.time ? `${q.date}T${q.time}:00` : q.date;
      }
    }
    await onSubmit(
      {
        ...data,
        dueDate: finalDueDate,
        estimatedMinutes: hoursMinutesToMinutes(
          Number(estimateHours) || 0,
          Number(estimateMinutes) || 0
        ),
        tagIds: selectedTags,
        assigneeIds: workspaceId || members?.length ? assigneeIds : [],
        primaryAssigneeId,
      },
      !initialData && startTimerAfterCreate
        ? { startTimer: true, promoteStatus: promoteStatusOnStart }
        : undefined
    );
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
    <form
      id={TASK_FORM_ID}
      onSubmit={readOnly ? (e) => e.preventDefault() : handleSubmit(handleFormSubmit)}
      className="space-y-4"
    >
      <fieldset disabled={readOnly} className="m-0 min-w-0 space-y-4 border-0 p-0">
        <TaskFormSection title="Basics">
          <Input
            label="Title"
            placeholder={initialData ? "Enter task title" : "e.g. kal 5 baje client call !high"}
            error={errors.title?.message}
            {...titleField}
            ref={(el) => {
              titleField.ref(el);
              titleInputRef.current = el;
            }}
          />
          {quickAdd && (
            <p
              data-testid="quick-add-preview"
              className="-mt-2 text-xs text-indigo-600 dark:text-indigo-400"
            >
              ⚡ &ldquo;{quickAdd.result.title}&rdquo; · {quickAdd.preview}
            </p>
          )}
          <Textarea
            label="Description"
            placeholder="Add details"
            rows={2}
            className="min-h-[4.5rem] resize-y"
            error={errors.description?.message}
            {...register("description")}
          />
        </TaskFormSection>

        <TaskFormSection title="Status & schedule">
          {showBoardListOnly ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <Select
                label="Status"
                value={selectedBoardColumnId ?? ""}
                onChange={(e) =>
                  handleBoardListChange(e.target.value === "" ? null : e.target.value)
                }
                options={boardColumns.map((c) => ({ value: c.id, label: c.name }))}
                error={errors.boardColumnId?.message}
              />
              <Select
                label="Priority"
                options={[
                  { value: "LOW", label: "Low" },
                  { value: "MEDIUM", label: "Medium" },
                  { value: "HIGH", label: "High" },
                ]}
                error={errors.priority?.message}
                {...register("priority")}
              />
            </div>
          ) : (
            <>
              {boardColumns.length > 0 && (
                <>
                  <Select
                    label="Board list"
                    value={selectedBoardColumnId ?? ""}
                    onChange={(e) =>
                      handleBoardListChange(e.target.value === "" ? null : e.target.value)
                    }
                    options={boardColumns.map((c) => ({ value: c.id, label: c.name }))}
                    error={errors.boardColumnId?.message}
                  />
                  {hasCustomBoardColumns && (
                    <p className="text-[11px] text-[var(--muted)]">
                      List position is independent of task status.
                    </p>
                  )}
                </>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
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
                <Select
                  label="Priority"
                  options={[
                    { value: "LOW", label: "Low" },
                    { value: "MEDIUM", label: "Medium" },
                    { value: "HIGH", label: "High" },
                  ]}
                  error={errors.priority?.message}
                  {...register("priority")}
                />
              </div>
            </>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <Input label="Due date" type="date" error={errors.dueDate?.message} {...register("dueDate")} />
            <Input
              label="Due time"
              type="time"
              value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
              disabled={!dueDate}
            />
          </div>
        </TaskFormSection>

        <TaskFormSection title="Organization">
          <div
            className={cn(
              "grid gap-2",
              !lockWorkspace && !workspaceId && workspaces.length > 0 ? "sm:grid-cols-2" : "grid-cols-1"
            )}
          >
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
              <Select
                label="Team / workspace"
                options={[
                  { value: "", label: "Personal (no team)" },
                  ...workspaces.map((w) => ({ value: w.id, label: w.name })),
                ]}
                {...register("workspaceId")}
              />
            )}
          </div>
        </TaskFormSection>

        {(members?.length || workspaceId) && members && members.length > 0 && (
          <TaskFormSection title="Team">
            <MemberAssignSelect
              members={members}
              selectedIds={assigneeIds}
              primaryId={primaryAssigneeId}
              onChange={(ids, primary) => {
                setAssigneeIds(ids);
                setPrimaryAssigneeId(primary);
              }}
            />
          </TaskFormSection>
        )}

        <TaskFormSection title="More options" collapsible defaultOpen={moreOptionsDefaultOpen}>
          <Select
            label="Recurrence"
            options={[
              { value: "", label: "None" },
              { value: "DAILY", label: "Daily" },
              { value: "WEEKLY", label: "Weekly" },
              { value: "MONTHLY", label: "Monthly" },
            ]}
            value={recurrenceRule ?? ""}
            onChange={(e) =>
              setValue(
                "recurrenceRule",
                (e.target.value || null) as TaskFormValues["recurrenceRule"],
                { shouldDirty: true }
              )
            }
          />

          <div>
            <p className="mb-2 text-xs font-medium text-[var(--muted)]">Time estimate</p>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Hours"
                type="number"
                min={0}
                value={estimateHours}
                onChange={(e) => setEstimateHours(e.target.value)}
                placeholder="0"
              />
              <Input
                label="Minutes"
                type="number"
                min={0}
                max={59}
                value={estimateMinutes}
                onChange={(e) => setEstimateMinutes(e.target.value)}
                placeholder="0"
              />
            </div>
            {(estimateHours !== "" || estimateMinutes !== "") && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 h-7 px-2 text-xs"
                onClick={() => {
                  setEstimateHours("");
                  setEstimateMinutes("");
                }}
              >
                Clear estimate
              </Button>
            )}
          </div>

          {tags.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-[var(--muted)]">Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                      selectedTags.includes(tag.id)
                        ? "bg-[var(--accent)] text-white"
                        : "bg-[var(--surface-hover)] text-[var(--muted)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </TaskFormSection>

        {!initialData && !readOnly && !hideFooter && (
          <div className="space-y-2 rounded-lg border border-[var(--card-border)] bg-[var(--surface-hover)]/40 px-2.5 py-2">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={startTimerAfterCreate}
                onChange={(e) => setStartTimerAfterCreateInternal(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-[var(--card-border)] accent-[var(--accent)]"
              />
              <span className="text-sm text-[var(--foreground)]">
                Start timer immediately after creating
              </span>
            </label>
            {startTimerAfterCreate &&
              (selectedStatus === "PENDING" || selectedStatus === "COMPLETED") && (
              <label className="flex cursor-pointer items-start gap-2.5 pl-6">
                <input
                  type="checkbox"
                  checked={promoteStatusOnStart}
                  onChange={(e) => setPromoteStatusOnStartInternal(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-[var(--card-border)] accent-[var(--accent)]"
                />
                <span className="text-xs text-[var(--muted)]">
                  Set status to <span className="font-medium text-[var(--foreground)]">In progress</span>
                </span>
              </label>
            )}
          </div>
        )}
      </fieldset>

      {!hideFooter && (
        <div className="flex justify-end gap-3 border-t border-[var(--card-border)] pt-4">
          <Button type="button" variant="secondary" onClick={onCancel}>
            {readOnly ? "Close" : "Cancel"}
          </Button>
          {!readOnly && (
            <Button type="submit" isLoading={isSubmitting}>
              {initialData ? "Update Task" : "Create Task"}
            </Button>
          )}
        </div>
      )}
    </form>
  );
}
