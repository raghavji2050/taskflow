-- Telegram daily digest + reply-to-update (done / blocked / snooze). Additive only.
ALTER TABLE `User` ADD COLUMN `telegramChatId` VARCHAR(64) NULL,
    ADD COLUMN `telegramLinkToken` VARCHAR(64) NULL,
    ADD COLUMN `telegramLinkedAt` DATETIME(3) NULL,
    ADD COLUMN `telegramDigestEnabled` BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX `User_telegramChatId_key` ON `User`(`telegramChatId`);
CREATE UNIQUE INDEX `User_telegramLinkToken_key` ON `User`(`telegramLinkToken`);

ALTER TABLE `Task` ADD COLUMN `blockerNote` TEXT NULL,
    ADD COLUMN `blockedAt` DATETIME(3) NULL;

CREATE TABLE `TelegramDigestLog` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `chatId` VARCHAR(64) NOT NULL,
    `telegramMessageId` VARCHAR(32) NULL,
    `taskIdsJson` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TelegramDigestLog_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `TelegramDigestLog_chatId_telegramMessageId_idx`(`chatId`, `telegramMessageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TelegramDigestLog` ADD CONSTRAINT `TelegramDigestLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
