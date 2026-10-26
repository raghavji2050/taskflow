"use client";

import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Check, ChevronDown, ChevronUp, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { AssigneeChips } from "@/components/AssigneeChips";
import type { Task } from "@/components/TaskCard";
import { planTaskMove, type SectionTask } from "@/lib/project-sections";
import { cn, getPriorityColor, getStatusColor } from "@/lib/utils";

export type ProjectSectionItem = {
  id: string;
  name: string;
  position: number;
};

type ProjectBoardProps = {
  layout: "list" | "board";
  sections: ProjectSectionItem[];
  tasks: Task[];
  readOnly?: boolean;
  onTasksChange: (tasks: Task[]) => void;
  onMove: (taskId: string, sectionId: string, position: number) => Promise<void>;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onToggleComplete: (task: Task) => void;
  onAddTask: (sectionId: string) => void;
  onRenameSection: (sectionId: string, name: string) => Promise<void>;
  onDeleteSection: (sectionId: string) => void;
  onReorderSection: (sectionId: string, direction: -1 | 1) => void;
};

const sectionIconBtn =
  "flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] disabled:pointer-events-none disabled:opacity-30";

function sectionDropId(id: string) {
  return `section:${id}`;
}

function taskDragId(id: string) {
  return `task:${id}`;
}

function sortTasks(tasks: Task[]) {
  return [...tasks].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id.localeCompare(b.id)
  );
}

function dropIndex(tasks: Task[], movingId: string, sectionId: string, overTaskId: string | null) {
  const inSection = sortTasks(tasks.filter((task) => task.sectionId === sectionId && task.id !== movingId));
  if (!overTaskId) return inSection.length;
  const index = inSection.findIndex((task) => task.id === overTaskId);
  return index < 0 ? inSection.length : index;
}

function ProjectTaskCard({
  task,
  readOnly,
  onEdit,
  onDelete,
  onToggleComplete,
}: {
  task: Task;
  readOnly?: boolean;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onToggleComplete: (task: Task) => void;
}) {
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: taskDragId(task.id),
    disabled: readOnly,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: taskDragId(task.id) });

  return (
    <div
      ref={(node) => {
        setDragRef(node);
        setDropRef(node);
      }}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn(
        "flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3 transition-shadow",
        isOver && "ring-2 ring-[var(--accent)]",
        isDragging && "z-20 opacity-60 shadow-lg"
      )}
    >
      <button
        type="button"
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
          task.status === "COMPLETED"
            ? "border-[var(--accent)] bg-[var(--accent)] text-white"
            : "border-[var(--border)] text-transparent hover:border-[var(--accent)]"
        )}
        aria-label={task.status === "COMPLETED" ? "Mark incomplete" : "Mark complete"}
        disabled={readOnly}
        onClick={() => onToggleComplete(task)}
      >
        <Check className="h-3 w-3" />
      </button>

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onEdit(task)}
          className={cn(
            "block w-full truncate text-left text-sm font-medium text-[var(--foreground)]",
            task.status === "COMPLETED" && "text-[var(--muted)] line-through"
          )}
        >
          {task.title}
        </button>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase", getPriorityColor(task.priority))}>
            {task.priority}
          </span>
          <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase", getStatusColor(task.status))}>
            {task.status.replace("_", " ")}
          </span>
          {task.assignees && task.assignees.length > 0 && (
            <AssigneeChips assignees={task.assignees} compact />
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {!readOnly && (
          <button
            type="button"
            className="flex h-7 w-7 cursor-grab items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-hover)] active:cursor-grabbing"
            aria-label={`Drag ${task.title}`}
            {...listeners}
            {...attributes}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        {!readOnly && (
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted)] hover:bg-red-500/10 hover:text-red-500"
            aria-label={`Delete ${task.title}`}
            onClick={() => onDelete(task)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function SectionColumn({
  section,
  tasks,
  layout,
  readOnly,
  canMoveUp,
  canMoveDown,
  onEdit,
  onDelete,
  onToggleComplete,
  onAddTask,
  onRenameSection,
  onDeleteSection,
  onReorderSection,
}: {
  section: ProjectSectionItem;
  tasks: Task[];
  layout: "list" | "board";
  readOnly?: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onToggleComplete: (task: Task) => void;
  onAddTask: (sectionId: string) => void;
  onRenameSection: (sectionId: string, name: string) => Promise<void>;
  onDeleteSection: (sectionId: string) => void;
  onReorderSection: (sectionId: string, direction: -1 | 1) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: sectionDropId(section.id) });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(section.name);

  const saveName = async () => {
    const next = name.trim();
    setEditing(false);
    if (!next || next === section.name) {
      setName(section.name);
      return;
    }
    await onRenameSection(section.id, next);
  };

  return (
    <section
      className={cn(
        "surface-panel rounded-2xl border border-[var(--border)] p-3",
        layout === "board" ? "w-[290px] shrink-0" : "w-full"
      )}
    >
      <div className="mb-3 flex items-center gap-1">
        {editing ? (
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => { void saveName(); }}
            onKeyDown={(event) => {
              if (event.key === "Enter") void saveName();
              if (event.key === "Escape") {
                setName(section.name);
                setEditing(false);
              }
            }}
            className="h-8 min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 text-sm"
            autoFocus
            aria-label="Section name"
          />
        ) : (
          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--foreground)]">
            {section.name}
          </h3>
        )}
        <span className="rounded-full bg-[var(--surface-hover)] px-2 py-0.5 text-[10px] tabular-nums text-[var(--muted)]">
          {tasks.length}
        </span>
        {!readOnly && (
          <>
            <button type="button" className={sectionIconBtn} aria-label="Move section up" disabled={!canMoveUp} onClick={() => onReorderSection(section.id, -1)}>
              <ChevronUp className="h-4 w-4" />
            </button>
            <button type="button" className={sectionIconBtn} aria-label="Move section down" disabled={!canMoveDown} onClick={() => onReorderSection(section.id, 1)}>
              <ChevronDown className="h-4 w-4" />
            </button>
            <button type="button" className={sectionIconBtn} aria-label="Rename section" onClick={() => { setName(section.name); setEditing(true); }}>
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button type="button" className={sectionIconBtn} aria-label="Add task to section" onClick={() => onAddTask(section.id)}>
              <Plus className="h-4 w-4" />
            </button>
            <button type="button" className={cn(sectionIconBtn, "hover:text-red-500")} aria-label="Delete section" onClick={() => onDeleteSection(section.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "min-h-[88px] space-y-2 rounded-xl p-1",
          isOver && "bg-[var(--accent-soft)] ring-2 ring-[var(--accent)] ring-inset"
        )}
      >
        {tasks.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-[var(--muted)]">Drop tasks here</p>
        )}
        {tasks.map((task) => (
          <ProjectTaskCard
            key={task.id}
            task={task}
            readOnly={readOnly}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggleComplete={onToggleComplete}
          />
        ))}
      </div>
    </section>
  );
}

export function ProjectBoard({
  layout,
  sections,
  tasks,
  readOnly = false,
  onTasksChange,
  onMove,
  onEdit,
  onDelete,
  onToggleComplete,
  onAddTask,
  onRenameSection,
  onDeleteSection,
  onReorderSection,
}: ProjectBoardProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: readOnly ? 9999 : 6 } })
  );
  const orderedSections = [...sections].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));

  const handleDragEnd = (event: DragEndEvent) => {
    if (readOnly) return;
    const overId = event.over ? String(event.over.id) : "";
    const activeId = String(event.active.id);
    if (!overId || !activeId.startsWith("task:")) return;

    const taskId = activeId.slice("task:".length);
    const moving = tasks.find((task) => task.id === taskId);
    if (!moving) return;

    let toSectionId = "";
    let overTaskId: string | null = null;
    if (overId.startsWith("section:")) {
      toSectionId = overId.slice("section:".length);
    } else if (overId.startsWith("task:")) {
      const overTask = tasks.find((task) => task.id === overId.slice("task:".length));
      if (!overTask?.sectionId) return;
      toSectionId = overTask.sectionId;
      overTaskId = overTask.id === taskId ? null : overTask.id;
    }
    if (!toSectionId || !orderedSections.some((section) => section.id === toSectionId)) return;

    const toIndex = dropIndex(tasks, taskId, toSectionId, overTaskId);
    const currentIndex = sortTasks(tasks.filter((task) => task.sectionId === moving.sectionId))
      .findIndex((task) => task.id === taskId);
    if (moving.sectionId === toSectionId && currentIndex === toIndex) return;

    const sourceTasks: SectionTask[] = tasks.flatMap((task) => {
      if (task.sectionId === toSectionId || task.sectionId === moving.sectionId) {
        return [{ id: task.id, sectionId: task.sectionId ?? "__unsectioned__", position: task.position ?? 0 }];
      }
      if (task.id === taskId) {
        return [{ id: task.id, sectionId: "__unsectioned__", position: task.position ?? 0 }];
      }
      return [];
    });

    const planned = planTaskMove(sourceTasks, taskId, toSectionId, toIndex)
      .filter((item) => item.sectionId !== "__unsectioned__");
    const nextById = new Map(planned.map((item) => [item.id, item]));
    onTasksChange(
      tasks.map((task) => {
        const next = nextById.get(task.id);
        return next ? { ...task, sectionId: next.sectionId, position: next.position } : task;
      })
    );
    void onMove(taskId, toSectionId, toIndex);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className={cn(layout === "board" ? "flex gap-4 overflow-x-auto pb-2" : "space-y-4")}>
        {orderedSections.map((section, index) => (
          <SectionColumn
            key={section.id}
            section={section}
            tasks={sortTasks(tasks.filter((task) => task.sectionId === section.id))}
            layout={layout}
            readOnly={readOnly}
            canMoveUp={index > 0}
            canMoveDown={index < orderedSections.length - 1}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggleComplete={onToggleComplete}
            onAddTask={onAddTask}
            onRenameSection={onRenameSection}
            onDeleteSection={onDeleteSection}
            onReorderSection={onReorderSection}
          />
        ))}
        {orderedSections.length === 0 && (
          <div className="w-full rounded-xl border border-dashed border-[var(--card-border)] py-16 text-center text-sm text-[var(--muted)]">
            Add a section to start organizing tasks
          </div>
        )}
      </div>
    </DndContext>
  );
}
