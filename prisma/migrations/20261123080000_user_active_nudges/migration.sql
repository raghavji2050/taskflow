-- Active PM nudges (stale-task + overdue in-app alerts, weekly summary). Additive only; default ON.
ALTER TABLE `User` ADD COLUMN `activeNudgesEnabled` BOOLEAN NOT NULL DEFAULT true;
