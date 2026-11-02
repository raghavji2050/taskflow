-- Session revocation: JWTs carry the version they were issued with; bumping it signs out every device.
ALTER TABLE `User` ADD COLUMN `sessionVersion` INTEGER NOT NULL DEFAULT 0;
