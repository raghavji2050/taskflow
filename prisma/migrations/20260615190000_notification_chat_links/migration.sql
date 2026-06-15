-- AlterTable
ALTER TABLE `Notification` ADD COLUMN `conversationId` VARCHAR(191) NULL,
    ADD COLUMN `messageId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Notification_conversationId_idx` ON `Notification`(`conversationId`);
