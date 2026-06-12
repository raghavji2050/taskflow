-- AlterTable
ALTER TABLE `Notification` ADD COLUMN `type` VARCHAR(191) NOT NULL DEFAULT 'general',
    ADD COLUMN `inviteId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `WorkspaceInvitation` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `inviteeId` VARCHAR(191) NOT NULL,
    `inviterId` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'ACCEPTED', 'DECLINED') NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `WorkspaceInvitation_workspaceId_inviteeId_key`(`workspaceId`, `inviteeId`),
    INDEX `WorkspaceInvitation_inviteeId_status_idx`(`inviteeId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Notification_inviteId_idx` ON `Notification`(`inviteId`);

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_inviteId_fkey` FOREIGN KEY (`inviteId`) REFERENCES `WorkspaceInvitation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkspaceInvitation` ADD CONSTRAINT `WorkspaceInvitation_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkspaceInvitation` ADD CONSTRAINT `WorkspaceInvitation_inviteeId_fkey` FOREIGN KEY (`inviteeId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkspaceInvitation` ADD CONSTRAINT `WorkspaceInvitation_inviterId_fkey` FOREIGN KEY (`inviterId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
