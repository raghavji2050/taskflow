-- AlterTable
ALTER TABLE `User` ADD COLUMN `lastSeenAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `ConversationParticipant` ADD COLUMN `mutedUntil` DATETIME(3) NULL;
