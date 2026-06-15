"use client";

import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import { cn, getPriorityColor } from "@/lib/utils";
import { resolveTaskColumnId } from "@/lib/board-columns";
import type { Task } from "@/components/TaskCard";
import type { BoardColumn } from "@/components/BoardListsPanel";
import { AssigneeChips } from "@/components/AssigneeChips";

function DraggableTask({ task, onEdit, readOnly }: { task: Task; onEdit: (t: Task) => void; readOnly?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    disabled: readOnly,
  });

  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      {...(!readOnly ? listeners : {})}
      {...(!readOnly ? attributes : {})}
      onClick={() => onEdit(task)}
      className={cn(
        "rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3 shadow-sm transition-shadow hover:shadow-md",
        readOnly ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
        isDragging && "z-50 opacity-50 shadow-lg"
      )}
    >
      <p className="text-sm font-medium text-[var(--foreground)]">{task.title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className={cn("inline-block rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase", getPriorityColor(task.priority))}>
          {task.priority}
        </span>
        {task.assignees && task.assignees.length > 0 && (
          <AssigneeChips assignees={task.assignees} compact />
        )}
      </div>
    </div>
  );
}

function DroppableColumn({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn("min-h-[200px] space-y-2 rounded-lg p-1", isOver && "bg-[var(--accent-soft)]")}>
      {children}
    </div>
  );
}

interface KanbanBoardProps {
  tasks: Task[];
  columns: BoardColumn[];
  onColumnChange: (taskId: string, columnId: string) => void;
  onEdit: (task: Task) => void;
  readOnly?: boolean;
}

export function KanbanBoard({ tasks, columns, onColumnChange, onEdit, readOnly = false }: KanbanBoardProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: readOnly ? 99999 : 8 } })
  );

  const columnIds = new Set(columns.map((c) => c.id));

  const tasksByColumn = columns.reduce<Record<string, Task[]>>((acc, col) => {
    acc[col.id] = tasks.filter((t) => resolveTaskColumnId(t, columns) === col.id);
    return acc;
  }, {});

  const handleDragEnd = (event: DragEndEvent) => {
    if (readOnly) return;
    const { active, over } = event;
    if (!over) return;

    const task = tasks.find((t) => t.id === active.id);
    const newColumnId = String(over.id);
    if (!task || !columnIds.has(newColumnId)) return;

    const currentColumnId = resolveTaskColumnId(task, columns);
    if (currentColumnId !== newColumnId) {
      onColumnChange(task.id, newColumnId);
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {columns.map((col) => {
          const colTasks = tasksByColumn[col.id] ?? [];
          return (
            <div
              key={col.id}
              className="w-[280px] shrink-0 rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-4"
              style={{ borderTopWidth: 3, borderTopColor: col.color }}
            >
              <h3 className="mb-3 flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-[var(--foreground)]">{col.name}</span>
                <span className="rounded-full bg-[var(--surface-hover)] px-2 py-0.5 text-[10px] tabular-nums text-[var(--muted)]">
                  {colTasks.length}
                </span>
              </h3>
              <DroppableColumn id={col.id}>
                {colTasks.map((task) => (
                  <DraggableTask key={task.id} task={task} onEdit={onEdit} readOnly={readOnly} />
                ))}
              </DroppableColumn>
            </div>
          );
        })}
      </div>
    </DndContext>
  );
}
