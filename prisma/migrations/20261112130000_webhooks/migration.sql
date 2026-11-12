-- CreateTable
CREATE TABLE `Webhook` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `url` VARCHAR(500) NOT NULL,
    `secret` VARCHAR(80) NOT NULL,
    `events` VARCHAR(200) NOT NULL,
    `description` VARCHAR(200) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `failureCount` INTEGER NOT NULL DEFAULT 0,
    `lastDeliveryAt` DATETIME(3) NULL,
    `lastStatus` INTEGER NULL,
    `disabledReason` VARCHAR(200) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Webhook_workspaceId_active_idx`(`workspaceId`, `active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WebhookDelivery` (
    `id` VARCHAR(191) NOT NULL,
    `webhookId` VARCHAR(191) NOT NULL,
    `event` VARCHAR(40) NOT NULL,
    `status` INTEGER NULL,
    `ok` BOOLEAN NOT NULL DEFAULT false,
    `durationMs` INTEGER NULL,
    `error` VARCHAR(300) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WebhookDelivery_webhookId_createdAt_idx`(`webhookId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Webhook` ADD CONSTRAINT `Webhook_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WebhookDelivery` ADD CONSTRAINT `WebhookDelivery_webhookId_fkey` FOREIGN KEY (`webhookId`) REFERENCES `Webhook`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

