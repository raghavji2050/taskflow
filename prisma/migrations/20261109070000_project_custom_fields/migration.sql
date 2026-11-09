-- Custom fields per project (text / number / date / dropdown) and per-task values.
CREATE TABLE `ProjectCustomField` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `type` ENUM('TEXT', 'NUMBER', 'DATE', 'DROPDOWN') NOT NULL,
    `options` JSON NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ProjectCustomField_projectId_position_idx`(`projectId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `TaskCustomFieldValue` (
    `taskId` VARCHAR(191) NOT NULL,
    `fieldId` VARCHAR(191) NOT NULL,
    `value` VARCHAR(500) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TaskCustomFieldValue_fieldId_idx`(`fieldId`),
    PRIMARY KEY (`taskId`, `fieldId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ProjectCustomField` ADD CONSTRAINT `ProjectCustomField_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `TaskCustomFieldValue` ADD CONSTRAINT `TaskCustomFieldValue_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `TaskCustomFieldValue` ADD CONSTRAINT `TaskCustomFieldValue_fieldId_fkey` FOREIGN KEY (`fieldId`) REFERENCES `ProjectCustomField`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
