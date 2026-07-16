-- AlterTable
ALTER TABLE `Conversation` ADD COLUMN `inboundToken` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Conversation_inboundToken_key` ON `Conversation`(`inboundToken`);
