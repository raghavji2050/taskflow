-- Day 27: billing-ready workspace plans (Stripe). Additive only.
ALTER TABLE `Workspace`
    ADD COLUMN `plan` ENUM('FREE', 'PRO', 'BUSINESS') NOT NULL DEFAULT 'FREE',
    ADD COLUMN `planStatus` VARCHAR(32) NULL,
    ADD COLUMN `planPeriodEnd` DATETIME(3) NULL,
    ADD COLUMN `stripeCustomerId` VARCHAR(255) NULL,
    ADD COLUMN `stripeSubscriptionId` VARCHAR(255) NULL;

CREATE UNIQUE INDEX `Workspace_stripeCustomerId_key` ON `Workspace`(`stripeCustomerId`);
CREATE UNIQUE INDEX `Workspace_stripeSubscriptionId_key` ON `Workspace`(`stripeSubscriptionId`);
