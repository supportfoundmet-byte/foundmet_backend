
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

function getMailFrom() {
  return (
    process.env.MAIL_FROM ||
    process.env.SMTP_FROM ||
    process.env.SMTP_USER ||
    "FoundMet <no-reply@foundmet.app>"
  );
}

function getLogoUrl() {
  const logoUrl = (
    process.env.APP_LOGO_URL ||
    process.env.LOGO_URL ||
    ""
  )
    .trim();

  if (logoUrl) {
    return logoUrl;
  }

  const appUrl = getAppUrl();
  return appUrl ? `${appUrl}/logo.png` : "";
}

function getBrandHeader({ includeLogo = true } = {}) {
  const logoUrl = getLogoUrl();
  const safeLogoUrl = escapeHtml(logoUrl);

  if (includeLogo && logoUrl) {
    return `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;">
        <img
          src="${safeLogoUrl}"
          alt="FoundMet logo"
          style="width:52px;height:52px;border-radius:14px;display:block;border:1px solid rgba(255,255,255,0.18);background:#ffffff;object-fit:cover;"
        />
        <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;font-weight:700;opacity:0.95;">
          FoundMet
        </div>
      </div>
    `;
  }

  return `
    <div style="margin-bottom:18px;">
      <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;font-weight:700;opacity:0.95;">
        FoundMet
      </div>
    </div>
  `;
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
  const brandHeader = getBrandHeader();

  try {
    await mailTransporter.sendMail({
      from: getMailFrom(),
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

<body style="margin:0;background:#eff4ff;font-family:Arial,sans-serif;color:#172033;">
  <div style="padding:32px 16px;">
    <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,0.08);">

      <div style="padding:32px 32px 20px;background:linear-gradient(135deg,#0b5cff 0%,#344df1 100%);color:#ffffff;">
        ${brandHeader}
        <h1 style="margin:0;font-size:30px;line-height:1.2;letter-spacing:-0.03em;">
          Welcome, ${safeName}! 🚀
        </h1>
      </div>

      <div style="padding:32px;">
        <p style="font-size:17px;line-height:1.7;margin-top:0;margin-bottom:16px;">
          Your FoundMet account has been created successfully.
        </p>

        <p style="font-size:16px;line-height:1.7;color:#3d4b63;margin:0 0 24px;">
          Discover founders and builders, connect with complementary skills,
          and start building meaningful ideas together.
        </p>

        <div style="margin:28px 0;">
          <a
            href="${appUrl}/explore"
            style="display:inline-block;padding:14px 24px;border-radius:10px;background:#0b5cff;color:#ffffff;text-decoration:none;font-weight:700;"
          >
            Explore Founders
          </a>
        </div>

        <p style="font-size:15px;line-height:1.7;color:#5d687c;margin:0;">
          Build boldly,<br />
          <strong style="color:#172033;">The FoundMet Team</strong>
        </p>
      </div>

      <div style="padding:20px 32px;background:#f8faff;color:#7b8495;font-size:12px;line-height:1.6;border-top:1px solid #edf2ff;">
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
  const brandHeader = getBrandHeader();

  try {
    await mailTransporter.sendMail({
      from: getMailFrom(),
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

<body style="margin:0;background:#eff4ff;font-family:Arial,sans-serif;color:#172033;">
  <div style="padding:32px 16px;">
    <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,0.08);">

      <div style="padding:32px 32px 20px;background:linear-gradient(135deg,#0b5cff 0%,#344df1 100%);color:#ffffff;">
        ${brandHeader}
        <h1 style="margin:0;font-size:28px;line-height:1.2;letter-spacing:-0.03em;">
          New Connection Request 🚀
        </h1>
      </div>

      <div style="padding:32px;">
        <h3 style="margin:0 0 16px;font-size:22px;line-height:1.4;">
          Hi ${safeRecipientName},
        </h3>

        <p style="font-size:16px;line-height:1.7;margin:0 0 16px;">
          <strong>${safeSenderName}</strong>
          wants to connect with you on FoundMet.
        </p>

        ${
          message
            ? `
              <div style="padding:16px 18px;background:#f8faff;border:1px solid #e7ecff;border-radius:12px;margin:20px 0;">
                <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#68768d;font-weight:700;margin-bottom:8px;">
                  Message
                </div>
                <p style="margin:0;line-height:1.7;color:#24314d;">
                  ${safeMessage}
                </p>
              </div>
            `
            : ""
        }

        <div style="margin:28px 0;">
          <a
            href="${appUrl}/dashboard/connections"
            style="display:inline-block;padding:14px 24px;background:#0b5cff;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:700;"
          >
            View Connection Request
          </a>
        </div>

        <p style="font-size:15px;line-height:1.7;color:#5d687c;margin:0;">
          Build boldly,<br />
          <strong style="color:#172033;">The FoundMet Team</strong>
        </p>
      </div>

      <div style="padding:20px 32px;background:#f8faff;color:#7b8495;font-size:12px;line-height:1.6;border-top:1px solid #edf2ff;">
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