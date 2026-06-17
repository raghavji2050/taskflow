"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { formatMomDueDate, formatMomTimeRange } from "@/lib/document-ui";
import { normalizeMomContent, type MomStructuredContent } from "@/lib/mom-structured";

interface MomDetail {
  id: string;
  documentId: string;
  title: string;
  startedAt: string;
  endedAt: string | null;
  points?: string[];
  content?: MomStructuredContent | null;
  attendeesLabel: string;
  canEdit: boolean;
  workspaceId?: string | null;
}

interface MomQuickModalProps {
  momId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated?: () => void;
}

function MomStructuredView({ content }: { content: MomStructuredContent }) {
  const c = normalizeMomContent(content);
  return (
    <div className="space-y-4 text-sm">
      {(c.location || c.organizer) && (
        <div className="grid gap-1 text-xs text-[var(--muted)]">
          {c.location && <p>Location: {c.location}</p>}
          {c.organizer && <p>Organizer: {c.organizer}</p>}
        </div>
      )}
      {c.agenda.length > 0 && (
        <section>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Agenda</h4>
          <ol className="list-decimal space-y-0.5 pl-5">
            {c.agenda.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </section>
      )}
      {c.discussions.length > 0 && (
        <section>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Discussion
          </h4>
          {c.discussions.map((d) => (
            <div key={d.id} className="mb-2">
              {d.topic && <p className="font-medium">{d.topic}</p>}
              <ul className="list-disc pl-5">
                {d.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
      {c.decisions.length > 0 && (
        <section>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Decisions
          </h4>
          <ul className="list-disc pl-5">
            {c.decisions.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </section>
      )}
      {c.actionItems.length > 0 && (
        <section>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Action items
          </h4>
          <div className="overflow-x-auto rounded-lg border border-[var(--card-border)]">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead className="bg-[var(--surface-hover)] text-[var(--muted)]">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Task</th>
                  <th className="px-2 py-1.5 font-medium">Owner</th>
                  <th className="px-2 py-1.5 font-medium">Due</th>
                  <th className="px-2 py-1.5 font-medium">Priority</th>
                  <th className="px-2 py-1.5 font-medium">Status</th>
                  <th className="px-2 py-1.5 font-medium">Linked</th>
                </tr>
              </thead>
              <tbody>
                {c.actionItems.map((item) => (
                  <tr key={item.id} className="border-t border-[var(--card-border)]">
                    <td className="px-2 py-1.5">{item.task}</td>
                    <td className="px-2 py-1.5">{item.owner || "—"}</td>
                    <td className="px-2 py-1.5">{item.dueDate ? formatMomDueDate(item.dueDate) : "—"}</td>
                    <td className="px-2 py-1.5 capitalize">{item.priority}</td>
                    <td className="px-2 py-1.5 capitalize">{item.status.replace("_", " ")}</td>
                    <td className="px-2 py-1.5">
                      {item.taskId ? (
                        <span className="font-medium text-[var(--accent)]">Linked</span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {c.risks.length > 0 && (
        <section>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Risks / blockers
          </h4>
          <ul className="list-disc pl-5">
            {c.risks.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
      )}
      {c.pendingItems.length > 0 && (
        <section>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Pending
          </h4>
          <ul className="list-disc pl-5">
            {c.pendingItems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>
      )}
      {(c.nextMeetingDate || c.nextMeetingAgenda) && (
        <section>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Next meeting
          </h4>
          {c.nextMeetingDate && (
            <p className="text-xs text-[var(--muted)]">
              Date: {new Date(c.nextMeetingDate).toLocaleDateString()}
            </p>
          )}
          {c.nextMeetingAgenda && <p className="text-sm">{c.nextMeetingAgenda}</p>}
        </section>
      )}
    </div>
  );
}

function tasksListHref(workspaceId?: string | null) {
  if (workspaceId) {
    return `/dashboard?workspaceId=${workspaceId}`;
  }
  return "/dashboard";
}

export function MomQuickModal({ momId, isOpen, onClose, onUpdated }: MomQuickModalProps) {
  const [loading, setLoading] = useState(false);
  const [creatingTasks, setCreatingTasks] = useState(false);
  const [mom, setMom] = useState<MomDetail | null>(null);

  const load = useCallback(async () => {
    if (!momId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/meeting-minutes/${momId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load MoM");
      setMom(data.mom as MomDetail);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load MoM");
      onClose();
    } finally {
      setLoading(false);
    }
  }, [momId, onClose]);

  useEffect(() => {
    if (isOpen && momId) void load();
    if (!isOpen) setMom(null);
  }, [isOpen, momId, load]);

  const actionItems = useMemo(
    () => (mom?.content ? normalizeMomContent(mom.content).actionItems : []),
    [mom?.content]
  );

  const unlinkedCount = useMemo(
    () => actionItems.filter((item) => !item.taskId && item.createTask !== false).length,
    [actionItems]
  );

  const allLinked = actionItems.length > 0 && unlinkedCount === 0;

  const createTasks = async () => {
    if (!momId || !mom) return;
    setCreatingTasks(true);
    try {
      const res = await fetch(`/api/meeting-minutes/${momId}/tasks`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create tasks");

      const count = data.created?.length ?? 0;
      if (count === 0) {
        toast.info("No new tasks to create");
      } else {
        toast.success(
          `${count} task${count === 1 ? "" : "s"} created`,
          {
            action: {
              label: "View tasks",
              onClick: () => {
                window.location.href = tasksListHref(mom.workspaceId);
              },
            },
          }
        );
      }
      await load();
      onUpdated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create tasks");
    } finally {
      setCreatingTasks(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Minutes of meeting" size="lg">
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--muted)]" />
        </div>
      ) : mom ? (
        <div className="space-y-4">
          <div className="sticky top-0 z-10 -mx-5 border-b border-[var(--card-border)] bg-[var(--card)] px-5 py-3 sm:-mx-6 sm:px-6">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">{mom.title}</h3>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              {formatMomTimeRange(mom.startedAt, mom.endedAt)}
            </p>
            {mom.attendeesLabel !== "—" && (
              <p className="mt-1 text-xs text-[var(--foreground)]">Attendees: {mom.attendeesLabel}</p>
            )}
            <Link
              href={`/dashboard/docs/${mom.documentId}`}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline"
            >
              Open full MoM in Docs
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>

          {mom.content ? (
            <MomStructuredView content={mom.content} />
          ) : (
            <div>
              <p className="mb-2 text-xs font-medium text-[var(--muted)]">Points covered</p>
              <ul className="list-disc space-y-1.5 pl-5 text-sm">
                {(mom.points ?? []).map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--card-border)] pt-4">
            <div className="text-xs text-[var(--muted)]">
              {actionItems.length === 0 ? (
                <span>No action items in this MoM</span>
              ) : allLinked ? (
                <span>All action items linked to tasks</span>
              ) : mom.canEdit ? (
                <span>{unlinkedCount} action item{unlinkedCount === 1 ? "" : "s"} ready to link</span>
              ) : null}
            </div>
            <div className="flex gap-2">
              {mom.canEdit && actionItems.length > 0 && !allLinked && (
                <Button
                  type="button"
                  onClick={() => void createTasks()}
                  isLoading={creatingTasks}
                  disabled={creatingTasks || unlinkedCount === 0}
                >
                  Create tasks
                </Button>
              )}
              <Button type="button" variant="secondary" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
