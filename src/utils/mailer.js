
import nodemailer from "nodemailer";

let transporter;

// Escape user input before inserting into HTML email
function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Get SMTP transporter
function getTransporter() {
  if (transporter) return transporter;

  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASSWORD,
  } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD) {
    console.error("[FoundMet] SMTP is not configured");
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

// Get frontend URL
function getAppUrl() {
  return (
    process.env.APP_URL ||
    process.env.FRONTEND_URL ||
    ""
  )
    .split(",")[0]
    .trim()
    .replace(/\/+$/, "");
}

// Send welcome email
export async function sendWelcomeEmail({ email, name }) {
  const mailTransporter = getTransporter();

  if (!mailTransporter) {
    return false;
  }

  const appUrl = getAppUrl();

  if (!appUrl) {
    console.error("[FoundMet] APP_URL is missing");
    return false;
  }

  const safeName = escapeHtml(name);

  try {
    await mailTransporter.sendMail({
      from: `"FoundMet" <${process.env.SMTP_USER}>`,
      to: email,

      subject: "Welcome to FoundMet 🚀",

      text: `Hi ${name},

Welcome to FoundMet!

Your account has been created successfully.

Explore founders and builders:
${appUrl}/explore

Build boldly,
The FoundMet Team`,

      html: `
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to FoundMet</title>
</head>

<body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#172033;">
  <div style="padding:32px 16px;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">

      <div style="padding:32px;background:#0b5cff;color:#ffffff;">
        <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;font-weight:700;">
          FoundMet
        </div>

        <h1 style="margin:18px 0 0;font-size:30px;line-height:1.2;">
          Welcome, ${safeName}! 🚀
        </h1>
      </div>

      <div style="padding:32px;">
        <p style="font-size:17px;line-height:1.6;margin-top:0;">
          Your FoundMet account has been created successfully.
        </p>

        <p style="font-size:16px;line-height:1.6;">
          Discover founders and builders, connect with complementary skills,
          and start building meaningful ideas together.
        </p>

        <p style="margin:28px 0;">
          <a
            href="${appUrl}/explore"
            style="display:inline-block;padding:14px 22px;border-radius:8px;background:#0b5cff;color:#ffffff;text-decoration:none;font-weight:700;"
          >
            Explore Founders
          </a>
        </p>

        <p style="font-size:15px;line-height:1.6;color:#5d687c;margin-bottom:0;">
          Build boldly,<br />
          <strong style="color:#172033;">The FoundMet Team</strong>
        </p>
      </div>

      <div style="padding:20px 32px;background:#f8faff;color:#7b8495;font-size:12px;">
        You received this email because a FoundMet account was created with this address.
      </div>

    </div>
  </div>
</body>
</html>
      `,
    });

    console.log(`[FoundMet] Welcome email sent to ${email}`);

    return true;
  } catch (error) {
    console.error("[FoundMet] Welcome email failed:", {
      message: error.message,
      code: error.code,
      responseCode: error.responseCode,
    });

    return false;
  }
}

// Send connection request email
export async function sendConnectionRequestEmail({
  email,
  recipientName,
  senderName,
  message = "",
}) {
  const mailTransporter = getTransporter();

  if (!mailTransporter) {
    return false;
  }

  const appUrl = getAppUrl();

  if (!appUrl) {
    console.error("[FoundMet] APP_URL is missing");
    return false;
  }

  // Escape all user-controlled values
  const safeRecipientName = escapeHtml(recipientName);
  const safeSenderName = escapeHtml(senderName);
  const safeMessage = escapeHtml(message);

  try {
    await mailTransporter.sendMail({
      from: `"FoundMet" <${process.env.SMTP_USER}>`,
      to: email,

      subject: `${senderName} wants to connect with you on FoundMet 🚀`,

      text: `Hi ${recipientName},

${senderName} has sent you a connection request on FoundMet.

${
  message
    ? `Message: ${message}\n\n`
    : ""
}You can view and respond to the request from your dashboard:

${appUrl}/dashboard/connections

Build boldly,
The FoundMet Team`,

      html: `
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New Connection Request</title>
</head>

<body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#172033;">
  <div style="padding:32px 16px;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">

      <div style="padding:32px;background:#0b5cff;color:#ffffff;">
        <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;font-weight:700;">
          FoundMet
        </div>

        <h1 style="margin:18px 0 0;font-size:28px;line-height:1.2;">
          New Connection Request 🚀
        </h1>
      </div>

      <div style="padding:32px;">
        <h3 style="margin-top:0;">
          Hi ${safeRecipientName},
        </h3>

        <p style="font-size:16px;line-height:1.6;">
          <strong>${safeSenderName}</strong>
          wants to connect with you on FoundMet.
        </p>

        ${
          message
            ? `
              <div style="padding:16px;background:#f8faff;border-radius:8px;margin:20px 0;">
                <strong>Message:</strong>
                <p style="margin-bottom:0;line-height:1.6;">
                  ${safeMessage}
                </p>
              </div>
            `
            : ""
        }

        <p style="margin:28px 0;">
          <a
            href="${appUrl}/dashboard/connections"
            style="display:inline-block;padding:14px 22px;background:#0b5cff;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;"
          >
            View Connection Request
          </a>
        </p>

        <p style="font-size:15px;line-height:1.6;color:#5d687c;margin-bottom:0;">
          Build boldly,<br />
          <strong style="color:#172033;">The FoundMet Team</strong>
        </p>
      </div>

      <div style="padding:20px 32px;background:#f8faff;color:#7b8495;font-size:12px;">
        You received this email because someone sent you a connection request on FoundMet.
      </div>

    </div>
  </div>
</body>
</html>
      `,
    });

    console.log(
      `[FoundMet] Connection request email sent to ${email}`,
    );

    return true;
  } catch (error) {
    console.error("[FoundMet] Connection email failed:", {
      message: error.message,
      code: error.code,
      responseCode: error.responseCode,
    });

    return false;
  }
}