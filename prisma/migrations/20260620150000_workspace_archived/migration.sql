-- AlterTable
ALTER TABLE `Workspace` ADD COLUMN `archivedAt` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `Workspace_archivedAt_idx` ON `Workspace`(`archivedAt`);
