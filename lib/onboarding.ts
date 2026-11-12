import { prisma } from "@/lib/prisma";
import { visibleTaskWhere } from "@/lib/visible-records";
import { onboardingProgress, onboardingSteps, parseUseCase, sampleTasks, SAMPLE_TASK_MARKER, type UseCase } from "@/lib/onboarding-rules";

export async function getOnboardingState(userId: string) {
  const mine = visibleTaskWhere({ OR: [{ userId }, { assignees: { some: { userId } } }] });
  const [user, taskCount, completedCount, dueDateCount, memberships] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { onboardingDismissedAt: true, onboardingUseCase: true, createdAt: true } }),
    prisma.task.count({ where: mine }),
    prisma.task.count({ where: { AND: [mine, { status: "COMPLETED" }] } }),
    prisma.task.count({ where: { AND: [mine, { dueDate: { not: null } }] } }),
    prisma.workspaceMember.findMany({ where: { userId, workspace: { archivedAt: null } }, select: { workspaceId: true } }),
  ]);
  const wsIds = memberships.map((m) => m.workspaceId);
  const [others, invites, links] = wsIds.length
    ? await Promise.all([
        prisma.workspaceMember.count({ where: { workspaceId: { in: wsIds }, userId: { not: userId } } }),
        prisma.workspaceInvitation.count({ where: { workspaceId: { in: wsIds }, status: "PENDING" } }),
        prisma.workspaceInviteLink.count({ where: { workspaceId: { in: wsIds }, revokedAt: null } }),
      ])
    : [0, 0, 0];
  const useCase = parseUseCase(user?.onboardingUseCase);
  const steps = onboardingSteps({ taskCount, completedCount, dueDateCount, teamWorkspaceCount: wsIds.length, teammateCount: others + invites + links }, useCase);
  const progress = onboardingProgress(steps);
  const dismissed = Boolean(user?.onboardingDismissedAt);
  return { steps, progress, useCase, dismissed, show: !dismissed && !progress.allDone, isNewAccount: taskCount === 0 };
}

export async function updateOnboarding(userId: string, data: { dismissed?: boolean; useCase?: UseCase | null }) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.dismissed !== undefined ? { onboardingDismissedAt: data.dismissed ? new Date() : null } : {}),
      ...(data.useCase !== undefined ? { onboardingUseCase: data.useCase } : {}),
    },
  });
  return getOnboardingState(userId);
}

/** Adds 3 personal sample tasks once (no-op if samples already exist). */
export async function addSampleTasks(userId: string) {
  const existing = await prisma.task.count({ where: visibleTaskWhere({ userId, description: { startsWith: SAMPLE_TASK_MARKER } }) });
  if (existing > 0) return { created: 0 };
  const rows = sampleTasks();
  await prisma.$transaction(rows.map((t, i) => prisma.task.create({ data: { ...t, userId, position: i } })));
  return { created: rows.length };
}
