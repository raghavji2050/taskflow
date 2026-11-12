-- CreateIndex
CREATE INDEX `Task_projectId_deletedAt_archived_idx` ON `Task`(`projectId`, `deletedAt`, `archived`);

-- CreateIndex
CREATE INDEX `Task_workspaceId_deletedAt_archived_dueDate_idx` ON `Task`(`workspaceId`, `deletedAt`, `archived`, `dueDate`);

-- CreateIndex
CREATE INDEX `Comment_taskId_parentId_createdAt_idx` ON `Comment`(`taskId`, `parentId`, `createdAt`);

-- CreateIndex
CREATE INDEX `TaskActivity_taskId_createdAt_idx` ON `TaskActivity`(`taskId`, `createdAt`);

-- CreateIndex
CREATE INDEX `Notification_userId_createdAt_idx` ON `Notification`(`userId`, `createdAt`);

