-- AlterTable
ALTER TABLE `Notification` ADD COLUMN `archivedAt` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `Notification_userId_archivedAt_idx` ON `Notification`(`userId`, `archivedAt`);
