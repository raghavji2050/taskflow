import { prisma } from "@/lib/prisma";

export async function logTaskActivity(taskId: string, action: string, details?: string) {
  await prisma.taskActivity.create({
    data: { taskId, action, details },
  });
}
