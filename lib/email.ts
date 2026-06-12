import nodemailer from "nodemailer";

const transporter =
  process.env.SMTP_HOST && process.env.SMTP_USER
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === "true",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      })
    : null;

export async function sendEmail(to: string, subject: string, html: string) {
  const from = process.env.EMAIL_FROM ?? "noreply@taskflow.app";

  if (!transporter) {
    console.log(`[Email Dev] To: ${to} | Subject: ${subject}`);
    console.log(html);
    return { success: true, dev: true };
  }

  await transporter.sendMail({ from, to, subject, html });
  return { success: true, dev: false };
}

export function passwordResetEmail(name: string, resetUrl: string) {
  return `
    <h2>Password Reset</h2>
    <p>Hi ${name},</p>
    <p>Click the link below to reset your password. This link expires in 1 hour.</p>
    <a href="${resetUrl}">${resetUrl}</a>
  `;
}

export function verificationEmail(name: string, verifyUrl: string) {
  return `
    <h2>Verify your email</h2>
    <p>Hi ${name},</p>
    <p>Please verify your email by clicking the link below.</p>
    <a href="${verifyUrl}">${verifyUrl}</a>
  `;
}

export function digestEmail(name: string, pending: number, overdue: number, tasks: string[]) {
  return `
    <h2>Your TaskFlow Digest</h2>
    <p>Hi ${name},</p>
    <p>You have <strong>${pending}</strong> pending tasks and <strong>${overdue}</strong> overdue.</p>
    <ul>${tasks.map((t) => `<li>${t}</li>`).join("")}</ul>
  `;
}
