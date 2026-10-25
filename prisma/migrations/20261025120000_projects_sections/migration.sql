-- CreateTable
CREATE TABLE `Project` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `color` VARCHAR(191) NOT NULL DEFAULT '#6366f1',
    `archived` BOOLEAN NOT NULL DEFAULT false,
    `workspaceId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Project_workspaceId_idx`(`workspaceId`),
    INDEX `Project_workspaceId_archived_idx`(`workspaceId`, `archived`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectMember` (
    `id` VARCHAR(191) NOT NULL,
    `role` ENUM('OWNER', 'ADMIN', 'MEMBER', 'VIEWER') NOT NULL DEFAULT 'MEMBER',
    `userId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `ProjectMember_userId_projectId_key`(`userId`, `projectId`),
    INDEX `ProjectMember_projectId_idx`(`projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectSection` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `projectId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ProjectSection_projectId_idx`(`projectId`),
    INDEX `ProjectSection_projectId_position_idx`(`projectId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectMember` ADD CONSTRAINT `ProjectMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectMember` ADD CONSTRAINT `ProjectMember_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectSection` ADD CONSTRAINT `ProjectSection_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE `Task` ADD COLUMN `projectId` VARCHAR(191) NULL,
    ADD COLUMN `sectionId` VARCHAR(191) NULL;

-- Data migration: one default project and section per workspace, then attach existing tasks.
INSERT INTO `Project` (`id`, `name`, `description`, `color`, `archived`, `workspaceId`, `createdAt`, `updatedAt`)
SELECT
    CONCAT('proj_', w.`id`),
    'General',
    'Default project for existing tasks',
    '#6366f1',
    false,
    w.`id`,
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3)
FROM `Workspace` w;

INSERT INTO `ProjectSection` (`id`, `name`, `position`, `projectId`, `createdAt`, `updatedAt`)
SELECT
    CONCAT('sec_', w.`id`),
    'To do',
    0,
    CONCAT('proj_', w.`id`),
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3)
FROM `Workspace` w;

INSERT INTO `ProjectMember` (`id`, `role`, `userId`, `projectId`)
SELECT
    CONCAT('pm_', wm.`id`),
    CASE wm.`role`
        WHEN 'OWNER' THEN 'OWNER'
        WHEN 'ADMIN' THEN 'ADMIN'
        WHEN 'VIEWER' THEN 'VIEWER'
        ELSE 'MEMBER'
    END,
    wm.`userId`,
    CONCAT('proj_', wm.`workspaceId`)
FROM `WorkspaceMember` wm;

UPDATE `Task` t
INNER JOIN `Workspace` w ON t.`workspaceId` = w.`id`
SET
    t.`projectId` = CONCAT('proj_', w.`id`),
    t.`sectionId` = CONCAT('sec_', w.`id`)
WHERE t.`workspaceId` IS NOT NULL;

-- CreateIndex
CREATE INDEX `Task_projectId_idx` ON `Task`(`projectId`);

-- CreateIndex
CREATE INDEX `Task_sectionId_idx` ON `Task`(`sectionId`);

-- CreateIndex
CREATE INDEX `Task_sectionId_position_idx` ON `Task`(`sectionId`, `position`);

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_sectionId_fkey` FOREIGN KEY (`sectionId`) REFERENCES `ProjectSection`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
