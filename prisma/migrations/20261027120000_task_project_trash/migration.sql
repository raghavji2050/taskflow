-- Soft delete for tasks and projects. Rows stay until Trash restore or purge.

ALTER TABLE `Task` ADD COLUMN `deletedAt` DATETIME(3) NULL;
CREATE INDEX `Task_deletedAt_idx` ON `Task`(`deletedAt`);
CREATE INDEX `Task_workspaceId_deletedAt_idx` ON `Task`(`workspaceId`, `deletedAt`);

ALTER TABLE `Project` ADD COLUMN `deletedAt` DATETIME(3) NULL;
CREATE INDEX `Project_deletedAt_idx` ON `Project`(`deletedAt`);
CREATE INDEX `Project_workspaceId_deletedAt_idx` ON `Project`(`workspaceId`, `deletedAt`);
