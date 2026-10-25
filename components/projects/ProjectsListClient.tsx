"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PageLoader } from "@/components/ui/PageLoader";
import { Textarea } from "@/components/ui/Textarea";
import { PROJECT_COLORS } from "@/lib/project-sections";

type ProjectSummary = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  archived: boolean;
  canManage: boolean;
  _count: { tasks: number; members: number; sections: number };
};

export function ProjectsListClient() {
  const router = useRouter();
  const { status } = useSession();
  const { selectedWorkspaceId, selectedWorkspace, isPersonal, canEditTasks } = useWorkspace();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<string>(PROJECT_COLORS[0]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!selectedWorkspaceId) {
      setProjects([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setProjects([]);
    const params = new URLSearchParams({ archived: showArchived ? "all" : "false" });
    const res = await fetch(`/api/workspaces/${selectedWorkspaceId}/projects?${params}`);
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Could not load projects");
      setProjects([]);
    } else {
      setProjects(data.projects ?? []);
    }
    setLoading(false);
  }, [selectedWorkspaceId, showArchived]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") void load();
  }, [status, load]);

  const createProject = async () => {
    if (!selectedWorkspaceId || !name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/workspaces/${selectedWorkspaceId}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null, color }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create project");
      setIsOpen(false);
      setName("");
      setDescription("");
      setColor(PROJECT_COLORS[0]);
      router.push(`/dashboard/projects/${data.project.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create project");
    } finally {
      setSaving(false);
    }
  };

  if (status === "loading" || (status === "authenticated" && loading && projects.length === 0 && selectedWorkspaceId)) {
    return <PageLoader />;
  }

  return (
    <div>
      <PageHeader
        eyebrow={isPersonal ? "Personal" : selectedWorkspace?.name}
        title="Projects"
        subtitle={isPersonal
          ? "Choose a workspace to organize its tasks into projects."
          : "Group work into projects, then arrange tasks by section."}
        actions={!isPersonal && canEditTasks ? (
          <Button onClick={() => setIsOpen(true)}>
            <Plus className="h-4 w-4" />
            New project
          </Button>
        ) : undefined}
      />

      {!isPersonal && selectedWorkspaceId && (
        <label className="mb-4 flex items-center gap-2 text-sm text-[var(--muted)]">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />
          Show archived
        </label>
      )}

      {isPersonal || !selectedWorkspaceId ? (
        <div className="rounded-xl border border-dashed border-[var(--card-border)] py-16 text-center text-sm text-[var(--muted)]">
          Switch to a workspace from the sidebar to see its projects.
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--card-border)] py-16 text-center text-sm text-[var(--muted)]">
          No projects yet.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/dashboard/projects/${project.id}`}
              className="surface-panel block rounded-2xl border border-[var(--border)] p-4 transition-shadow hover:shadow-md"
              style={{ borderTopWidth: 3, borderTopColor: project.color }}
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="truncate text-base font-semibold">{project.name}</h2>
                {project.archived && (
                  <span className="rounded-full bg-[var(--surface-hover)] px-2 py-0.5 text-[10px] font-medium uppercase text-[var(--muted)]">
                    Archived
                  </span>
                )}
              </div>
              {project.description && (
                <p className="mt-1 line-clamp-2 text-sm text-[var(--muted)]">{project.description}</p>
              )}
              <p className="mt-3 text-xs text-[var(--muted)]">
                {project._count.tasks} tasks · {project._count.sections} sections · {project._count.members} members
              </p>
            </Link>
          ))}
        </div>
      )}

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="New project"
        description={`In ${selectedWorkspace?.name ?? "this workspace"}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button onClick={() => { void createProject(); }} isLoading={saving} disabled={!name.trim()}>
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input label="Name" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} />
          <Textarea label="Description" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
          <div>
            <p className="mb-2 text-sm font-medium">Color</p>
            <div className="flex flex-wrap gap-2">
              {PROJECT_COLORS.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  aria-label={`Use color ${swatch}`}
                  onClick={() => setColor(swatch)}
                  className="h-7 w-7 rounded-full border-2"
                  style={{
                    backgroundColor: swatch,
                    borderColor: color === swatch ? "var(--foreground)" : "transparent",
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
