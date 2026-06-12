import nodemailer from "nodemailer";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", ".env");

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^"|"$/g, "");
  }
}

const { SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_PORT, SMTP_SECURE, EMAIL_FROM } = process.env;
const to = process.argv[2] || SMTP_USER;

if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
  console.error("Missing SMTP_HOST, SMTP_USER, or SMTP_PASS in .env");
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT ?? 587),
  secure: SMTP_SECURE === "true",
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

try {
  await transporter.verify();
  console.log("SMTP connection OK");

  const info = await transporter.sendMail({
    from: EMAIL_FROM || SMTP_USER,
    to,
    subject: "TaskFlow SMTP test",
    html: "<p>If you received this, forgot-password email is configured correctly.</p>",
  });

  console.log("Test email sent:", info.messageId);
  console.log("To:", to);
} catch (error) {
  console.error("SMTP test failed:", error.message);
  process.exit(1);
}
