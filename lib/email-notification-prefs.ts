import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

export const emailNotificationPrefsSchema = z.object({
  emailDigestEnabled: z.boolean(),
  emailMentionEnabled: z.boolean(),
});

export type EmailNotificationPrefs = z.infer<typeof emailNotificationPrefsSchema>;

export const emailNotificationPrefsUpdateSchema = emailNotificationPrefsSchema.partial();

export function defaultEmailNotificationPrefs(): EmailNotificationPrefs {
  return { emailDigestEnabled: true, emailMentionEnabled: true };
}

export async function getEmailNotificationPrefs(
  userId: string
): Promise<EmailNotificationPrefs> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailDigestEnabled: true, emailMentionEnabled: true },
  });
  if (!user) return defaultEmailNotificationPrefs();
  return {
    emailDigestEnabled: user.emailDigestEnabled,
    emailMentionEnabled: user.emailMentionEnabled,
  };
}

export async function updateEmailNotificationPrefs(
  userId: string,
  input: Partial<EmailNotificationPrefs>
): Promise<EmailNotificationPrefs> {
  const data = emailNotificationPrefsUpdateSchema.parse(input);
  if (Object.keys(data).length === 0) {
    return getEmailNotificationPrefs(userId);
  }
  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: { emailDigestEnabled: true, emailMentionEnabled: true },
  });
  return {
    emailDigestEnabled: user.emailDigestEnabled,
    emailMentionEnabled: user.emailMentionEnabled,
  };
}

/**
 * Load prefs + email and send a mention email when enabled.
 * Never throws — logs and returns so callers (comment/chat APIs) stay resilient.
 */
export async function maybeSendMentionEmail(params: {
  userId: string;
  subject: string;
  html: string;
}): Promise<{ sent: boolean; skipped?: string }> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { email: true, emailMentionEnabled: true },
    });
    if (!user) return { sent: false, skipped: "user_not_found" };
    if (!user.emailMentionEnabled) return { sent: false, skipped: "prefs_disabled" };
    await sendEmail(user.email, params.subject, params.html);
    return { sent: true };
  } catch (error) {
    console.warn("[Email] mention send failed:", error);
    return { sent: false, skipped: "send_failed" };
  }
}
