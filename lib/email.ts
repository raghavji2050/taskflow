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

export function appBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.NEXTAUTH_URL?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function passwordResetEmail(name: string, resetUrl: string) {
  return emailLayout(
    "Reset your password",
    `<p>Hi ${escapeHtml(name)},</p><p>Click the button below to reset your TaskFlow password. This link expires in 1 hour.</p>`,
    resetUrl,
    "Reset password"
  );
}

export function verificationEmail(name: string, verifyUrl: string) {
  return emailLayout(
    "Verify your email",
    `<p>Hi ${escapeHtml(name)},</p><p>Please verify your email address to complete your TaskFlow registration.</p>`,
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
    `<p>Hi ${escapeHtml(inviteeName)},</p><p><strong>${escapeHtml(inviterName)}</strong> invited you to join the <strong>${escapeHtml(workspaceName)}</strong> workspace on TaskFlow.</p><p>Open TaskFlow and accept or decline the invitation from your notifications.</p>`,
    dashboardUrl,
    "Open TaskFlow"
  );
}

export type DigestEmailOptions = {
  name: string;
  pending: number;
  overdue: number;
  ready?: number;
  mentions?: number;
  /** Up to ~5 overdue / ready titles to preview */
  taskTitles?: string[];
  myWorkUrl?: string;
};

export function digestEmail(
  nameOrOpts: string | DigestEmailOptions,
  pendingArg?: number,
  overdueArg?: number,
  tasksArg?: string[]
) {
  const opts: DigestEmailOptions =
    typeof nameOrOpts === "string"
      ? {
          name: nameOrOpts,
          pending: pendingArg ?? 0,
          overdue: overdueArg ?? 0,
          taskTitles: tasksArg ?? [],
        }
      : nameOrOpts;

  const myWorkUrl = opts.myWorkUrl ?? `${appBaseUrl()}/dashboard/my-work`;
  const titles = (opts.taskTitles ?? []).slice(0, 5);
  const extras: string[] = [];
  if (typeof opts.ready === "number") {
    extras.push(`<li><strong>${opts.ready}</strong> ready to start</li>`);
  }
  if (typeof opts.mentions === "number" && opts.mentions > 0) {
    extras.push(`<li><strong>${opts.mentions}</strong> unread @mention${opts.mentions === 1 ? "" : "s"}</li>`);
  }
  const listHtml =
    titles.length > 0
      ? `<p style="margin:16px 0 8px;font-weight:600">To look at:</p><ul style="margin:0;padding-left:20px">${titles
          .map((t) => `<li>${escapeHtml(t)}</li>`)
          .join("")}</ul>`
      : "";

  return emailLayout(
    "Your TaskFlow Digest",
    `<p>Hi ${escapeHtml(opts.name)},</p>
      <p>Here's your daily snapshot:</p>
      <ul style="margin:0;padding-left:20px">
        <li><strong>${opts.pending}</strong> pending task${opts.pending === 1 ? "" : "s"}</li>
        <li><strong>${opts.overdue}</strong> overdue</li>
        ${extras.join("")}
      </ul>
      ${listHtml}`,
    myWorkUrl,
    "Open My Work"
  );
}

export function mentionEmail(opts: {
  recipientName: string;
  actorName: string;
  preview: string;
  contextLabel: string;
  actionUrl: string;
  actionLabel?: string;
}) {
  const preview = escapeHtml(opts.preview).slice(0, 280);
  return emailLayout(
    "You were mentioned",
    `<p>Hi ${escapeHtml(opts.recipientName)},</p>
      <p><strong>${escapeHtml(opts.actorName)}</strong> mentioned you ${escapeHtml(opts.contextLabel)}.</p>
      <blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #4f46e5;background:#f4f4f5;color:#3f3f46">${preview || "(no preview)"}</blockquote>`,
    opts.actionUrl,
    opts.actionLabel ?? "Open TaskFlow"
  );
}
