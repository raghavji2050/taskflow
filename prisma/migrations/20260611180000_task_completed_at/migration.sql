-- AlterTable
ALTER TABLE `Task` ADD COLUMN `completedAt` DATETIME(3) NULL;

-- Backfill completion time for existing completed tasks
UPDATE `Task` SET `completedAt` = `updatedAt` WHERE `status` = 'COMPLETED' AND `completedAt` IS NULL;
