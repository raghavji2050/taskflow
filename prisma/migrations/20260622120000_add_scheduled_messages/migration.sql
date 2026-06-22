-- CreateTable
CREATE TABLE `ScheduledMessage` (
    `id` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `parentId` VARCHAR(191) NULL,
    `scheduledFor` DATETIME(3) NOT NULL,
    `timezone` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'SENT', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `sentAt` DATETIME(3) NULL,
    `messageId` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ScheduledMessage_messageId_key`(`messageId`),
    INDEX `ScheduledMessage_scheduledFor_status_idx`(`scheduledFor`, `status`),
    INDEX `ScheduledMessage_userId_status_idx`(`userId`, `status`),
    INDEX `ScheduledMessage_conversationId_status_idx`(`conversationId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ScheduledMessageAttachment` (
    `id` VARCHAR(191) NOT NULL,
    `scheduledMessageId` VARCHAR(191) NOT NULL,
    `filename` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `size` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ScheduledMessageAttachment_scheduledMessageId_idx`(`scheduledMessageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ScheduledMessage` ADD CONSTRAINT `ScheduledMessage_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduledMessage` ADD CONSTRAINT `ScheduledMessage_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduledMessage` ADD CONSTRAINT `ScheduledMessage_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `Message`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduledMessage` ADD CONSTRAINT `ScheduledMessage_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `Message`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduledMessageAttachment` ADD CONSTRAINT `ScheduledMessageAttachment_scheduledMessageId_fkey` FOREIGN KEY (`scheduledMessageId`) REFERENCES `ScheduledMessage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
