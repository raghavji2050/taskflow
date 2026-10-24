import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { getTimeTrackingPrefs } from "@/lib/time-tracking-prefs";
import { getEntryElapsedSeconds, shouldSendRunningReminder } from "@/lib/time-reminder";
import { formatDurationShort } from "@/lib/time-format";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const running = await prisma.timeEntry.findMany({
    where: { isRunning: true, isPaused: false },
    include: {
      task: { select: { id: true, title: true } },
      user: { select: { id: true, name: true } },
    },
  });

  let sent = 0;
  const prefsByUser = new Map<string, Awaited<ReturnType<typeof getTimeTrackingPrefs>>>();
  const remindedIds: string[] = [];

  try {
    for (const entry of running) {
      let prefs = prefsByUser.get(entry.userId);
      if (!prefs) {
        prefs = await getTimeTrackingPrefs(entry.userId);
        prefsByUser.set(entry.userId, prefs);
      }
      if (
        !shouldSendRunningReminder({
          entry,
          prefs,
          now,
        })
      ) {
        continue;
      }

      const elapsed = getEntryElapsedSeconds(entry, now);
      const body = `Timer on "${entry.task.title}" has been running ${formatDurationShort(elapsed)} — stop or continue?`;

      await createNotification({
        userId: entry.userId,
        title: "Timer still running",
        body,
        type: "timer_still_running",
      });

      remindedIds.push(entry.id);
      sent += 1;
    }
  } finally {
    if (remindedIds.length > 0) {
      await prisma.timeEntry.updateMany({
        where: { id: { in: remindedIds } },
        data: { lastReminderAt: now },
      });
    }
  }

  return NextResponse.json({ checked: running.length, sent });
}
