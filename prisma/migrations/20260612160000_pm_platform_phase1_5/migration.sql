-- TaskAssignee
CREATE TABLE `TaskAssignee` (
    `taskId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `isPrimary` BOOLEAN NOT NULL DEFAULT false,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `assignedById` VARCHAR(191) NULL,

    INDEX `TaskAssignee_userId_idx`(`userId`),
    PRIMARY KEY (`taskId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Migrate existing assignees
INSERT INTO `TaskAssignee` (`taskId`, `userId`, `isPrimary`, `assignedAt`)
SELECT `id`, `assigneeId`, true, NOW(3)
FROM `Task`
WHERE `assigneeId` IS NOT NULL;

-- Drop old assignee column
ALTER TABLE `Task` DROP FOREIGN KEY `Task_assigneeId_fkey`;
ALTER TABLE `Task` DROP COLUMN `assigneeId`;

-- TaskAssignee foreign keys
ALTER TABLE `TaskAssignee` ADD CONSTRAINT `TaskAssignee_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `TaskAssignee` ADD CONSTRAINT `TaskAssignee_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `TaskAssignee` ADD CONSTRAINT `TaskAssignee_assignedById_fkey` FOREIGN KEY (`assignedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Comment threads
ALTER TABLE `Comment` ADD COLUMN `parentId` VARCHAR(191) NULL;
CREATE INDEX `Comment_parentId_idx` ON `Comment`(`parentId`);
ALTER TABLE `Comment` ADD CONSTRAINT `Comment_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `Comment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Workspace roles: ADMIN, VIEWER
ALTER TABLE `WorkspaceMember` MODIFY `role` ENUM('OWNER', 'ADMIN', 'MEMBER', 'VIEWER') NOT NULL DEFAULT 'MEMBER';

-- Automation rules
CREATE TABLE `AutomationRule` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `trigger` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `config` TEXT NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AutomationRule_workspaceId_enabled_idx`(`workspaceId`, `enabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AutomationRule` ADD CONSTRAINT `AutomationRule_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
