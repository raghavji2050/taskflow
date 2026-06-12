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
import type { Task } from "@/components/TaskCard";
import { AssigneeChips } from "@/components/AssigneeChips";

const columns = [
  { id: "PENDING", label: "To Do", color: "border-sky-500/30" },
  { id: "IN_PROGRESS", label: "In Progress", color: "border-violet-500/30" },
  { id: "COMPLETED", label: "Done", color: "border-emerald-500/30" },
] as const;

function DraggableTask({ task, onEdit }: { task: Task; onEdit: (t: Task) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      {...listeners}
      {...attributes}
      onClick={() => onEdit(task)}
      className={cn(
        "cursor-grab rounded-lg border border-zinc-200 bg-white p-3 shadow-sm active:cursor-grabbing dark:border-zinc-700 dark:bg-zinc-800",
        isDragging && "opacity-50 shadow-lg z-50"
      )}
    >
      <p className="text-sm font-medium">{task.title}</p>
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
    <div ref={setNodeRef} className={cn("min-h-[200px] space-y-2", isOver && "bg-indigo-500/5 rounded-lg")}>
      {children}
    </div>
  );
}

interface KanbanBoardProps {
  tasks: Task[];
  onStatusChange: (taskId: string, status: Task["status"]) => void;
  onEdit: (task: Task) => void;
  readOnly?: boolean;
}

export function KanbanBoard({ tasks, onStatusChange, onEdit, readOnly = false }: KanbanBoardProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    if (readOnly) return;
    const { active, over } = event;
    if (!over) return;

    const task = tasks.find((t) => t.id === active.id);
    const newStatus = over.id as Task["status"];
    if (task && columns.some((c) => c.id === newStatus) && task.status !== newStatus) {
      onStatusChange(task.id, newStatus);
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="grid gap-4 md:grid-cols-3">
        {columns.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.id);
          return (
            <div key={col.id} className={cn("rounded-xl border-t-4 bg-zinc-50/50 p-3 dark:bg-zinc-900/50", col.color)}>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {col.label} ({colTasks.length})
              </h3>
              <DroppableColumn id={col.id}>
                {colTasks.map((task) => (
                  <DraggableTask key={task.id} task={task} onEdit={onEdit} />
                ))}
              </DroppableColumn>
            </div>
          );
        })}
      </div>
    </DndContext>
  );
}
