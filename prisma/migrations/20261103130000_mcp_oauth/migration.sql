-- OAuth 2.1 for the MCP endpoint (dynamic client registration + hashed grants).
CREATE TABLE `OAuthClient` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `redirectUris` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `OAuthClient_clientId_key`(`clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `OAuthGrant` (
    `id` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `redirectUri` VARCHAR(1000) NULL,
    `codeChallenge` VARCHAR(191) NULL,
    `scope` VARCHAR(191) NULL,
    `resource` VARCHAR(1000) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `OAuthGrant_tokenHash_key`(`tokenHash`),
    INDEX `OAuthGrant_userId_idx`(`userId`),
    INDEX `OAuthGrant_clientId_idx`(`clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `OAuthGrant` ADD CONSTRAINT `OAuthGrant_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `OAuthClient`(`clientId`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `OAuthGrant` ADD CONSTRAINT `OAuthGrant_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
