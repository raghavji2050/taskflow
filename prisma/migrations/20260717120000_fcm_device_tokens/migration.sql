-- Migrate from Web Push (endpoint/p256dh/auth) to FCM device tokens.
-- Existing subscriptions are cleared; users must re-enable notifications once.

DELETE FROM `PushSubscription`;

ALTER TABLE `User` DROP COLUMN `pushForegroundAt`;

ALTER TABLE `PushSubscription` DROP INDEX `PushSubscription_endpoint_key`;
ALTER TABLE `PushSubscription` DROP COLUMN `endpoint`;
ALTER TABLE `PushSubscription` DROP COLUMN `p256dh`;
ALTER TABLE `PushSubscription` DROP COLUMN `auth`;

ALTER TABLE `PushSubscription` ADD COLUMN `fcmToken` VARCHAR(512) NOT NULL;
ALTER TABLE `PushSubscription` ADD COLUMN `userAgent` VARCHAR(512) NULL;
ALTER TABLE `PushSubscription` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);

CREATE UNIQUE INDEX `PushSubscription_fcmToken_key` ON `PushSubscription`(`fcmToken`);
