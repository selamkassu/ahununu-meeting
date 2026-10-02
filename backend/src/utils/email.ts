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
function htmlWrap(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#0b7a6b 0%,#005f56 100%);padding:28px 32px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">
              Ahununu Meeting Portal
            </h1>
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">
              Meeting Management System
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 32px 24px;">
            ${body}
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e8ecf0;padding:20px 32px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#94a3b8;">
              This is an automated notification from <strong>Ahununu Logistics Meeting Portal</strong>.<br/>
              Please do not reply to this email.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
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
function infoRow(label: string, value: string) {
  return `<tr>
    <td style="padding:6px 0;font-size:13px;color:#64748b;width:140px;vertical-align:top;">${label}</td>
    <td style="padding:6px 0;font-size:13px;color:#1e293b;font-weight:600;">${value}</td>
  </tr>`;
}

function infoTable(rows: string) {
  return `<table width="100%" cellpadding="0" cellspacing="0"
    style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:16px 0;">
    <tbody>${rows}</tbody>
  </table>`;
}

function ctaButton(label: string, href: string) {
  return `<div style="text-align:center;margin:24px 0;">
    <a href="${href}"
      style="display:inline-block;background:#0b7a6b;color:#ffffff;text-decoration:none;
             font-size:14px;font-weight:700;padding:12px 32px;border-radius:8px;">
      ${label}
    </a>
  </div>`;
}

function rsvpButtons(acceptHref: string, declineHref: string, meetingHref: string) {
  return `
    <div style="margin:28px 0 20px;text-align:center;">
      <p style="font-size:13px;font-weight:700;color:#334155;margin:0 0 14px;letter-spacing:0.2px;">
        Will you be attending this meeting?
      </p>
      <table cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
        <tr>
          <td align="center" style="padding:0 8px 0 0;">
            <a href="${acceptHref}"
               style="display:inline-block;background:#0b7a6b;color:#ffffff;text-decoration:none;
                      font-size:13px;font-weight:700;padding:12px 24px;border-radius:8px;
                      box-shadow:0 2px 6px rgba(11,122,107,0.25);">
              ✓ Accept Invitation
            </a>
          </td>
          <td align="center" style="padding:0 0 0 8px;">
            <a href="${declineHref}"
               style="display:inline-block;background:#fef2f2;color:#b91c1c;border:1px solid #fca5a5;
                      text-decoration:none;font-size:13px;font-weight:700;padding:11px 24px;border-radius:8px;">
              ✕ Decline Invitation
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">
        Declining requires entering a brief reason for the organizer.<br/>
        You can also <a href="${meetingHref}" style="color:#0b7a6b;text-decoration:underline;font-weight:600;">open meeting details & agenda</a>.
      </p>
    </div>
  `;
}

function badge(text: string, color: string, bg: string) {
  return `<span style="display:inline-block;background:${bg};color:${color};
    font-size:11px;font-weight:700;padding:2px 10px;border-radius:99px;
    text-transform:uppercase;letter-spacing:0.5px;">${text}</span>`;
}

function greeting(name: string) {
  return `<p style="font-size:15px;color:#1e293b;margin:0 0 16px;">Hello <strong>${name}</strong>,</p>`;
}

function divider() {
  return `<hr style="border:none;border-top:1px solid #e8ecf0;margin:20px 0;"/>`;
}

const APP_URL = process.env.APP_URL || "http://localhost:5173";

// ══════════════════════════════════════════════
//  1. Meeting Invitation
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
  meetingId: string;
}) {
  const { toEmail, toName, organizerName, meetingTitle, meetingDate, startTime, endTime, location, meetingId } = opts;
  const link = `${APP_URL}/meetings/${meetingId}`;
  const acceptLink = `${APP_URL}/meetings/${meetingId}?rsvp=ACCEPTED`;
  const declineLink = `${APP_URL}/meetings/${meetingId}?rsvp=REJECTED`;

  const body = `
    ${greeting(toName)}
    <p style="font-size:14px;color:#475569;margin:0 0 16px;">
      You have been invited by <strong>${organizerName}</strong> to attend the following meeting. Please confirm your attendance using the buttons below:
    </p>
    ${infoTable(
      infoRow("Meeting", meetingTitle) +
      infoRow("Date", meetingDate) +
      infoRow("Time", `${startTime} - ${endTime}`) +
      (location ? infoRow("Location", location) : "")
    )}
    ${rsvpButtons(acceptLink, declineLink, link)}
  `;

  const text = `Hello ${toName},

You have been invited to a meeting by ${organizerName}.

Meeting: ${meetingTitle}
Date: ${meetingDate}
Time: ${startTime} - ${endTime}
${location ? `Location: ${location}\n` : ""}

Will you be attending this meeting?
• Accept Invitation: ${acceptLink}
• Decline Invitation (Reason Required): ${declineLink}
• View Full Meeting Details: ${link}

Ahununu Logistics Meeting Portal`;

  return await sendEmail(
    toEmail,
    `Meeting Invitation: ${meetingTitle}`,
    htmlWrap(`Meeting Invitation: ${meetingTitle}`, body),
    text
  );
}

// ══════════════════════════════════════════════
//  2. Meeting Status Change
// ══════════════════════════════════════════════
const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  APPROVED:   { label: "Approved",    color: "#166534", bg: "#dcfce7", icon: "Approved" },
  CANCELLED:  { label: "Cancelled",   color: "#991b1b", bg: "#fee2e2", icon: "Cancelled" },
  COMPLETED:  { label: "Completed",   color: "#1e3a5f", bg: "#dbeafe", icon: "Completed" },
  PENDING:    { label: "Pending",     color: "#92400e", bg: "#fef3c7", icon: "Pending" },
  IN_PROGRESS:{ label: "In Progress", color: "#1d4ed8", bg: "#dbeafe", icon: "In Progress" },
};

export async function sendMeetingStatusEmail(opts: {
  recipients: { email: string; name: string }[];
  meetingTitle: string;
  meetingDate: string;
  startTime: string;
  endTime: string;
  newStatus: string;
  changedByName: string;
  meetingId: string;
}) {
  const { recipients, meetingTitle, meetingDate, startTime, endTime, newStatus, changedByName, meetingId } = opts;
  const link = `${APP_URL}/meetings/${meetingId}`;
  const meta = STATUS_META[newStatus] || { label: newStatus, color: "#1e293b", bg: "#f1f5f9", icon: newStatus };

  for (const { email, name } of recipients) {
    const body = `
      ${greeting(name)}
      <p style="font-size:14px;color:#475569;margin:0 0 16px;">
        The status of a meeting you are part of has been updated by <strong>${changedByName}</strong>.
      </p>
      ${infoTable(
        infoRow("Meeting", meetingTitle) +
        infoRow("Date", meetingDate) +
        infoRow("Time", `${startTime} - ${endTime}`) +
        infoRow("New Status", `${badge(meta.label, meta.color, meta.bg)}`)
      )}
      ${ctaButton("Open Meeting", link)}
    `;

    await sendEmail(
      email,
      `Meeting ${meta.label}: ${meetingTitle}`,
      htmlWrap(`Meeting ${meta.label}`, body)
    );
  }
}

// ══════════════════════════════════════════════
//  3. Action Item Assigned
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
  const link = `${APP_URL}/meetings/${meetingId}`;
  const pm = PRIORITY_META[priority] || PRIORITY_META.MEDIUM;

  for (const { email, name } of assignees) {
    const body = `
      ${greeting(name)}
      <p style="font-size:14px;color:#475569;margin:0 0 16px;">
        A new action item task has been assigned strictly to you by <strong>${assignedByName}</strong>.
      </p>
      ${infoTable(
        infoRow("Task", taskTitle) +
        (taskCode ? infoRow("Task Code", taskCode) : "") +
        infoRow("Meeting", meetingTitle) +
        infoRow("Due Date", deadline) +
        infoRow("Priority", `${badge(pm.label, pm.color, pm.bg)}`) +
        (description ? infoRow("Responsibilities", description) : "")
      )}
      <p style="font-size:13px;color:#64748b;margin:0;">
        Please review your assigned responsibilities and complete this task before the due date. You can update your progress and status directly in the portal.
      </p>
      ${ctaButton("View Task", link)}
    `;

    await sendEmail(
      email,
      `Action Item Assigned: ${taskTitle}`,
      htmlWrap("New Action Item Assigned", body)
    );
  }
}

// ══════════════════════════════════════════════
//  4. Meeting Created — organizer confirmation
// ══════════════════════════════════════════════
export async function sendMeetingCreatedEmail(opts: {
  toEmail: string;
  toName: string;
  meetingTitle: string;
  meetingDate: string;
  startTime: string;
  endTime: string;
  location?: string;
  meetingId: string;
  participantCount: number;
}) {
  const { toEmail, toName, meetingTitle, meetingDate, startTime, endTime, location, meetingId, participantCount } = opts;
  const link = `${APP_URL}/meetings/${meetingId}`;

  const body = `
    ${greeting(toName)}
    <p style="font-size:14px;color:#475569;margin:0 0 16px;">
      Your meeting has been successfully created.
    </p>
    ${infoTable(
      infoRow("Title", meetingTitle) +
      infoRow("Date", meetingDate) +
      infoRow("Time", `${startTime} - ${endTime}`) +
      (location ? infoRow("Location", location) : "") +
      infoRow("Participants", `${participantCount} invited`)
    )}
    ${ctaButton("Open Meeting", link)}
    ${divider()}
    <p style="font-size:12px;color:#94a3b8;margin:0;text-align:center;">
      You can manage, edit, and track this meeting from the portal.
    </p>
  `;

  await sendEmail(
    toEmail,
    `Meeting Created: ${meetingTitle}`,
    htmlWrap("Meeting Created", body)
  );
}

// ══════════════════════════════════════════════
//  5. RSVP Response — notifies organizer
// ══════════════════════════════════════════════
export async function sendRsvpResponseEmail(opts: {
  organizerEmail: string;
  organizerName: string;
  participantName: string;
  meetingTitle: string;
  meetingDate: string;
  startTime: string;
  response: "ACCEPTED" | "REJECTED" | "DECLINED";
  reason?: string;
  meetingId: string;
}) {
  const { organizerEmail, organizerName, participantName, meetingTitle, meetingDate, startTime, response, reason, meetingId } = opts;
  const link = `${APP_URL}/meetings/${meetingId}`;
  const accepted = response === "ACCEPTED";

  const body = `
    ${greeting(organizerName)}
    <p style="font-size:14px;color:#475569;margin:0 0 16px;">
      A participant has responded to your meeting invitation.
    </p>
    ${infoTable(
      infoRow("Participant", participantName) +
      infoRow("Meeting", meetingTitle) +
      infoRow("Date", `${meetingDate} at ${startTime}`) +
      infoRow("Response", accepted
        ? `${badge("Accepted", "#166534", "#dcfce7")}`
        : `${badge("Declined", "#991b1b", "#fee2e2")}`) +
      (reason ? infoRow("Reason", reason) : "")
    )}
    ${ctaButton("View Participant Status", link)}
  `;

  await sendEmail(
    organizerEmail,
    `${accepted ? "RSVP Accepted" : "RSVP Declined"} - ${participantName}: ${meetingTitle}`,
    htmlWrap("RSVP Response Received", body)
  );
}

// ══════════════════════════════════════════════
//  6. Meeting Cancellation — sent to all invited participants
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
      <div style="background:#fff5f5;border:1px solid #fecaca;border-radius:8px;padding:16px 20px;margin:0 0 16px;">
        <p style="margin:0;font-size:14px;color:#991b1b;font-weight:700;">
          This meeting has been cancelled.
        </p>
        <p style="margin:6px 0 0;font-size:13px;color:#b91c1c;">
          Cancelled by <strong>${cancelledByName}</strong>. No further action is required from you.
        </p>
      </div>
      ${infoTable(
        infoRow("Meeting", meetingTitle) +
        infoRow("Was Scheduled", meetingDate) +
        infoRow("Time", `${startTime} - ${endTime}`) +
        infoRow("Status", `${badge("CANCELLED", "#991b1b", "#fee2e2")}`)
      )}
      <p style="font-size:13px;color:#64748b;margin:0;">
        You can view the cancelled meeting record in the portal for reference.
      </p>
      ${ctaButton("View Meeting Record", link)}
    `;

    await sendEmail(
      email,
      `Meeting Cancelled: ${meetingTitle}`,
      htmlWrap("Meeting Cancelled", body)
    );
  }
}
