-- ConversationRole + group admin fields + activity log
ALTER TABLE `ConversationParticipant` ADD COLUMN `role` ENUM('OWNER', 'ADMIN', 'MEMBER') NOT NULL DEFAULT 'MEMBER';

UPDATE `ConversationParticipant` cp
INNER JOIN `Conversation` c ON c.id = cp.conversationId
SET cp.role = 'OWNER'
WHERE c.type = 'GROUP' AND c.createdById = cp.userId;

ALTER TABLE `Message` ADD COLUMN `systemKind` VARCHAR(191) NULL;

CREATE TABLE `ConversationActivity` (
    `id` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `actorUserId` VARCHAR(191) NULL,
    `targetUserId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `details` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ConversationActivity_conversationId_createdAt_idx`(`conversationId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ConversationActivity` ADD CONSTRAINT `ConversationActivity_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ConversationActivity` ADD CONSTRAINT `ConversationActivity_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `ConversationActivity` ADD CONSTRAINT `ConversationActivity_targetUserId_fkey` FOREIGN KEY (`targetUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
