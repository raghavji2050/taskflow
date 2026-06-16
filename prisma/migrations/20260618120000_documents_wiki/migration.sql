-- CreateTable
CREATE TABLE `Document` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `body` LONGTEXT NOT NULL,
    `type` ENUM('DOC', 'SOP', 'MEETING_NOTES', 'NOTE') NOT NULL DEFAULT 'DOC',
    `icon` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NULL,
    `parentId` VARCHAR(191) NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `pinned` BOOLEAN NOT NULL DEFAULT false,
    `archived` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Document_userId_idx`(`userId`),
    INDEX `Document_workspaceId_idx`(`workspaceId`),
    INDEX `Document_parentId_idx`(`parentId`),
    INDEX `Document_archived_idx`(`archived`),
    INDEX `Document_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DocumentVersion` (
    `id` VARCHAR(191) NOT NULL,
    `documentId` VARCHAR(191) NOT NULL,
    `versionNumber` INTEGER NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `body` LONGTEXT NOT NULL,
    `changeNote` TEXT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DocumentVersion_documentId_idx`(`documentId`),
    INDEX `DocumentVersion_userId_idx`(`userId`),
    UNIQUE INDEX `DocumentVersion_documentId_versionNumber_key`(`documentId`, `versionNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DocumentComment` (
    `id` VARCHAR(191) NOT NULL,
    `documentId` VARCHAR(191) NOT NULL,
    `versionId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `parentId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DocumentComment_documentId_idx`(`documentId`),
    INDEX `DocumentComment_versionId_idx`(`versionId`),
    INDEX `DocumentComment_parentId_idx`(`parentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DocumentTask` (
    `documentId` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DocumentTask_taskId_idx`(`taskId`),
    PRIMARY KEY (`documentId`, `taskId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DocumentMessage` (
    `documentId` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DocumentMessage_messageId_idx`(`messageId`),
    PRIMARY KEY (`documentId`, `messageId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Document` ADD CONSTRAINT `Document_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Document` ADD CONSTRAINT `Document_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Document` ADD CONSTRAINT `Document_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `Document`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `DocumentVersion` ADD CONSTRAINT `DocumentVersion_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `Document`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `DocumentVersion` ADD CONSTRAINT `DocumentVersion_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `DocumentComment` ADD CONSTRAINT `DocumentComment_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `Document`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `DocumentComment` ADD CONSTRAINT `DocumentComment_versionId_fkey` FOREIGN KEY (`versionId`) REFERENCES `DocumentVersion`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `DocumentComment` ADD CONSTRAINT `DocumentComment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `DocumentComment` ADD CONSTRAINT `DocumentComment_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `DocumentComment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `DocumentTask` ADD CONSTRAINT `DocumentTask_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `Document`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `DocumentTask` ADD CONSTRAINT `DocumentTask_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `DocumentMessage` ADD CONSTRAINT `DocumentMessage_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `Document`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `DocumentMessage` ADD CONSTRAINT `DocumentMessage_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `Message`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
