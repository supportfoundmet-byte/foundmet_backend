import nodemailer from "nodemailer";

let transporter;

function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,

    auth: {
      user: SMTP_USER,
      pass: SMTP_PASSWORD,
    },
  });

  return transporter;
}

export async function sendWelcomeEmail({ email, name }) {
  const mailTransporter = getTransporter();

  if (!mailTransporter) {
    console.log("SMTP is not configured");
    return false;
  }

  const appUrl = (process.env.APP_URL || process.env.FRONTEND_URL || "")
    .split(",")[0]
    .trim()
    .replace(/\/+$/, "");

  try {
    await mailTransporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: email,

      subject: "Welcome to FoundMet 🚀",

      text: `Hi ${name},

Welcome to FoundMet!

Your account has been created successfully.

Explore FoundMet:
${appUrl}/explore

Build boldly,
The FoundMet Team`,
    });

    console.log(`Welcome email sent to ${email}`);

    return true;
  } catch (error) {
    console.error("Welcome email failed:", error.message);

    return false;
  }
}
