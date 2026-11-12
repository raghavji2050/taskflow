-- AlterTable
ALTER TABLE `User` ADD COLUMN `onboardingDismissedAt` DATETIME(3) NULL,
    ADD COLUMN `onboardingUseCase` VARCHAR(16) NULL;

