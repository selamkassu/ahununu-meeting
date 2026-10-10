import nodemailer from "nodemailer";

// ─────────────────────────────────────────────
//  Types & Status Interface
// ─────────────────────────────────────────────
export type EmailProviderType = "resend" | "brevo" | "sendgrid" | "smtp" | "gmail" | "none";

export interface EmailDeliveryResult {
  success: boolean;
  provider: EmailProviderType;
  messageId?: string;
  error?: string;
}

export interface EmailStatusInfo {
  configured: boolean;
  provider: EmailProviderType;
  providerName: string;
  senderEmail: string;
  appUrl: string;
  isCloudSafe: boolean; // true for HTTP APIs (port 443) or port 2525
  isRender: boolean;
  renderWarning: string | null;
}

// ─────────────────────────────────────────────
//  Environment & Provider Detection
// ─────────────────────────────────────────────
export function isRenderEnvironment(): boolean {
  return Boolean(
    process.env.RENDER ||
    process.env.RENDER_SERVICE_ID ||
    process.env.RENDER_EXTERNAL_URL ||
    process.env.IS_RENDER
  );
}

export function getAppUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.trim().replace(/\/+$/, "");
  if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL.trim().replace(/\/+$/, "");
  if (process.env.RENDER_EXTERNAL_URL) {
    const raw = process.env.RENDER_EXTERNAL_URL.trim().replace(/\/+$/, "");
    return raw.startsWith("http") ? raw : `https://${raw}`;
  }
  return "http://localhost:5173";
}

export function detectEmailProvider(): { provider: EmailProviderType; name: string; isCloudSafe: boolean } {
  if (process.env.RESEND_API_KEY?.trim()) {
    return { provider: "resend", name: "Resend (HTTP API, Port 443)", isCloudSafe: true };
  }
  if (process.env.BREVO_API_KEY?.trim()) {
    return { provider: "brevo", name: "Brevo / Sendinblue (HTTP API, Port 443)", isCloudSafe: true };
  }
  if (process.env.SENDGRID_API_KEY?.trim()) {
    return { provider: "sendgrid", name: "SendGrid (HTTP API, Port 443)", isCloudSafe: true };
  }
  if (process.env.SMTP_HOST?.trim()) {
    const port = Number(process.env.SMTP_PORT) || 587;
    // Port 2525 is typically not blocked on Render Free tier
    const isCloudSafe = port === 2525 || !isRenderEnvironment();
    return { provider: "smtp", name: `Custom SMTP (${process.env.SMTP_HOST}:${port})`, isCloudSafe };
  }
  if (process.env.GMAIL_USER?.trim() && process.env.GMAIL_APP_PASSWORD?.trim()) {
    // Gmail SMTP uses ports 465/587 which Render Free tier blocks
    const isCloudSafe = !isRenderEnvironment();
    return { provider: "gmail", name: "Gmail SMTP (Nodemailer)", isCloudSafe };
  }
  return { provider: "none", name: "None (Unconfigured)", isCloudSafe: false };
}

export function getActiveSenderEmail(): string {
  if (process.env.EMAIL_FROM?.trim()) return process.env.EMAIL_FROM.trim();
  if (process.env.RESEND_API_KEY?.trim()) return "Ahununu Portal <onboarding@resend.dev>";
  if (process.env.BREVO_SENDER_EMAIL?.trim()) return process.env.BREVO_SENDER_EMAIL.trim();
  if (process.env.GMAIL_USER?.trim()) return process.env.GMAIL_USER.trim();
  if (process.env.SMTP_USER?.trim()) return process.env.SMTP_USER.trim();
  return "notifications@ahununulogistics.com";
}

export function getEmailProviderStatus(): EmailStatusInfo {
  const { provider, name, isCloudSafe } = detectEmailProvider();
  const isRender = isRenderEnvironment();
  const senderEmail = getActiveSenderEmail();
  const appUrl = getAppUrl();

  let renderWarning: string | null = null;
  if (isRender && !isCloudSafe) {
    if (provider === "gmail") {
      renderWarning =
        "Render Free Tier blocks outbound SMTP traffic on ports 25, 465, and 587. Gmail SMTP connections will time out. To deliver emails on Render, add RESEND_API_KEY (free 3,000 emails/mo) or BREVO_API_KEY (free 300 emails/day) in your Render Dashboard Environment Variables.";
    } else if (provider === "smtp") {
      renderWarning =
        "Render Free Tier blocks outbound SMTP ports 25, 465, and 587. If you are experiencing timeouts, use SMTP port 2525 or switch to RESEND_API_KEY / BREVO_API_KEY.";
    } else if (provider === "none") {
      renderWarning =
        "No email service is configured on Render. Add RESEND_API_KEY or BREVO_API_KEY to Render Environment Variables.";
    }
  }

  return {
    configured: provider !== "none",
    provider,
    providerName: name,
    senderEmail,
    appUrl,
    isCloudSafe,
    isRender,
    renderWarning,
  };
}

// ─────────────────────────────────────────────
//  Nodemailer Transporter (for SMTP / Gmail)
// ─────────────────────────────────────────────
let _transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function createSmtpTransporter() {
  const { provider } = detectEmailProvider();

  if (provider === "smtp") {
    const host = process.env.SMTP_HOST!.trim();
    const port = Number(process.env.SMTP_PORT) || 587;
    const secure = process.env.SMTP_SECURE === "true" || port === 465;
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS?.trim();

    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
    });
  }

  if (provider === "gmail") {
    const user = process.env.GMAIL_USER!.trim();
    const pass = process.env.GMAIL_APP_PASSWORD!.trim();

    return nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
      pool: false, // Avoid stale connections in serverless/container environments
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
    });
  }

  return null;
}

function getSmtpTransporter() {
  if (!_transporter) {
    _transporter = createSmtpTransporter();
  }
  return _transporter;
}

// ─────────────────────────────────────────────
//  HTTP-based API Dispatchers (Render-Safe)
// ─────────────────────────────────────────────

/**
 * Send email using Resend REST API (HTTPS Port 443 — NEVER blocked by Render)
 */
async function sendViaResend(
  to: string | string[],
  subject: string,
  html: string,
  text: string
): Promise<EmailDeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY!.trim();
  const toList = Array.isArray(to) ? to : [to];
  const from = process.env.EMAIL_FROM?.trim() || "Ahununu Meeting Portal <onboarding@resend.dev>";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: toList,
        subject,
        html,
        text,
      }),
    });

    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = data?.message || data?.error || `Resend API HTTP ${res.status}`;
      console.error(`[Email:Resend] Failed to send to ${toList.join(", ")}:`, errMsg);
      return { success: false, provider: "resend", error: errMsg };
    }

    console.log(`[Email:Resend] Delivered "${subject}" to ${toList.join(", ")} (ID: ${data.id})`);
    return { success: true, provider: "resend", messageId: data.id };
  } catch (err: any) {
    console.error(`[Email:Resend] Network error:`, err?.message || err);
    return { success: false, provider: "resend", error: err?.message || "Resend network error" };
  }
}

/**
 * Send email using Brevo (Sendinblue) REST API (HTTPS Port 443 — NEVER blocked by Render)
 */
async function sendViaBrevo(
  to: string | string[],
  subject: string,
  html: string,
  text: string
): Promise<EmailDeliveryResult> {
  const apiKey = process.env.BREVO_API_KEY!.trim();
  const toList = (Array.isArray(to) ? to : [to]).map((email) => ({ email }));
  const senderEmail =
    process.env.BREVO_SENDER_EMAIL?.trim() ||
    process.env.EMAIL_FROM?.trim() ||
    process.env.GMAIL_USER?.trim() ||
    "portal@ahununulogistics.com";

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: "Ahununu Meeting Portal", email: senderEmail },
        to: toList,
        subject,
        htmlContent: html,
        textContent: text,
      }),
    });

    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      let errMsg = data?.message || `Brevo API HTTP ${res.status}`;
      if (errMsg.includes("unrecognised IP address") || errMsg.includes("authorised_ips")) {
        errMsg = `Brevo IP Whitelist Block: Brevo is blocking requests from this IP. Go to https://app.brevo.com/security/authorised_ips and select "No IP review" (or toggle IP blocking OFF) so Render can make API calls.`;
        console.error(`[Email:Brevo] ${errMsg}`);
      } else {
        console.error(`[Email:Brevo] Failed to send to ${toList.map((t) => t.email).join(", ")}:`, errMsg);
      }
      return { success: false, provider: "brevo", error: errMsg };
    }

    console.log(`[Email:Brevo] Delivered "${subject}" (MessageId: ${data.messageId || "ok"})`);
    return { success: true, provider: "brevo", messageId: data.messageId };
  } catch (err: any) {
    console.error(`[Email:Brevo] Network error:`, err?.message || err);
    return { success: false, provider: "brevo", error: err?.message || "Brevo network error" };
  }
}

/**
 * Send email using SendGrid REST API (HTTPS Port 443 — NEVER blocked by Render)
 */
async function sendViaSendGrid(
  to: string | string[],
  subject: string,
  html: string,
  text: string
): Promise<EmailDeliveryResult> {
  const apiKey = process.env.SENDGRID_API_KEY!.trim();
  const toList = (Array.isArray(to) ? to : [to]).map((email) => ({ email }));
  const senderEmail =
    process.env.EMAIL_FROM?.trim() ||
    process.env.GMAIL_USER?.trim() ||
    "notifications@ahununulogistics.com";

  try {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: toList }],
        from: { email: senderEmail, name: "Ahununu Meeting Portal" },
        subject,
        content: [
          { type: "text/plain", value: text },
          { type: "text/html", value: html },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[Email:SendGrid] Failed to send: HTTP ${res.status} - ${errText}`);
      return { success: false, provider: "sendgrid", error: `HTTP ${res.status}: ${errText}` };
    }

    console.log(`[Email:SendGrid] Delivered "${subject}" to ${toList.map((t) => t.email).join(", ")}`);
    return { success: true, provider: "sendgrid" };
  } catch (err: any) {
    console.error(`[Email:SendGrid] Network error:`, err?.message || err);
    return { success: false, provider: "sendgrid", error: err?.message || "SendGrid network error" };
  }
}

/**
 * Send email using Nodemailer (Gmail or Custom SMTP)
 */
async function sendViaNodemailer(
  to: string | string[],
  subject: string,
  html: string,
  text: string,
  provider: "gmail" | "smtp"
): Promise<EmailDeliveryResult> {
  const transporter = getSmtpTransporter();
  if (!transporter) {
    return { success: false, provider, error: "SMTP transporter could not be initialized." };
  }

  const senderUser =
    process.env.EMAIL_FROM?.trim() ||
    (provider === "gmail" ? process.env.GMAIL_USER?.trim() : process.env.SMTP_USER?.trim()) ||
    "notifications@ahununulogistics.com";

  const from = senderUser.includes("<")
    ? senderUser
    : `"Ahununu Meeting Portal" <${senderUser}>`;

  const recipients = Array.isArray(to) ? to.join(", ") : to;

  try {
    const info = await transporter.sendMail({
      from,
      to,
      replyTo: senderUser,
      subject,
      text,
      html,
    });
    console.log(`[Email:${provider}] Delivered "${subject}" to ${recipients} (MessageId: ${info.messageId})`);
    return { success: true, provider, messageId: info.messageId };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    console.error(`[Email:${provider}] Delivery failed to ${recipients}:`, errMsg);

    // Provide specific Render troubleshooting context
    if (isRenderEnvironment() && (errMsg.includes("ETIMEDOUT") || errMsg.includes("ESOCKET") || errMsg.includes("Greeting never received"))) {
      console.error(
        `[Email Render Restriction] Outbound SMTP port blocked by Render's firewall! Render Free tier blocks ports 25, 465, and 587. Please add RESEND_API_KEY or BREVO_API_KEY in Render Environment Variables to route emails via HTTP (Port 443).`
      );
    }
    return { success: false, provider, error: errMsg };
  }
}

// ─────────────────────────────────────────────
//  Master Send Function
// ─────────────────────────────────────────────
export async function sendEmailDetailed(
  to: string | string[],
  subject: string,
  html: string,
  text?: string
): Promise<EmailDeliveryResult> {
  const { provider, isCloudSafe } = detectEmailProvider();

  if (provider === "none") {
    console.warn(`[Email] No email provider configured — skipping: "${subject}"`);
    return {
      success: false,
      provider: "none",
      error: "No email provider configured. Please set RESEND_API_KEY, BREVO_API_KEY, or GMAIL credentials.",
    };
  }

  // Fallback plain-text version to satisfy spam filters
  const plainText =
    text ||
    html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  // Log Render cloud warning if attempting SMTP
  if (isRenderEnvironment() && !isCloudSafe) {
    console.warn(
      `[Email Render Notice] Attempting to send email via ${provider.toUpperCase()} from Render. Note: Render Free tier blocks SMTP ports 25, 465, and 587. If this times out, use RESEND_API_KEY or BREVO_API_KEY.`
    );
  }

  switch (provider) {
    case "resend":
      return await sendViaResend(to, subject, html, plainText);
    case "brevo":
      return await sendViaBrevo(to, subject, html, plainText);
    case "sendgrid":
      return await sendViaSendGrid(to, subject, html, plainText);
    case "smtp":
      return await sendViaNodemailer(to, subject, html, plainText, "smtp");
    case "gmail":
      return await sendViaNodemailer(to, subject, html, plainText, "gmail");
    default:
      return { success: false, provider: "none", error: "Unsupported provider" };
  }
}

/**
 * Standard sendEmail returning boolean for backward compatibility
 */
export async function sendEmail(
  to: string | string[],
  subject: string,
  html: string,
  text?: string
): Promise<boolean> {
  const res = await sendEmailDetailed(to, subject, html, text);
  return res.success;
}

// ─────────────────────────────────────────────
//  Shared HTML wrapper — premium branded layout
// ─────────────────────────────────────────────
function htmlWrap(previewText: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${previewText}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;">
  <!-- Hidden preheader text -->
  <div style="display:none;font-size:1px;color:#f1f5f9;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    ${previewText}
  </div>

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.06);border:1px solid #e2e8f0;">
          
          <!-- Brand Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0b7a6b 0%,#00564b 100%);padding:24px 32px;text-align:left;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <span style="display:inline-block;background:rgba(255,255,255,0.15);color:#ffffff;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:3px 10px;border-radius:99px;margin-bottom:6px;">
                      Ahununu Logistics
                    </span>
                    <h1 style="margin:4px 0 0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">
                      Meeting Management Portal
                    </h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content Body -->
          <tr>
            <td style="padding:32px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e8ecf0;padding:20px 32px;text-align:center;">
              <p style="margin:0 0 6px;font-size:12px;color:#64748b;">
                This is an automated notification from <strong>Ahununu Logistics Meeting Portal</strong>.
              </p>
              <p style="margin:0;font-size:11px;color:#94a3b8;">
                Please do not reply directly to this email address. Responses should be submitted via the portal.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function greeting(name: string): string {
  return `<p style="font-size:15px;color:#1e293b;margin:0 0 16px;">Hello <strong>${name}</strong>,</p>`;
}

function badge(text: string, color: string, bg: string): string {
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;color:${color};background:${bg};text-transform:uppercase;">${text}</span>`;
}

// ══════════════════════════════════════════════
//  1. Meeting Invitation
// ══════════════════════════════════════════════
export async function sendMeetingInvitationEmail(opts: {
  toEmail: string;
  toName: string;
  meetingTitle: string;
  meetingDate: string;
  startTime: string;
  endTime: string;
  location?: string | null;
  onlineLink?: string | null;
  description?: string | null;
  organizerName: string;
  meetingId: string;
}): Promise<boolean> {
  const {
    toEmail,
    toName,
    meetingTitle,
    meetingDate,
    startTime,
    endTime,
    location,
    onlineLink,
    description,
    organizerName,
    meetingId,
  } = opts;

  const appUrl = getAppUrl();
  const meetingLink = `${appUrl}/meetings/${meetingId}`;
  const acceptLink = `${appUrl}/meetings/${meetingId}?invitation=ACCEPTED`;
  const declineLink = `${appUrl}/meetings/${meetingId}?invitation=REJECTED`;

  const subject = `Invitation: ${meetingTitle} @ ${meetingDate} (${startTime} - ${endTime})`;

  const body = `
    ${greeting(toName)}
    
    <p style="font-size:14px;color:#334155;line-height:1.5;margin:0 0 20px;">
      You have been invited by <strong>${organizerName}</strong> to attend the following meeting. Please review the schedule and confirm your attendance below:
    </p>

    <!-- Meeting Invitation Card -->
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #0b7a6b;border-radius:8px;padding:20px 24px;margin:0 0 24px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#0b7a6b;margin-bottom:4px;">
        Meeting Invitation
      </div>
      <h2 style="margin:0 0 16px;font-size:18px;font-weight:700;color:#0f172a;line-height:1.3;">
        ${meetingTitle}
      </h2>
      
      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;">
        <tr>
          <td style="padding:6px 0;width:110px;font-size:13px;color:#64748b;font-weight:500;vertical-align:top;">When</td>
          <td style="padding:6px 0;font-size:13px;color:#0f172a;font-weight:600;">
            ${meetingDate}<br/>
            <span style="font-weight:500;color:#475569;">${startTime} – ${endTime}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#64748b;font-weight:500;vertical-align:top;">Organizer</td>
          <td style="padding:6px 0;font-size:13px;color:#0f172a;font-weight:600;">${organizerName}</td>
        </tr>
        ${
          location
            ? `<tr>
                <td style="padding:6px 0;font-size:13px;color:#64748b;font-weight:500;vertical-align:top;">Location</td>
                <td style="padding:6px 0;font-size:13px;color:#0f172a;font-weight:600;">${location}</td>
              </tr>`
            : ""
        }
        ${
          onlineLink
            ? `<tr>
                <td style="padding:6px 0;font-size:13px;color:#64748b;font-weight:500;vertical-align:top;">Online Link</td>
                <td style="padding:6px 0;font-size:13px;color:#0b7a6b;font-weight:600;">
                  <a href="${onlineLink}" target="_blank" style="color:#0b7a6b;text-decoration:underline;">Join Online Meeting</a>
                </td>
              </tr>`
            : ""
        }
        ${
          description
            ? `<tr>
                <td style="padding:6px 0;font-size:13px;color:#64748b;font-weight:500;vertical-align:top;">Purpose</td>
                <td style="padding:6px 0;font-size:13px;color:#334155;line-height:1.4;">${description}</td>
              </tr>`
            : ""
        }
      </table>
    </div>

    <!-- Invitation Response Section -->
    <div style="background:#ffffff;border:1px solid #cbd5e1;border-radius:10px;padding:22px 20px;text-align:center;margin:0 0 24px;">
      <p style="font-size:14px;font-weight:700;color:#1e293b;margin:0 0 14px;">
        Will you be attending this meeting?
      </p>

      <table cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
        <tr>
          <td align="center" style="padding:0 8px 0 0;">
            <a href="${acceptLink}"
               style="display:inline-block;background:#0b7a6b;color:#ffffff;text-decoration:none;
                      font-size:13px;font-weight:700;padding:12px 24px;border-radius:8px;
                      box-shadow:0 2px 6px rgba(11,122,107,0.2);">
              ✓ Accept Invitation
            </a>
          </td>
          <td align="center" style="padding:0 0 0 8px;">
            <a href="${declineLink}"
               style="display:inline-block;background:#ffffff;color:#b91c1c;border:1px solid #f87171;
                      text-decoration:none;font-size:13px;font-weight:700;padding:11px 24px;border-radius:8px;">
              ✕ Decline Invitation
            </a>
          </td>
        </tr>
      </table>

    <p style="margin:14px 0 0;font-size:12px;color:#64748b;line-height:1.4;">
        Accepting marks your attendance as confirmed. Declining will ask for a brief reason for the organizer.
      </p>
    </div>

    <!-- Secondary Portal Link -->
    <div style="text-align:center;margin:16px 0 0;">
      <a href="${meetingLink}" style="color:#0b7a6b;font-size:13px;font-weight:600;text-decoration:underline;">
        View Meeting Details, Agenda & Documents in Portal →
      </a>
    </div>
  `;

  const text = `INVITATION: ${meetingTitle}

Hello ${toName},

You have been invited by ${organizerName} to attend this meeting.

WHEN: ${meetingDate} from ${startTime} to ${endTime}
ORGANIZER: ${organizerName}
${location ? `LOCATION: ${location}\n` : ""}${onlineLink ? `ONLINE LINK: ${onlineLink}\n` : ""}${description ? `PURPOSE: ${description}\n` : ""}
WILL YOU BE ATTENDING?
• Accept Invitation: ${acceptLink}
• Decline Invitation: ${declineLink}

View Meeting Details & Full Agenda: ${meetingLink}

Ahununu Logistics Meeting Portal`;

  return await sendEmail(
    toEmail,
    subject,
    htmlWrap(`Meeting Invitation: ${meetingTitle}`, body),
    text
  );
}

// ══════════════════════════════════════════════
//  2. Action Item Assigned
// ══════════════════════════════════════════════
const PRIORITY_META: Record<string, { label: string; color: string; bg: string }> = {
  LOW:      { label: "Low",      color: "#1e3a5f", bg: "#dbeafe" },
  MEDIUM:   { label: "Medium",   color: "#92400e", bg: "#fef3c7" },
  HIGH:     { label: "High",     color: "#9a3412", bg: "#ffedd5" },
  CRITICAL: { label: "Critical", color: "#7f1d1d", bg: "#fee2e2" },
};

export async function sendActionItemAssignedEmail(opts: {
  assignees: { email: string; name: string }[];
  taskTitle: string;
  deadline: string;
  priority: string;
  meetingTitle: string;
  assignedByName: string;
  meetingId: string;
  taskCode?: string;
  description?: string;
}): Promise<void> {
  const { assignees, taskTitle, deadline, priority, meetingTitle, assignedByName, meetingId, taskCode, description } = opts;
  const appUrl = getAppUrl();
  const link = `${appUrl}/meetings/${meetingId}?tab=action-items`;
  const pm = PRIORITY_META[priority] || PRIORITY_META.MEDIUM;

  const promises = assignees.map(async ({ email, name }) => {
    if (!email) return;

    const body = `
      ${greeting(name)}
      <p style="font-size:14px;color:#334155;margin:0 0 18px;line-height:1.5;">
        A new action item task has been assigned strictly to you by <strong>${assignedByName}</strong>:
      </p>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #0284c7;border-radius:8px;padding:20px 24px;margin:0 0 20px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#0284c7;margin-bottom:4px;">
          Action Item Assigned
        </div>
        <h2 style="margin:0 0 16px;font-size:18px;font-weight:700;color:#0f172a;line-height:1.3;">
          ${taskTitle}
        </h2>

        <table cellpadding="0" cellspacing="0" border="0" style="width:100%;">
          ${
            taskCode
              ? `<tr>
                  <td style="padding:6px 0;width:110px;font-size:13px;color:#64748b;font-weight:500;">Task Code</td>
                  <td style="padding:6px 0;font-size:13px;color:#0f172a;font-weight:600;">${taskCode}</td>
                </tr>`
              : ""
          }
          <tr>
            <td style="padding:6px 0;width:110px;font-size:13px;color:#64748b;font-weight:500;">Meeting</td>
            <td style="padding:6px 0;font-size:13px;color:#0f172a;font-weight:600;">${meetingTitle}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-size:13px;color:#64748b;font-weight:500;">Due Date</td>
            <td style="padding:6px 0;font-size:13px;color:#b91c1c;font-weight:700;">${deadline}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-size:13px;color:#64748b;font-weight:500;">Priority</td>
            <td style="padding:6px 0;font-size:13px;">${badge(pm.label, pm.color, pm.bg)}</td>
          </tr>
          ${
            description
              ? `<tr>
                  <td style="padding:6px 0;font-size:13px;color:#64748b;font-weight:500;vertical-align:top;">Instructions</td>
                  <td style="padding:6px 0;font-size:13px;color:#334155;line-height:1.4;">${description}</td>
                </tr>`
              : ""
          }
        </table>
      </div>

      <div style="text-align:center;margin:24px 0;">
        <a href="${link}"
          style="display:inline-block;background:#0b7a6b;color:#ffffff;text-decoration:none;
                 font-size:13px;font-weight:700;padding:12px 32px;border-radius:8px;">
          View & Update Task in Portal
        </a>
      </div>
    `;

    const text = `ACTION ITEM ASSIGNED: ${taskTitle}

Hello ${name},

A new action item has been assigned strictly to you by ${assignedByName}.

Task: ${taskTitle}
${taskCode ? `Task Code: ${taskCode}\n` : ""}Meeting: ${meetingTitle}
Due Date: ${deadline}
Priority: ${pm.label}
${description ? `Instructions: ${description}\n` : ""}
Open Task: ${link}

Ahununu Logistics Meeting Portal`;

    await sendEmail(
      email,
      `Action Item Assigned: ${taskTitle}`,
      htmlWrap(`Action Item Assigned: ${taskTitle}`, body),
      text
    );
  });

  await Promise.allSettled(promises);
}

// ══════════════════════════════════════════════
//  3. Meeting Cancellation
// ══════════════════════════════════════════════
export async function sendMeetingCancellationEmail(opts: {
  recipients: { email: string; name: string }[];
  meetingTitle: string;
  meetingDate: string;
  startTime: string;
  endTime: string;
  cancelledByName: string;
  meetingId: string;
}): Promise<void> {
  const { recipients, meetingTitle, meetingDate, startTime, endTime, cancelledByName, meetingId } = opts;
  const appUrl = getAppUrl();
  const link = `${appUrl}/meetings/${meetingId}`;

  const promises = recipients.map(async ({ email, name }) => {
    if (!email) return;

    const body = `
      ${greeting(name)}

      <div style="background:#fef2f2;border:1px solid #fecaca;border-left:4px solid #dc2626;border-radius:8px;padding:20px 24px;margin:0 0 20px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#dc2626;margin-bottom:4px;">
          Meeting Cancelled
        </div>
        <h2 style="margin:0 0 10px;font-size:18px;font-weight:700;color:#991b1b;line-height:1.3;">
          ${meetingTitle}
        </h2>
        <p style="margin:0;font-size:13px;color:#7f1d1d;line-height:1.4;">
          This meeting has been cancelled by <strong>${cancelledByName}</strong>. No further action is required from you.
        </p>
      </div>

      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 20px;">
        <tr>
          <td style="padding:6px 0;width:120px;font-size:13px;color:#64748b;font-weight:500;">Was Scheduled For</td>
          <td style="padding:6px 0;font-size:13px;color:#0f172a;font-weight:600;">${meetingDate} (${startTime} – ${endTime})</td>
        </tr>
      </table>

      <div style="text-align:center;margin:20px 0 0;">
        <a href="${link}" style="color:#0b7a6b;font-size:13px;font-weight:600;text-decoration:underline;">
          View Meeting Record in Portal →
        </a>
      </div>
    `;

    const text = `CANCELLED: ${meetingTitle}

Hello ${name},

Please note that the following meeting has been cancelled by ${cancelledByName}.

Meeting: ${meetingTitle}
Scheduled Date: ${meetingDate} (${startTime} - ${endTime})

No further action is required from you.

Meeting Record: ${link}

Ahununu Logistics Meeting Portal`;

    await sendEmail(
      email,
      `Cancelled: ${meetingTitle} @ ${meetingDate}`,
      htmlWrap(`Meeting Cancelled: ${meetingTitle}`, body),
      text
    );
  });

  await Promise.allSettled(promises);
}

// ══════════════════════════════════════════════
//  4. Diagnostic Test Email
// ══════════════════════════════════════════════
export async function sendDiagnosticTestEmail(toEmail: string): Promise<EmailDeliveryResult> {
  const status = getEmailProviderStatus();
  const subject = `[Ahununu Portal] Test Email Notification (${status.providerName})`;

  const body = `
    ${greeting("System Administrator")}
    
    <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-left:4px solid #059669;border-radius:8px;padding:20px 24px;margin:0 0 20px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#059669;margin-bottom:4px;">
        Delivery Test Successful
      </div>
      <h2 style="margin:0 0 8px;font-size:18px;font-weight:700;color:#065f46;line-height:1.3;">
        Email Service is Live & Operational
      </h2>
      <p style="margin:0;font-size:13px;color:#047857;line-height:1.5;">
        This test confirms that your Ahununu Logistics Meeting Management Portal can successfully send outbound notifications.
      </p>
    </div>

    <table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 20px;font-size:13px;">
      <tr>
        <td style="padding:6px 0;width:140px;color:#64748b;font-weight:500;">Active Provider:</td>
        <td style="padding:6px 0;color:#0f172a;font-weight:600;">${status.providerName}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#64748b;font-weight:500;">Sender Address:</td>
        <td style="padding:6px 0;color:#0f172a;font-weight:600;">${status.senderEmail}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#64748b;font-weight:500;">Environment:</td>
        <td style="padding:6px 0;color:#0f172a;font-weight:600;">${status.isRender ? "Render Cloud" : "Standard Host / Local"}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#64748b;font-weight:500;">Cloud Safe (Port 443):</td>
        <td style="padding:6px 0;color:#0f172a;font-weight:600;">${status.isCloudSafe ? "Yes (Safe from SMTP blocks)" : "No (Uses SMTP ports)"}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#64748b;font-weight:500;">Portal URL:</td>
        <td style="padding:6px 0;color:#0b7a6b;font-weight:600;"><a href="${status.appUrl}" style="color:#0b7a6b;">${status.appUrl}</a></td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#64748b;font-weight:500;">Dispatched At:</td>
        <td style="padding:6px 0;color:#0f172a;font-weight:600;">${new Date().toUTCString()}</td>
      </tr>
    </table>

    <div style="text-align:center;margin:24px 0 0;">
      <a href="${status.appUrl}/settings"
        style="display:inline-block;background:#0b7a6b;color:#ffffff;text-decoration:none;
               font-size:13px;font-weight:700;padding:12px 28px;border-radius:8px;">
        Open Portal Settings
      </a>
    </div>
  `;

  const text = `AHUNUNU PORTAL TEST EMAIL
  
Email service is operational!
Provider: ${status.providerName}
Sender: ${status.senderEmail}
Portal URL: ${status.appUrl}
Dispatched: ${new Date().toISOString()}

Ahununu Logistics Meeting Portal`;

  return await sendEmailDetailed(
    toEmail,
    subject,
    htmlWrap("Ahununu Portal Test Email", body),
    text
  );
}
