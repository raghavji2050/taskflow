import { PrismaClient, Priority, TaskStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash("password123", 12);

  const user = await prisma.user.upsert({
    where: { email: "demo@todo.app" },
    update: {},
    create: {
      name: "Demo User",
      email: "demo@todo.app",
      password,
      emailVerified: new Date(),
      role: "USER",
    },
  });

  await prisma.user.upsert({
    where: { email: "admin@todo.app" },
    update: {},
    create: {
      name: "Admin User",
      email: "admin@todo.app",
      password,
      emailVerified: new Date(),
      role: "ADMIN",
    },
  });

  const work = await prisma.category.upsert({
    where: { userId_name: { userId: user.id, name: "Work" } },
    update: {},
    create: { name: "Work", color: "#6366f1", userId: user.id },
  });

  const personal = await prisma.category.upsert({
    where: { userId_name: { userId: user.id, name: "Personal" } },
    update: {},
    create: { name: "Personal", color: "#22c55e", userId: user.id },
  });

  const urgentTag = await prisma.tag.upsert({
    where: { userId_name: { userId: user.id, name: "urgent" } },
    update: {},
    create: { name: "urgent", userId: user.id },
  });

  const existingTasks = await prisma.task.count({ where: { userId: user.id } });
  if (existingTasks === 0) {
    const task1 = await prisma.task.create({
      data: {
        title: "Welcome to TaskFlow",
        description: "Explore the dashboard, board, and calendar views.",
        priority: Priority.MEDIUM,
        status: TaskStatus.PENDING,
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        categoryId: work.id,
        userId: user.id,
        position: 1,
        tags: { create: [{ tagId: urgentTag.id }] },
        subtasks: {
          create: [
            { title: "Try kanban board", position: 1 },
            { title: "Set up a category", position: 2, completed: true },
          ],
        },
      },
    });

    await prisma.task.createMany({
      data: [
        {
          title: "Review project requirements",
          description: "Go through the README and API documentation.",
          priority: Priority.HIGH,
          status: TaskStatus.IN_PROGRESS,
          dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
          categoryId: work.id,
          userId: user.id,
          position: 2,
        },
        {
          title: "Set up MySQL database",
          description: "Configure DATABASE_URL and run migrations.",
          priority: Priority.HIGH,
          status: TaskStatus.COMPLETED,
          dueDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
          categoryId: work.id,
          userId: user.id,
          position: 3,
        },
        {
          title: "Update profile settings",
          description: "Visit Settings to update your name and password.",
          priority: Priority.LOW,
          status: TaskStatus.COMPLETED,
          categoryId: personal.id,
          userId: user.id,
          position: 4,
        },
      ],
    });

    await prisma.taskActivity.create({
      data: { taskId: task1.id, action: "created", details: "Seeded demo task" },
    });
  }

  const workspace = await prisma.workspace.findFirst({
    where: { members: { some: { userId: user.id } } },
  });

  if (!workspace) {
    await prisma.workspace.create({
      data: {
        name: "Demo Team",
        members: { create: { userId: user.id, role: "OWNER" } },
      },
    });
  }

  console.log(`Seeded: ${user.email} / password123`);
  console.log(`Admin: admin@todo.app / password123`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
