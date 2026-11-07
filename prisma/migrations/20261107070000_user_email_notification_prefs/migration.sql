-- User email notification preferences (digest + @mention emails). Defaults ON.
ALTER TABLE `User` ADD COLUMN `emailDigestEnabled` BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE `User` ADD COLUMN `emailMentionEnabled` BOOLEAN NOT NULL DEFAULT true;
