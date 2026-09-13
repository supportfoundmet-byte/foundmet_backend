import nodemailer from "nodemailer";
import { logInfo, logWarn } from "./logger.js";

let transporter;

function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD) return null;

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: String(SMTP_PORT) === "465",
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });
  return transporter;
}

const escapeHtml = (value) =>
  String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export function welcomeEmailTemplate({ name, appUrl }) {
  const safeName = escapeHtml(name);
  const safeAppUrl = escapeHtml(appUrl);

  return {
    subject: "Welcome to FoundMet — let’s build something meaningful",
    text: `Hi ${name},\n\nWelcome to FoundMet. Your founder profile is live, and you can now discover complementary builders, connect with people nearby, and start conversations around the ideas you want to build.\n\nExplore founders: ${appUrl}/explore\n\nBuild boldly,\nThe FoundMet Team`,
    html: `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#172033;">
    <div style="padding:32px 16px;">
      <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">
        <div style="padding:32px;background:#0b5cff;color:#ffffff;">
          <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;font-weight:700;">FoundMet</div>
          <h1 style="margin:18px 0 0;font-size:30px;line-height:1.2;">Welcome, ${safeName}!</h1>
        </div>
        <div style="padding:32px;">
          <p style="font-size:17px;line-height:1.6;margin-top:0;">Your founder profile is live. You are now part of a community of builders looking for the right people, ideas, and momentum.</p>
          <p style="font-size:16px;line-height:1.6;">Explore founders with complementary skills and shared goals, then send a connection request to begin the conversation.</p>
          <p style="margin:28px 0;"><a href="${safeAppUrl}/explore" style="display:inline-block;padding:14px 22px;border-radius:8px;background:#0b5cff;color:#ffffff;text-decoration:none;font-weight:700;">Explore founders</a></p>
          <p style="font-size:15px;line-height:1.6;color:#5d687c;margin-bottom:0;">Build boldly,<br><strong style="color:#172033;">The FoundMet Team</strong></p>
        </div>
        <div style="padding:20px 32px;background:#f8faff;color:#7b8495;font-size:12px;">You received this email because a FoundMet account was created with this address.</div>
      </div>
    </div>
  </body>
</html>`,
  };
}

export async function sendWelcomeEmail({ email, name }) {
  const mailTransporter = getTransporter();
  if (!mailTransporter) {
    logWarn("welcome_email_not_configured", { email });
    return false;
  }

  const appUrl = (process.env.APP_URL || process.env.FRONTEND_URL || "")
    .split(",")[0]
    .trim()
    .replace(/\/+$/, "");
  if (!appUrl) {
    logWarn("welcome_email_missing_app_url", { email });
    return false;
  }

  const template = welcomeEmailTemplate({ name, appUrl });
  await mailTransporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: email,
    subject: template.subject,
    text: template.text,
    html: template.html,
  });
  logInfo("welcome_email_sent", { email });
  return true;
}