-- AlterTable
ALTER TABLE `ConversationParticipant` ADD COLUMN `archivedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `Message` ADD COLUMN `editedAt` DATETIME(3) NULL,
    ADD COLUMN `deletedAt` DATETIME(3) NULL;
