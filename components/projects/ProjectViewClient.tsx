"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Archive, ArchiveRestore, CalendarDays, Columns3, GanttChart, LayoutDashboard, LayoutList, Plus, Settings, SlidersHorizontal, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { ProjectBoard } from "@/components/projects/ProjectBoard";
import { ProjectCalendar, ProjectOverview, ProjectTimeline } from "@/components/projects/ProjectExtraViews";
import { ProjectMembersDialog, type ProjectMemberRow } from "@/components/projects/ProjectMembersDialog";
import { ProjectCustomFieldsDialog } from "@/components/projects/ProjectCustomFieldsDialog";
import { CustomFieldFilterBar } from "@/components/projects/CustomFieldFilterBar";
import { matchesCustomFieldFilter, type CustomFieldDef, type CustomFieldFilter } from "@/lib/custom-field-rules";
import { CUSTOM_FIELDS_CHANGED_EVENT } from "@/lib/custom-field-events";
import { TaskEditModal } from "@/components/TaskEditModal";
import { quickAddToTaskInput } from "@/lib/quick-add-input";
import { hasDuplicateSectionName } from "@/lib/section-names";
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

const PROJECT_VIEWS = ["overview", "list", "board", "calendar", "timeline"] as const;
type ProjectView = (typeof PROJECT_VIEWS)[number];

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
  customFields?: CustomFieldDef[];
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
  const viewKey = `taskflow-project-view:${projectId}`;
  const [view, setViewState] = useState<ProjectView>("board");
  useEffect(() => {
    const saved = window.localStorage.getItem(viewKey);
    if (saved && (PROJECT_VIEWS as readonly string[]).includes(saved)) setViewState(saved as ProjectView);
  }, [viewKey]);
  const setView = (next: ProjectView) => {
    setViewState(next);
    window.localStorage.setItem(viewKey, next);
  };
  const [refreshKey, setRefreshKey] = useState(0);
  const [membersOpen, setMembersOpen] = useState(false);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [fieldFilter, setFieldFilter] = useState<CustomFieldFilter | null>(null);
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

  useEffect(() => {
    const onFieldsChanged = () => setRefreshKey((value) => value + 1);
    window.addEventListener(CUSTOM_FIELDS_CHANGED_EVENT, onFieldsChanged);
    return () => window.removeEventListener(CUSTOM_FIELDS_CHANGED_EVENT, onFieldsChanged);
  }, []);

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
    if (hasDuplicateSectionName(project?.sections ?? [], name, sectionId)) {
      if (!window.confirm(`A section named “${name.trim()}” already exists in this project. Use this name anyway?`)) {
        refresh();
        return;
      }
    }
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
    if (hasDuplicateSectionName(project?.sections ?? [], name)) {
      if (!window.confirm(`A section named “${name}” already exists in this project. Add another one anyway?`)) return;
    }
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
    if (!project || !confirm(`Move “${project.name}” to Trash? Its tasks stay hidden until you restore the project.`)) return;
    const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Could not delete project");
      return;
    }
    toast.success("Moved to Trash");
    router.push("/dashboard/projects");
  };

  const quickAddToSection = async (sectionId: string, text: string) => {
    if (!project || !access?.canEdit) return;
    const input = quickAddToTaskInput(text);
    if (!input) return;
    try {
      await saveTaskWithOptionalTimer(
        { ...input, workspaceId: project.workspaceId, projectId: project.id, sectionId },
        null
      );
      toast.success("Task added");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add task");
      throw err;
    }
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
  const customFields = project.customFields ?? [];
  const activeFilter = fieldFilter && customFields.some((f) => f.id === fieldFilter.fieldId) ? fieldFilter : null;
  const listTasks =
    view === "list" && activeFilter
      ? tasks.filter((task) => matchesCustomFieldFilter(customFields, task.customFieldValues, activeFilter))
      : tasks;

  return (
    <div>
      <PageHeader
        eyebrow={project.workspace.name}
        title={project.name}
        subtitle={project.description || "Tasks grouped by section"}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div role="tablist" aria-label="Project views" className="flex flex-wrap items-center gap-1">
              {([
                ["overview", "Overview", LayoutDashboard],
                ["list", "List", LayoutList],
                ["board", "Board", Columns3],
                ["calendar", "Calendar", CalendarDays],
                ["timeline", "Timeline", GanttChart],
              ] as const).map(([key, label, Icon]) => (
                <Button
                  key={key}
                  role="tab"
                  aria-selected={view === key}
                  variant={view === key ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => setView(key)}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Button>
              ))}
            </div>
            <Button variant="secondary" size="sm" onClick={() => setMembersOpen(true)}>
              <Users className="h-4 w-4" />
              Members
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setFieldsOpen(true)}>
              <SlidersHorizontal className="h-4 w-4" />
              Fields
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

      {!readOnly && (view === "list" || view === "board") && (
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

      {view === "overview" && (
        <ProjectOverview tasks={tasks} sections={project.sections} color={project.color} onOpenSection={() => setView("list")} />
      )}
      {view === "calendar" && <ProjectCalendar tasks={tasks} onOpen={(task) => { setEditingTask(task); setFormOpen(true); }} />}
      {view === "timeline" && <ProjectTimeline tasks={tasks} sections={project.sections} onOpen={(task) => { setEditingTask(task); setFormOpen(true); }} />}

      {view === "list" && customFields.length > 0 && (
        <CustomFieldFilterBar
          fields={customFields}
          filter={activeFilter}
          onChange={setFieldFilter}
          shown={listTasks.length}
          total={tasks.length}
        />
      )}

      {(view === "list" || view === "board") && (
      <ProjectBoard
        layout={view}
        sections={project.sections}
        tasks={listTasks}
        customFields={customFields}
        readOnly={readOnly}
        onTasksChange={(next) => {
          // Filtered list passes back only the visible tasks; merge so hidden ones are kept.
          const byId = new Map(next.map((task) => [task.id, task]));
          setTasks((prev) => prev.map((task) => byId.get(task.id) ?? task));
        }}
        onMove={moveTask}
        onEdit={(task) => {
          setEditingTask(task);
          setFormOpen(true);
        }}
        onDelete={(task) => { void deleteTask(task); }}
        onToggleComplete={(task) => { void toggleComplete(task); }}
        onQuickAdd={readOnly ? undefined : quickAddToSection}
        onAddTask={(sectionId) => {
          setEditingTask(null);
          setCreateSectionId(sectionId);
          setFormOpen(true);
        }}
        onRenameSection={renameSection}
        projectId={project.id}
        onDeleteSection={(sectionId) => {
          const ordered = [...project.sections].sort((a, b) => a.position - b.position);
          const target = ordered.find((item) => item.id !== sectionId);
          const doomed = ordered.find((item) => item.id === sectionId);
          const count = tasks.filter((task) => task.sectionId === sectionId).length;
          const message = count > 0
            ? `Delete “${doomed?.name ?? "this section"}”? Its ${count} task${count === 1 ? "" : "s"} will move to “${target?.name ?? "another section"}”.`
            : `Delete “${doomed?.name ?? "this section"}”?`;
          if (!confirm(message)) return;
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
      )}

      <ProjectMembersDialog
        isOpen={membersOpen}
        onClose={() => setMembersOpen(false)}
        projectId={project.id}
        workspaceId={project.workspaceId}
        members={project.members}
        canManage={access.canManage}
        onChanged={refresh}
      />

      <ProjectCustomFieldsDialog
        isOpen={fieldsOpen}
        onClose={() => setFieldsOpen(false)}
        projectId={project.id}
        fields={customFields}
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
        onSaved={refresh}
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
