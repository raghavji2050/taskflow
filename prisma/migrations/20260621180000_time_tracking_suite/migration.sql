-- Time entry pause/reminder fields and time-entry labels
ALTER TABLE `TimeEntry` ADD COLUMN `isPaused` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `TimeEntry` ADD COLUMN `lastReminderAt` DATETIME(3) NULL;
ALTER TABLE `TimeEntry` ADD COLUMN `reminderSnoozedUntil` DATETIME(3) NULL;

CREATE TABLE `TimeEntryLabel` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `color` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NOT NULL,

    INDEX `TimeEntryLabel_userId_idx`(`userId`),
    UNIQUE INDEX `TimeEntryLabel_userId_name_key`(`userId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `TimeEntryTag` (
    `timeEntryId` VARCHAR(191) NOT NULL,
    `labelId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`timeEntryId`, `labelId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TimeEntryLabel` ADD CONSTRAINT `TimeEntryLabel_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TimeEntryTag` ADD CONSTRAINT `TimeEntryTag_timeEntryId_fkey` FOREIGN KEY (`timeEntryId`) REFERENCES `TimeEntry`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TimeEntryTag` ADD CONSTRAINT `TimeEntryTag_labelId_fkey` FOREIGN KEY (`labelId`) REFERENCES `TimeEntryLabel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
