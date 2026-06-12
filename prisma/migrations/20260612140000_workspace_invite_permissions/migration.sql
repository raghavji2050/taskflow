-- AlterTable
ALTER TABLE `Workspace` ADD COLUMN `allowMemberInvites` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `WorkspaceMember` ADD COLUMN `canInviteMembers` BOOLEAN NOT NULL DEFAULT false;
