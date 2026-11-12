import { prisma } from "@/lib/prisma";
import { canAccessDocument } from "@/lib/documents";
import { searchMessagesGlobal } from "@/lib/messages";
import { visibleProjectWhere, visibleTaskWhere } from "@/lib/visible-records";
import { canAccessTask } from "@/lib/workspace";
import { matchPages, normalizeQuery, rankHits, scoreHit, snippet, type SearchHit } from "@/lib/global-search";

export type GlobalSearchResult = {
  query: string;
  tasks: SearchHit[];
  projects: SearchHit[];
  documents: SearchHit[];
  messages: SearchHit[];
  pages: SearchHit[];
};

const STATUS_LABEL: Record<string, string> = { PENDING: "To do", IN_PROGRESS: "In progress", COMPLETED: "Done" };

/**
 * One search across tasks, projects, docs, messages and app pages, using the same
 * visibility rules as the list endpoints (private projects, workspace membership,
 * trashed records hidden, cleared chats hidden).
 */
export async function globalSearch(userId: string, rawQuery: string, opts: { limit?: number } = {}): Promise<GlobalSearchResult> {
  const query = normalizeQuery(rawQuery);
  const limit = Math.min(Math.max(opts.limit ?? 6, 1), 20);
  const empty: GlobalSearchResult = { query, tasks: [], projects: [], documents: [], messages: [], pages: [] };
  if (!query) return empty;

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId, workspace: { archivedAt: null } },
    select: { workspaceId: true, role: true, workspace: { select: { name: true } } },
  });
  const wsIds = memberships.map((m) => m.workspaceId);
  const wsName = new Map(memberships.map((m) => [m.workspaceId, m.workspace.name]));
  const adminWs = memberships.filter((m) => m.role === "OWNER" || m.role === "ADMIN").map((m) => m.workspaceId);
  const fetchN = limit * 3;

  const [taskRows, projectRows, docRows, msgRows] = await Promise.all([
    prisma.task.findMany({
      where: visibleTaskWhere({
        archived: false,
        AND: [
          { OR: [{ userId, workspaceId: null }, { workspaceId: { in: wsIds } }, { assignees: { some: { userId } } }] },
          { OR: [{ title: { contains: query } }, { description: { contains: query } }] },
        ],
      }),
      select: { id: true, title: true, description: true, status: true, workspaceId: true, project: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: fetchN,
    }),
    wsIds.length
      ? prisma.project.findMany({
          where: visibleProjectWhere({
            workspaceId: { in: wsIds },
            OR: [{ workspaceId: { in: adminWs } }, { members: { some: { userId } } }],
            AND: [{ OR: [{ name: { contains: query } }, { description: { contains: query } }] }],
          }),
          select: { id: true, name: true, description: true, archived: true, workspaceId: true },
          orderBy: { updatedAt: "desc" },
          take: fetchN,
        })
      : Promise.resolve([]),
    prisma.document.findMany({
      where: {
        archived: false,
        OR: [{ userId, workspaceId: null }, { workspaceId: { in: wsIds } }],
        AND: [{ OR: [{ title: { contains: query } }, { body: { contains: query } }] }],
      },
      select: { id: true, title: true, body: true, workspaceId: true },
      orderBy: { updatedAt: "desc" },
      take: fetchN,
    }),
    searchMessagesGlobal(userId, query, limit),
  ]);

  const tasks: SearchHit[] = [];
  for (const t of taskRows) {
    if (!(await canAccessTask(userId, t.id))) continue; // respects private projects
    const where = t.project?.name ?? (t.workspaceId ? wsName.get(t.workspaceId) : null) ?? "Personal";
    tasks.push({
      kind: "task", id: t.id, title: t.title,
      subtitle: `${STATUS_LABEL[t.status] ?? t.status} · ${where}`,
      href: `/dashboard?openTask=${t.id}`,
      score: scoreHit(t.title, query, t.description),
    });
  }

  const projects: SearchHit[] = projectRows.map((p) => ({
    kind: "project", id: p.id, title: p.name,
    subtitle: `${wsName.get(p.workspaceId) ?? "Workspace"}${p.archived ? " · Archived" : ""}`,
    href: `/dashboard/projects/${p.id}`,
    score: scoreHit(p.name, query, p.description),
  }));

  const documents: SearchHit[] = [];
  for (const d of docRows) {
    if (!(await canAccessDocument(userId, d.id))) continue;
    documents.push({
      kind: "document", id: d.id, title: d.title || "Untitled",
      subtitle: snippet(d.body, query) ?? (d.workspaceId ? wsName.get(d.workspaceId) : "Personal") ?? null,
      href: `/dashboard/docs/${d.id}`,
      score: scoreHit(d.title, query, d.body),
    });
  }

  const messages: SearchHit[] = msgRows.map((m) => ({
    kind: "message", id: m.id,
    title: snippet(m.body, query, 90) ?? "Message",
    subtitle: `${m.sender.name ?? "Someone"} · ${m.audience.title ?? "Chat"}`,
    href: `/dashboard/messages?c=${m.conversationId}#msg-${m.id}`,
    score: Math.max(scoreHit(m.body ?? "", query), 1),
  }));

  return {
    query,
    tasks: rankHits(tasks, limit),
    projects: rankHits(projects, limit),
    documents: rankHits(documents, limit),
    messages: messages.slice(0, limit),
    pages: matchPages(query, 4),
  };
}
