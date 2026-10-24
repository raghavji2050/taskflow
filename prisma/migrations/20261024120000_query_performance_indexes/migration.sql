-- Indexes for hot list, digest, archive, chat, and time-report filters.

CREATE INDEX `Task_userId_workspaceId_archived_idx` ON `Task`(`userId`, `workspaceId`, `archived`);
CREATE INDEX `Task_workspaceId_archived_idx` ON `Task`(`workspaceId`, `archived`);
CREATE INDEX `Task_status_archived_completedAt_idx` ON `Task`(`status`, `archived`, `completedAt`);
CREATE INDEX `Task_archived_status_dueDate_idx` ON `Task`(`archived`, `status`, `dueDate`);

CREATE INDEX `WorkspaceMember_workspaceId_idx` ON `WorkspaceMember`(`workspaceId`);

CREATE INDEX `Message_conversationId_deletedAt_createdAt_idx` ON `Message`(`conversationId`, `deletedAt`, `createdAt`);

CREATE INDEX `Notification_userId_conversationId_type_read_idx` ON `Notification`(`userId`, `conversationId`, `type`, `read`);

CREATE INDEX `Document_userId_workspaceId_archived_idx` ON `Document`(`userId`, `workspaceId`, `archived`);
CREATE INDEX `Document_workspaceId_archived_parentId_idx` ON `Document`(`workspaceId`, `archived`, `parentId`);

CREATE INDEX `TimeEntry_userId_isRunning_startTime_idx` ON `TimeEntry`(`userId`, `isRunning`, `startTime`);
CREATE INDEX `TimeEntry_taskId_isRunning_startTime_idx` ON `TimeEntry`(`taskId`, `isRunning`, `startTime`);
