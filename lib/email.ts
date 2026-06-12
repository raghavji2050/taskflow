import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  const options: SMTPTransport.Options = {
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user, pass },
  };

  if (process.env.SMTP_TLS_REJECT_UNAUTHORIZED === "false") {
    options.tls = { rejectUnauthorized: false };
  }

  return nodemailer.createTransport(options);
}

const transporter = createTransporter();

export function isEmailConfigured() {
  return !!transporter;
}

export async function sendEmail(to: string, subject: string, html: string) {
  const from = process.env.EMAIL_FROM ?? process.env.SMTP_USER ?? "noreply@taskflow.app";

  if (!transporter) {
    console.log(`[Email Dev] To: ${to} | Subject: ${subject}`);
    console.log(html);
    return { success: true, dev: true as const };
  }

  try {
    await transporter.verify();
    await transporter.sendMail({ from, to, subject, html });
    return { success: true, dev: false as const };
  } catch (error) {
    console.error("[Email] Send failed:", error);
    throw error;
  }
}

function emailLayout(title: string, body: string, actionUrl: string, actionLabel: string) {
  return `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#18181b">
      <h2 style="margin:0 0 16px;font-size:20px">${title}</h2>
      ${body}
      <p style="margin:24px 0">
        <a href="${actionUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">${actionLabel}</a>
      </p>
      <p style="font-size:12px;color:#71717a;word-break:break-all">Or copy this link:<br>${actionUrl}</p>
    </div>
  `;
}

export function passwordResetEmail(name: string, resetUrl: string) {
  return emailLayout(
    "Reset your password",
    `<p>Hi ${name},</p><p>Click the button below to reset your TaskFlow password. This link expires in 1 hour.</p>`,
    resetUrl,
    "Reset password"
  );
}

export function verificationEmail(name: string, verifyUrl: string) {
  return emailLayout(
    "Verify your email",
    `<p>Hi ${name},</p><p>Please verify your email address to complete your TaskFlow registration.</p>`,
    verifyUrl,
    "Verify email"
  );
}

export function workspaceInviteEmail(
  inviteeName: string,
  inviterName: string,
  workspaceName: string,
  dashboardUrl: string
) {
  return emailLayout(
    "You're invited to a workspace",
    `<p>Hi ${inviteeName},</p><p><strong>${inviterName}</strong> invited you to join the <strong>${workspaceName}</strong> workspace on TaskFlow.</p><p>Open TaskFlow and accept or decline the invitation from your notifications.</p>`,
    dashboardUrl,
    "Open TaskFlow"
  );
}

export function digestEmail(name: string, pending: number, overdue: number, tasks: string[]) {
  return `
    <h2>Your TaskFlow Digest</h2>
    <p>Hi ${name},</p>
    <p>You have <strong>${pending}</strong> pending tasks and <strong>${overdue}</strong> overdue.</p>
    <ul>${tasks.map((t) => `<li>${t}</li>`).join("")}</ul>
  `;
}
