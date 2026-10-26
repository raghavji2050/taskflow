"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Archive, ArchiveRestore, Columns3, LayoutList, Plus, Settings, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { ProjectBoard } from "@/components/projects/ProjectBoard";
import { ProjectMembersDialog, type ProjectMemberRow } from "@/components/projects/ProjectMembersDialog";
import { TaskEditModal } from "@/components/TaskEditModal";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { PageHeader } from "@/components/PageHeader";
import type { Task } from "@/components/TaskCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PageLoader } from "@/components/ui/PageLoader";
import { Textarea } from "@/components/ui/Textarea";
import { saveTaskWithOptionalTimer, type TaskFormSubmitOptions } from "@/lib/client-task-submit";
import { useRealtimeSync } from "@/lib/useRealtimeSync";
import { PROJECT_COLORS, type ProjectRoleName } from "@/lib/project-sections";
import { toTaskInput } from "@/lib/task-ui";
import type { TaskInput } from "@/lib/validations";

type SectionItem = { id: string; name: string; position: number };

type ProjectDetail = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  archived: boolean;
  workspaceId: string;
  workspace: { id: string; name: string };
  sections: SectionItem[];
  members: ProjectMemberRow[];
};

type Access = {
  canEdit: boolean;
  canManage: boolean;
  projectRole: ProjectRoleName | null;
  workspaceRole: string;
};

export function ProjectViewClient({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { status } = useSession();
  const { workspaces } = useWorkspace();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [access, setAccess] = useState<Access | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "board">("board");
  const [refreshKey, setRefreshKey] = useState(0);
  const [membersOpen, setMembersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sectionName, setSectionName] = useState("");
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [createSectionId, setCreateSectionId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftColor, setDraftColor] = useState<string>(PROJECT_COLORS[0]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not load project");
      setProject(null);
      setLoading(false);
      return;
    }
    setProject(data.project);
    setTasks(data.tasks ?? []);
    setAccess(data.access);
    setError(null);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") void load();
  }, [status, load, refreshKey]);

  const refresh = () => setRefreshKey((value) => value + 1);

  useRealtimeSync({
    workspaceId: project?.workspaceId ?? null,
    onRefresh: refresh,
    enabled: status === "authenticated" && !!project?.workspaceId,
  });

  const workspaceMembers = workspaces.find((item) => item.id === project?.workspaceId)?.members ?? [];

  const moveTask = async (taskId: string, sectionId: string, position: number) => {
    const previous = tasks;
    const res = await fetch(`/api/projects/${projectId}/tasks/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, sectionId, position }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Could not move task");
      setTasks(previous);
      refresh();
    }
  };

  const renameSection = async (sectionId: string, name: string) => {
    const res = await fetch(`/api/projects/${projectId}/sections/${sectionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Could not rename section");
    }
    refresh();
  };

  const reorderSection = async (sectionId: string, direction: -1 | 1) => {
    if (!project) return;
    const ids = [...project.sections].sort((a, b) => a.position - b.position).map((section) => section.id);
    const index = ids.indexOf(sectionId);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= ids.length) return;
    const reordered = [...ids];
    const [item] = reordered.splice(index, 1);
    if (!item) return;
    reordered.splice(next, 0, item);
    const res = await fetch(`/api/projects/${projectId}/sections/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sectionIds: reordered }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Could not reorder sections");
    }
    refresh();
  };

  const addSection = async () => {
    const name = sectionName.trim();
    if (!name) return;
    const res = await fetch(`/api/projects/${projectId}/sections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Could not add section");
      return;
    }
    setSectionName("");
    refresh();
  };

  const saveSettings = async () => {
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draftName.trim(),
        description: draftDescription.trim() || null,
        color: draftColor,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Could not update project");
      return;
    }
    setSettingsOpen(false);
    refresh();
  };

  const setArchived = async (archived: boolean) => {
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Could not update project");
      return;
    }
    refresh();
  };

  const deleteProject = async () => {
    if (!project || !confirm(`Delete “${project.name}”? Tasks stay in the workspace.`)) return;
    const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Could not delete project");
      return;
    }
    router.push("/dashboard/projects");
  };

  const handleSubmit = async (data: TaskInput, options?: TaskFormSubmitOptions) => {
    if (!project || !access?.canEdit) return;
    setSavingTask(true);
    try {
      const sectionId = editingTask?.sectionId ?? createSectionId ?? project.sections[0]?.id ?? null;
      await saveTaskWithOptionalTimer(
        {
          ...data,
          workspaceId: project.workspaceId,
          projectId: project.id,
          sectionId,
        },
        editingTask?.id ?? null,
        options
      );
      setFormOpen(false);
      setEditingTask(null);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save task");
    } finally {
      setSavingTask(false);
    }
  };

  const toggleComplete = async (task: Task) => {
    if (!access?.canEdit) return;
    const next = task.status === "COMPLETED" ? "PENDING" : "COMPLETED";
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toTaskInput(task, { status: next })),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Could not update task");
      return;
    }
    refresh();
  };

  const deleteTask = async (task: Task) => {
    if (!access?.canEdit || !confirm(`Delete “${task.title}”?`)) return;
    const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Could not delete task");
      return;
    }
    refresh();
  };

  if (status === "loading" || loading) return <PageLoader />;

  if (error || !project || !access) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--card-border)] py-16 text-center text-sm text-[var(--muted)]">
        {error ?? "Project not found"}
      </div>
    );
  }

  const readOnly = !access.canEdit;

  return (
    <div>
      <PageHeader
        eyebrow={project.workspace.name}
        title={project.name}
        subtitle={project.description || "Tasks grouped by section"}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={view === "list" ? "primary" : "secondary"} size="sm" onClick={() => setView("list")}>
              <LayoutList className="h-4 w-4" />
              List
            </Button>
            <Button variant={view === "board" ? "primary" : "secondary"} size="sm" onClick={() => setView("board")}>
              <Columns3 className="h-4 w-4" />
              Board
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setMembersOpen(true)}>
              <Users className="h-4 w-4" />
              Members
            </Button>
            {access.canManage && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setDraftName(project.name);
                  setDraftDescription(project.description ?? "");
                  setDraftColor(project.color);
                  setSettingsOpen(true);
                }}
              >
                <Settings className="h-4 w-4" />
                Settings
              </Button>
            )}
            {!readOnly && (
              <Button
                size="sm"
                onClick={() => {
                  setEditingTask(null);
                  setCreateSectionId(project.sections[0]?.id ?? null);
                  setFormOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                New task
              </Button>
            )}
          </div>
        }
      />

      {project.archived && (
        <p className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface-hover)] px-3 py-2 text-sm text-[var(--muted)]">
          This project is archived. Restore it to edit tasks and sections.
        </p>
      )}

      {!readOnly && (
        <form
          className="mb-4 flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            void addSection();
          }}
        >
          <Input
            hideLabel
            label="New section"
            placeholder="New section"
            value={sectionName}
            onChange={(event) => setSectionName(event.target.value)}
          />
          <Button type="submit" variant="secondary" disabled={!sectionName.trim()}>
            Add section
          </Button>
        </form>
      )}

      <div className="mb-3 h-1.5 w-16 rounded-full" style={{ backgroundColor: project.color }} />

      <ProjectBoard
        layout={view}
        sections={project.sections}
        tasks={tasks}
        readOnly={readOnly}
        onTasksChange={setTasks}
        onMove={moveTask}
        onEdit={(task) => {
          setEditingTask(task);
          setFormOpen(true);
        }}
        onDelete={(task) => { void deleteTask(task); }}
        onToggleComplete={(task) => { void toggleComplete(task); }}
        onAddTask={(sectionId) => {
          setEditingTask(null);
          setCreateSectionId(sectionId);
          setFormOpen(true);
        }}
        onRenameSection={renameSection}
        onDeleteSection={(sectionId) => {
          if (!confirm("Delete this section? Its tasks move to another section.")) return;
          void fetch(`/api/projects/${projectId}/sections/${sectionId}`, { method: "DELETE" })
            .then(async (res) => {
              if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                toast.error(data.error ?? "Could not delete section");
              }
              refresh();
            });
        }}
        onReorderSection={(sectionId, direction) => { void reorderSection(sectionId, direction); }}
      />

      <ProjectMembersDialog
        isOpen={membersOpen}
        onClose={() => setMembersOpen(false)}
        projectId={project.id}
        workspaceId={project.workspaceId}
        members={project.members}
        canManage={access.canManage}
        onChanged={refresh}
      />

      <Modal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Project settings"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSettingsOpen(false)}>Close</Button>
            <Button onClick={() => { void saveSettings(); }} disabled={!draftName.trim()}>Save</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input label="Name" value={draftName} onChange={(event) => setDraftName(event.target.value)} />
          <Textarea label="Description" value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} rows={3} />
          <div className="flex flex-wrap gap-2">
            {PROJECT_COLORS.map((swatch) => (
              <button
                key={swatch}
                type="button"
                aria-label={`Use color ${swatch}`}
                onClick={() => setDraftColor(swatch)}
                className="h-7 w-7 rounded-full border-2"
                style={{
                  backgroundColor: swatch,
                  borderColor: draftColor === swatch ? "var(--foreground)" : "transparent",
                }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => { void setArchived(!project.archived); setSettingsOpen(false); }}
            >
              {project.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
              {project.archived ? "Restore" : "Archive"}
            </Button>
            <Button type="button" variant="danger" onClick={() => { void deleteProject(); }}>
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      <TaskEditModal
        isOpen={formOpen}
        onClose={() => { setFormOpen(false); setEditingTask(null); }}
        title={editingTask ? "Edit task" : "New task"}
        editingTask={editingTask}
        workspaceId={project.workspaceId}
        members={workspaceMembers.map((member) => member.user)}
        lockWorkspace
        isPersonal={false}
        workspaceName={project.workspace.name}
        readOnly={readOnly}
        onSubmit={handleSubmit}
        isSubmitting={savingTask}
      />
    </div>
  );
}
