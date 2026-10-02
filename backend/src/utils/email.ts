import nodemailer from "nodemailer";

// ─────────────────────────────────────────────
//  Transporter — configured from env at startup
// ─────────────────────────────────────────────
function createTransporter() {
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.trim();

  if (!user || !pass) {
    console.warn(
      "[Email] GMAIL_USER or GMAIL_APP_PASSWORD not set — emails will be skipped."
    );
    return null;
  }

  return nodemailer.createTransport({
    service: "gmail",
    pool: true,
    maxConnections: 1, // Single connection to avoid Gmail concurrent handshake drops
    maxMessages: 100,
    rateDelta: 1000,
    rateLimit: 1,      // Throttle to 1 email/sec to prevent spam/burst flagging
    auth: { user, pass },
  });
}

let _transporter: ReturnType<typeof nodemailer.createTransport> | null = null;
function getTransporter() {
  if (!_transporter) _transporter = createTransporter();
  return _transporter;
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
                      Meeting Portal
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

// ─────────────────────────────────────────────
//  Core send helper with plain text alternative
// ─────────────────────────────────────────────
async function sendEmail(
  to: string | string[],
  subject: string,
  html: string,
  text?: string
): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn("[Email] Transporter not ready — skipping:", subject);
    return false;
  }

  const user = process.env.GMAIL_USER?.trim();
  const from = `"Ahununu Meeting Portal" <${user}>`;

  // Fallback plain-text version to satisfy spam filters
  const plainText =
    text ||
    html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  try {
    const info = await transporter.sendMail({
      from,
      to,
      replyTo: user,
      subject,
      text: plainText,
      html,
    });
    const recipients = Array.isArray(to) ? to.join(", ") : to;
    console.log(`[Email] Delivered "${subject}" to ${recipients} (MessageId: ${info.messageId})`);
    return true;
  } catch (err: any) {
    console.error(`[Email] Failed to send "${subject}" to ${Array.isArray(to) ? to.join(", ") : to}:`, err?.message || err);
    return false;
  }
}

// ─────────────────────────────────────────────
//  Reusable UI primitives
// ─────────────────────────────────────────────
function greeting(name: string) {
  return `<p style="font-size:15px;color:#1e293b;margin:0 0 16px;">Hello <strong>${name}</strong>,</p>`;
}

function badge(text: string, color: string, bg: string) {
  return `<span style="display:inline-block;background:${bg};color:${color};font-size:11px;font-weight:700;padding:2px 10px;border-radius:99px;text-transform:uppercase;letter-spacing:0.5px;">${text}</span>`;
}

const APP_URL = process.env.APP_URL || "http://localhost:5173";

// ══════════════════════════════════════════════
//  1. Meeting Invitation (Strictly for invited attendees)
// ══════════════════════════════════════════════
export async function sendMeetingInvitationEmail(opts: {
  toEmail: string;
  toName: string;
  organizerName: string;
  meetingTitle: string;
  meetingDate: string;
  startTime: string;
  endTime: string;
  location?: string;
  onlineLink?: string;
  description?: string;
  meetingId: string;
}) {
  const {
    toEmail,
    toName,
    organizerName,
    meetingTitle,
    meetingDate,
    startTime,
    endTime,
    location,
    onlineLink,
    description,
    meetingId,
  } = opts;

  const meetingLink = `${APP_URL}/meetings/${meetingId}`;
  const acceptLink = `${APP_URL}/meetings/${meetingId}?rsvp=ACCEPTED`;
  const declineLink = `${APP_URL}/meetings/${meetingId}?rsvp=REJECTED`;

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

    <!-- RSVP Section -->
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
              ✕ Decline
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
//  2. Action Item Assigned (Strictly for assignees)
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
}) {
  const { assignees, taskTitle, deadline, priority, meetingTitle, assignedByName, meetingId, taskCode, description } = opts;
  const link = `${APP_URL}/meetings/${meetingId}?tab=action-items`;
  const pm = PRIORITY_META[priority] || PRIORITY_META.MEDIUM;

  for (const { email, name } of assignees) {
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
  }
}

// ══════════════════════════════════════════════
//  3. Meeting Cancellation (Strictly for attendees)
// ══════════════════════════════════════════════
export async function sendMeetingCancellationEmail(opts: {
  recipients: { email: string; name: string }[];
  meetingTitle: string;
  meetingDate: string;
  startTime: string;
  endTime: string;
  cancelledByName: string;
  meetingId: string;
}) {
  const { recipients, meetingTitle, meetingDate, startTime, endTime, cancelledByName, meetingId } = opts;
  const link = `${APP_URL}/meetings/${meetingId}`;

  for (const { email, name } of recipients) {
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
  }
}
