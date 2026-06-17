-- CreateTable
CREATE TABLE `MomSuggestionPreference` (
    `userId` VARCHAR(191) NOT NULL,
    `scopeKey` VARCHAR(64) NOT NULL,
    `data` JSON NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`userId`, `scopeKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MomSuggestionPreference` ADD CONSTRAINT `MomSuggestionPreference_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
