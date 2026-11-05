-- Task dependencies: taskId is blocked by dependsOnId.
CREATE TABLE `TaskDependency` (
    `taskId` VARCHAR(191) NOT NULL,
    `dependsOnId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TaskDependency_dependsOnId_idx`(`dependsOnId`),
    PRIMARY KEY (`taskId`, `dependsOnId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TaskDependency` ADD CONSTRAINT `TaskDependency_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `TaskDependency` ADD CONSTRAINT `TaskDependency_dependsOnId_fkey` FOREIGN KEY (`dependsOnId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
