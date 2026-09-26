/**
 * Ahununu Logistics Meeting Management Portal
 * Reusable Print Utility
 * 
 * Provides robust, isolated printing for the FULL Meeting Minutes report
 * and corporate documents without browser chrome clutter or content omissions.
 */

import { formatReportDateTime } from "./exportReport";
import type { MeetingDetail, MeetingMinutes } from "../types";

export interface PrintHtmlOptions {
  title?: string;
  onAfterPrint?: () => void;
}

export interface PrintMeetingMinutesOptions {
  meeting: MeetingDetail;
  minutesContent?: string;
  customTitle?: string;
}

/**
 * Standard Corporate Print CSS for Multi-Page A4 Letterhead and Content
 */
const FULL_PRINT_STYLES = `
  @page {
    size: A4 portrait;
    margin: 14mm 15mm 16mm 15mm;
  }

  @page :left {
    @bottom-left {
      content: "Ahununu Logistics Corporate Records — Confidential";
      font-family: 'Roboto', Arial, sans-serif;
      font-size: 7.5pt;
      color: #94a3b8;
    }
    @bottom-right {
      content: "Page " counter(page);
      font-family: 'Roboto', Arial, sans-serif;
      font-size: 7.5pt;
      color: #64748b;
    }
  }

  @page :right {
    @bottom-left {
      content: "Ahununu Logistics Corporate Records — Confidential";
      font-family: 'Roboto', Arial, sans-serif;
      font-size: 7.5pt;
      color: #94a3b8;
    }
    @bottom-right {
      content: "Page " counter(page);
      font-family: 'Roboto', Arial, sans-serif;
      font-size: 7.5pt;
      color: #64748b;
    }
  }

  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  html, body {
    background-color: #ffffff;
    color: #1e293b;
    font-family: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    font-size: 9pt;
    line-height: 1.5;
    margin: 0;
    padding: 0;
  }

  /* Typography */
  h1, h2, h3, h4, h5 {
    font-family: 'Roboto', Arial, sans-serif;
    color: #0f172a;
    page-break-after: avoid;
    break-after: avoid;
  }

  h1 {
    font-size: 15pt;
    font-weight: 700;
    margin: 0 0 6px 0;
    color: #0f172a;
  }

  h2.section-header {
    font-size: 11pt;
    font-weight: 700;
    color: #0B7A6B;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1.5px solid #0B7A6B;
    padding-bottom: 4px;
    margin: 22px 0 10px 0;
    page-break-after: avoid;
    break-after: avoid;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  h3 { font-size: 10pt; font-weight: 600; margin: 0.6em 0 0.2em; }

  p { margin: 0.4em 0; }

  /* Company Letterhead Header */
  .letterhead-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2.5px solid #0B7A6B;
    padding-bottom: 12px;
    margin-bottom: 18px;
  }

  .letterhead-brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .letterhead-logo {
    width: 46px;
    height: 46px;
    border-radius: 50%;
    object-contain: cover;
  }

  .letterhead-company {
    font-size: 13.5pt;
    font-weight: 700;
    color: #0B7A6B;
    letter-spacing: 0.3px;
    margin: 0;
    line-height: 1.1;
  }

  .letterhead-portal {
    font-size: 8pt;
    font-weight: 500;
    color: #64748b;
    margin: 2px 0 0 0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .letterhead-doc-type {
    text-align: right;
  }

  .doc-title-badge {
    display: inline-block;
    background-color: #0B7A6B;
    color: #ffffff;
    font-size: 8.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    padding: 3.5px 12px;
    border-radius: 4px;
  }

  .doc-ref-code {
    font-family: ui-monospace, monospace;
    font-size: 9pt;
    font-weight: 600;
    color: #475569;
    margin-top: 4px;
  }

  /* Two Column Key-Value Meta Grid */
  .info-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 16px;
    background-color: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
  }

  .info-table td {
    border: 1px solid #e2e8f0;
    padding: 6px 10px;
    font-size: 8.5pt;
    vertical-align: top;
  }

  .info-label {
    font-weight: 600;
    color: #475569;
    width: 18%;
    background-color: #f1f5f9;
    text-transform: uppercase;
    font-size: 7.5pt;
    letter-spacing: 0.4px;
  }

  .info-val {
    color: #0f172a;
    width: 32%;
  }

  /* Status Badges */
  .badge {
    display: inline-block;
    padding: 1.5px 8px;
    border-radius: 9999px;
    font-size: 7.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }
  .badge-approved { background-color: #dcfce7; color: #15803d; border: 1px solid #86efac; }
  .badge-completed { background-color: #e0f2fe; color: #0369a1; border: 1px solid #7dd3fc; }
  .badge-in_progress { background-color: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
  .badge-scheduled { background-color: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }
  .badge-cancelled { background-color: #ffe4e6; color: #be123c; border: 1px solid #fecdd3; }

  /* Standard Tables */
  table.report-table {
    width: 100%;
    border-collapse: collapse;
    margin: 8px 0 14px 0;
    font-size: 8.5pt;
  }

  table.report-table th, table.report-table td {
    border: 1px solid #cbd5e1;
    padding: 6px 9px;
    text-align: left;
    vertical-align: top;
  }

  table.report-table th {
    background-color: #f1f5f9;
    font-weight: 600;
    color: #0f172a;
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  table.report-table thead {
    display: table-header-group;
  }

  table.report-table tr {
    page-break-inside: avoid;
    break-inside: avoid;
  }

  /* Discussion / Rich Text */
  .proceedings-content {
    line-height: 1.6;
    margin: 8px 0 16px 0;
    color: #1e293b;
    font-size: 9pt;
  }

  .proceedings-content p {
    margin: 0.4em 0;
  }

  .proceedings-content ul, .proceedings-content ol {
    margin: 0.4em 0;
    padding-left: 1.5em;
  }

  .proceedings-content li {
    margin-bottom: 0.25em;
  }

  .proceedings-content blockquote {
    border-left: 3.5px solid #0B7A6B;
    background-color: #f8fafc;
    padding: 6px 12px;
    margin: 8px 0;
    color: #475569;
    font-style: italic;
  }

  .proceedings-content code {
    font-family: ui-monospace, monospace;
    font-size: 8.5pt;
    background-color: #f1f5f9;
    padding: 1.5px 4.5px;
    border-radius: 3px;
    border: 1px solid #e2e8f0;
  }

  .proceedings-content table {
    width: 100%;
    border-collapse: collapse;
    margin: 8px 0;
    font-size: 8.5pt;
  }

  .proceedings-content table th, .proceedings-content table td {
    border: 1px solid #cbd5e1;
    padding: 6px 8px;
  }

  .proceedings-content table th {
    background-color: #f1f5f9;
    font-weight: 600;
  }

  /* Empty section note */
  .empty-note {
    font-style: italic;
    color: #64748b;
    font-size: 8.5pt;
    padding: 6px 0;
    margin: 4px 0 10px 0;
  }

  /* Finalization & Approval Certification Box */
  .finalization-box {
    margin-top: 20px;
    border: 1.5px solid #cbd5e1;
    background-color: #f8fafc;
    border-radius: 6px;
    padding: 12px 16px;
    page-break-inside: avoid;
    break-inside: avoid;
  }

  .finalization-box.approved {
    border-color: #86efac;
    background-color: #f0fdf4;
  }

  .approval-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
  }

  .approval-details h4 {
    margin: 0 0 4px 0;
    font-size: 10pt;
    color: #15803d;
  }

  .approval-details p {
    margin: 2px 0;
    font-size: 8.5pt;
    color: #166534;
  }

  .seal-container {
    border: 1px solid #bbf7d0;
    background-color: #ffffff;
    border-radius: 6px;
    padding: 6px 14px;
    text-align: center;
    min-width: 150px;
  }

  .seal-img {
    max-height: 42px;
    max-width: 130px;
    object-contain: contain;
    display: block;
    margin: 0 auto;
  }

  .seal-label {
    font-size: 7pt;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 3px;
  }

  /* Footer */
  .print-footer {
    margin-top: 30px;
    padding-top: 10px;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 7.5pt;
    color: #94a3b8;
    page-break-inside: avoid;
    break-inside: avoid;
  }
`;

/**
 * Core print utility that prints HTML content via a hidden iframe
 */
export function printHtml(htmlContent: string, options: PrintHtmlOptions = {}): void {
  const { title = "Meeting Minutes — Ahununu Logistics", onAfterPrint } = options;

  // Clean up any existing print iframe
  const existingIframe = document.getElementById("ahununu-print-iframe");
  if (existingIframe && existingIframe.parentNode) {
    existingIframe.parentNode.removeChild(existingIframe);
  }

  const iframe = document.createElement("iframe");
  iframe.id = "ahununu-print-iframe";
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  iframe.style.visibility = "hidden";
  iframe.setAttribute("aria-hidden", "true");

  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    window.print();
    onAfterPrint?.();
    return;
  }

  const fullHtml = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>${title}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,300;0,400;0,500;0,700;1,400;1,500&display=swap" rel="stylesheet">
        <style>
          ${FULL_PRINT_STYLES}
        </style>
      </head>
      <body>
        ${htmlContent}
      </body>
    </html>
  `;

  doc.open();
  doc.write(fullHtml);
  doc.close();

  const handlePrintExecution = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      window.print();
    }
  };

  const cleanup = () => {
    try {
      if (iframe.parentNode) {
        document.body.removeChild(iframe);
      }
    } catch { }
    onAfterPrint?.();
  };

  iframe.contentWindow?.addEventListener("afterprint", cleanup);
  setTimeout(cleanup, 120000);

  const images = Array.from(doc.images);
  if (images.length === 0) {
    setTimeout(handlePrintExecution, 150);
  } else {
    let loadedCount = 0;
    const checkAllLoaded = () => {
      loadedCount++;
      if (loadedCount >= images.length) {
        setTimeout(handlePrintExecution, 150);
      }
    };
    images.forEach((img) => {
      if (img.complete) {
        checkAllLoaded();
      } else {
        img.onload = checkAllLoaded;
        img.onerror = checkAllLoaded;
      }
    });
    setTimeout(handlePrintExecution, 1500);
  }
}

/**
 * Generate full HTML representation of the Meeting Minutes for both Print and Doc Export
 */
export function generateFullMeetingMinutesHtml(meeting: MeetingDetail, minutesContent?: string): string {
  // 1. Gather proceedings/discussion
  let content = minutesContent;
  if (!content) {
    const summaryMinute = (meeting.minutes || []).find(
      (m: MeetingMinutes) => m.type === "SUMMARY" || (!m.type && !m.attendeeId)
    );
    content = summaryMinute?.content || "";
  }

  // Also include any other attendee discussion minutes if present
  const otherMinutes = (meeting.minutes || []).filter(
    (m: MeetingMinutes) => m.type !== "SUMMARY" && (m.type || m.attendeeId)
  );

  let fullProceedingsHtml = content ? `<div class="proceedings-content">${content}</div>` : "";
  if (otherMinutes.length > 0) {
    fullProceedingsHtml += `
      <div style="margin-top: 14px;">
        <h4 style="color:#475569; margin-bottom: 6px;">Additional Discussion & Notes</h4>
        ${otherMinutes
        .map(
          (m) => `
          <div style="margin-bottom: 10px; padding: 8px 12px; background:#f8fafc; border-left:3px solid #0B7A6B; border-radius:4px;">
            <div style="font-weight:600; font-size:8pt; color:#475569; margin-bottom:3px;">
              ${m.attendee?.name || m.recordedBy?.name || "Participant"} · ${new Date(m.createdAt).toLocaleDateString()}
            </div>
            <div>${m.content}</div>
          </div>
        `
        )
        .join("")}
      </div>
    `;
  }
  if (!fullProceedingsHtml) {
    fullProceedingsHtml = `<p class="empty-note">No discussion proceedings recorded for this meeting.</p>`;
  }

  const generatedDate = formatReportDateTime(new Date());

  const meetingDateFormatted = new Date(meeting.date).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const timeFormatted = `${meeting.startTime || "00:00"} – ${meeting.endTime || "00:00"}`;
  const meetingType = meeting.onlineLink ? (meeting.location ? "Hybrid" : "Virtual / Online") : "In-Person";
  const locationFormatted = meeting.location || (meeting.onlineLink ? "Online Video Conference" : "Headquarters");
  const purposeFormatted = meeting.description || "Official departmental proceedings and operational review";
  const statusLabel = meeting.status.replace("_", " ");
  const statusClass = `badge-${meeting.status.toLowerCase()}`;

  const summaryMinute = (meeting.minutes || []).find(
    (m: MeetingMinutes) => m.type === "SUMMARY" || (!m.type && !m.attendeeId)
  );
  const recordedBy = summaryMinute?.recordedBy?.name || meeting.organizer?.name || "Meeting Secretary";
  const recordDate = summaryMinute?.createdAt
    ? new Date(summaryMinute.createdAt).toLocaleDateString()
    : new Date((meeting as any).createdAt || meeting.date).toLocaleDateString();

  // 3. Attendance Table
  let attendanceHtml = "";
  if (meeting.participants && meeting.participants.length > 0) {
    attendanceHtml = `
      <table class="report-table">
        <thead>
          <tr>
            <th style="width: 5%; text-align: center;">#</th>
            <th style="width: 25%;">Name</th>
            <th style="width: 22%;">Position</th>
            <th style="width: 22%;">Organization / Dept</th>
            <th style="width: 14%;">Status</th>
            <th style="width: 12%; text-align: center;">Signature</th>
          </tr>
        </thead>
        <tbody>
          ${meeting.participants
        .map((p, idx) => {
          const isPresent = p.participated;
          const statusDisplay = isPresent ? "Attended" : (p.status ? p.status.replace("_", " ") : "Invited");
          const position = p.user.jobTitle || p.user.role?.name || "Participant";
          const departmentName = p.user.department?.name || meeting.department?.name || "Ahununu Logistics";
          const sigDisplay = isPresent ? "✓ Verified" : "—";

          return `
                <tr>
                  <td style="text-align: center; color: #64748b;">${idx + 1}</td>
                  <td><strong>${p.user.name}</strong><br><span style="color:#64748b; font-size:7.5pt;">${p.user.email}</span></td>
                  <td>${position}</td>
                  <td>${departmentName}</td>
                  <td><span style="font-weight: 500; color: ${isPresent ? '#15803d' : '#64748b'};">${statusDisplay}</span></td>
                  <td style="text-align: center; font-size: 8pt; color: #64748b;">${sigDisplay}</td>
                </tr>
              `;
        })
        .join("")}
        </tbody>
      </table>
    `;
  } else {
    attendanceHtml = `<p class="empty-note">No participant records recorded.</p>`;
  }

  // 4. Agenda Items
  let agendaHtml = "";
  if (meeting.agendaItems && meeting.agendaItems.length > 0) {
    agendaHtml = `
      <table class="report-table">
        <thead>
          <tr>
            <th style="width: 6%; text-align: center;">#</th>
            <th style="width: 48%;">Agenda Topic</th>
            <th style="width: 22%;">Presenter</th>
            <th style="width: 12%;">Duration</th>
            <th style="width: 12%;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${meeting.agendaItems
        .map(
          (a, idx) => `
            <tr>
              <td style="text-align: center; color: #64748b;">${a.order || idx + 1}</td>
              <td>
                <strong>${a.title}</strong>
                ${a.description ? `<br><span style="color:#64748b; font-size:8pt;">${a.description}</span>` : ""}
              </td>
              <td>${a.presenter || meeting.organizer?.name || "Organizer"}</td>
              <td>${a.durationMin || 15} mins</td>
              <td><span style="font-weight:500;">${a.status}</span></td>
            </tr>
          `
        )
        .join("")}
        </tbody>
      </table>
    `;
  } else {
    agendaHtml = `<p class="empty-note">No formal agenda items specified.</p>`;
  }

  // 6. Decisions / Outcomes
  let decisionsHtml = "";
  if (meeting.decisions && meeting.decisions.length > 0) {
    decisionsHtml = `
      <table class="report-table">
        <thead>
          <tr>
            <th style="width: 6%; text-align: center;">#</th>
            <th style="width: 18%;">Ref Code</th>
            <th style="width: 30%;">Decision</th>
            <th style="width: 34%;">Details / Context</th>
            <th style="width: 12%;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${meeting.decisions
        .map(
          (d, idx) => `
            <tr>
              <td style="text-align: center; color: #64748b;">${idx + 1}</td>
              <td style="font-family: monospace; font-size: 8pt; color: #475569;">${d.code}</td>
              <td><strong>${d.title}</strong></td>
              <td>${d.description || "—"}</td>
              <td><span style="font-weight:600; color:#0B7A6B;">${d.status.replace("_", " ")}</span></td>
            </tr>
          `
        )
        .join("")}
        </tbody>
      </table>
    `;
  } else {
    decisionsHtml = `<p class="empty-note">No formal decisions recorded for this meeting.</p>`;
  }

  // 7. Action Items
  let actionItemsHtml = "";
  if (meeting.actionItems && meeting.actionItems.length > 0) {
    actionItemsHtml = `
      <table class="report-table">
        <thead>
          <tr>
            <th style="width: 5%; text-align: center;">#</th>
            <th style="width: 40%;">Action Description</th>
            <th style="width: 22%;">Owner</th>
            <th style="width: 15%; white-space: nowrap;">Due Date</th>
            <th style="width: 18%;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${meeting.actionItems
        .map(
          (a, idx) => `
            <tr>
              <td style="text-align: center; color: #64748b;">${idx + 1}</td>
              <td>
                <strong>${a.title}</strong>
                ${a.description ? `<br><span style="color:#64748b; font-size:8pt;">${a.description}</span>` : ""}
              </td>
              <td>${a.assignedTo?.name || "Unassigned"}</td>
              <td style="white-space: nowrap;">${new Date(a.deadline).toLocaleDateString()}</td>
              <td>
                <span style="font-weight:600; color:${a.status === 'COMPLETED' ? '#15803d' : a.overdue ? '#b91c1c' : '#0369a1'
            }">${a.status.replace("_", " ")}</span>
                <span style="font-size:7.5pt; color:#64748b;">(${a.priority})</span>
              </td>
            </tr>
          `
        )
        .join("")}
        </tbody>
      </table>
    `;
  } else {
    actionItemsHtml = `<p class="empty-note">No action items assigned for this meeting.</p>`;
  }

  // 8. Risks
  const risksHtml = `<p class="empty-note">No risks were noted for this meeting.</p>`;

  // 9. Follow-Up Items
  const followUpHtml = `<p class="empty-note">No follow-up items were noted.</p>`;

  // 10. Documents / Attachments
  let documentsHtml = "";
  if (meeting.documents && meeting.documents.length > 0) {
    documentsHtml = `
      <table class="report-table">
        <thead>
          <tr>
            <th style="width: 6%; text-align: center;">#</th>
            <th style="width: 44%;">Document Name</th>
            <th style="width: 20%;">File Type</th>
            <th style="width: 14%;">Size</th>
            <th style="width: 16%;">Uploaded By</th>
          </tr>
        </thead>
        <tbody>
          ${meeting.documents
        .map((doc, idx) => {
          const sizeStr = doc.fileSize
            ? doc.fileSize > 1024 * 1024
              ? `${(doc.fileSize / (1024 * 1024)).toFixed(1)} MB`
              : `${Math.round(doc.fileSize / 1024)} KB`
            : "—";
          return `
                <tr>
                  <td style="text-align: center; color: #64748b;">${idx + 1}</td>
                  <td><strong>${doc.fileName}</strong></td>
                  <td style="font-family:monospace; font-size:7.5pt;">${doc.fileType || "Document"}</td>
                  <td>${sizeStr}</td>
                  <td>${doc.uploadedBy?.name || "Member"}</td>
                </tr>
              `;
        })
        .join("")}
        </tbody>
      </table>
    `;
  } else {
    documentsHtml = `<p class="empty-note">No documents attached to this meeting.</p>`;
  }

  // 11. Finalization / Approval
  const isApproved = meeting.status === "APPROVED";
  const approvalHtml = `
    <div class="finalization-box ${isApproved ? 'approved' : ''}">
      <div class="approval-content">
        <div class="approval-details">
          <h4>${isApproved ? "✓ Formally Approved & Certified Corporate Record" : "Meeting Proceedings Record"}</h4>
          <p><strong>Prepared By:</strong> ${recordedBy}</p>
          <p><strong>Approved By:</strong> ${meeting.approvedBy?.name || "Pending Formal Approval"}</p>
          <p><strong>Approval Date:</strong> ${meeting.approvedAt ? new Date(meeting.approvedAt).toLocaleString() : "Pending"}</p>
          <p><strong>Status:</strong> ${statusLabel}</p>
        </div>
        ${meeting.approvalSignature
      ? `
          <div class="seal-container">
            <img src="${meeting.approvalSignature}" alt="Reviewer Signature" class="seal-img" />
            <div class="seal-label">Official Reviewer Seal</div>
          </div>
        `
      : `
          <div class="seal-container" style="border-style:dashed;">
            <div style="height:35px; border-bottom:1px solid #cbd5e1; margin-bottom:4px;"></div>
            <div class="seal-label">Signature / Attestation</div>
          </div>
        `
    }
      </div>
    </div>
  `;

  return `
    <!-- 1. Ahununu Logistics Header -->
    <div class="letterhead-header">
      <div class="letterhead-brand">
        <img src="/logo.png" alt="Ahununu Logistics" class="letterhead-logo" />
        <div>
          <h2 class="letterhead-company">AHUNUNU LOGISTICS</h2>
          <div class="letterhead-portal">MEETING MANAGEMENT PORTAL</div>
        </div>
      </div>
      <div class="letterhead-doc-type">
        <div class="doc-title-badge">OFFICIAL MEETING MINUTES</div>
        <div class="doc-ref-code">${meeting.code}</div>
      </div>
    </div>

    <!-- 2. Meeting Information -->
    <h2 class="section-header">Meeting Information</h2>
    <table class="info-table">
      <tr>
        <td class="info-label">Meeting Title</td>
        <td class="info-val"><strong>${meeting.title}</strong></td>
        <td class="info-label">Department</td>
        <td class="info-val">${meeting.department?.name || "General"}</td>
      </tr>
      <tr>
        <td class="info-label">Date</td>
        <td class="info-val">${meetingDateFormatted}</td>
        <td class="info-label">Time</td>
        <td class="info-val">${timeFormatted}</td>
      </tr>
      <tr>
        <td class="info-label">Meeting Type</td>
        <td class="info-val">${meetingType}</td>
        <td class="info-label">Location</td>
        <td class="info-val">${locationFormatted}</td>
      </tr>
      <tr>
        <td class="info-label">Organizer / Chair</td>
        <td class="info-val">${meeting.organizer?.name || "Organizer"}</td>
        <td class="info-label">Reference Code</td>
        <td class="info-val"><strong style="font-family:monospace;">${meeting.code}</strong></td>
      </tr>
      <tr>
        <td class="info-label">Purpose</td>
        <td class="info-val" colspan="3">${purposeFormatted}</td>
      </tr>
      <tr>
        <td class="info-label">Recorded By</td>
        <td class="info-val">${recordedBy}</td>
        <td class="info-label">Record Date</td>
        <td class="info-val">${recordDate}</td>
      </tr>
      <tr>
        <td class="info-label">Meeting Status</td>
        <td class="info-val"><span class="badge ${statusClass}">${statusLabel}</span></td>
        <td class="info-label">Priority</td>
        <td class="info-val">${meeting.priority}</td>
      </tr>
    </table>

    <!-- 3. Attendance -->
    <h2 class="section-header">Attendance</h2>
    ${attendanceHtml}

    <!-- 4. Agenda -->
    <h2 class="section-header">Agenda</h2>
    ${agendaHtml}

    <!-- 5. Discussion / Proceedings -->
    <h2 class="section-header">Discussion / Proceedings</h2>
    ${fullProceedingsHtml}

    <!-- 6. Decisions / Outcomes -->
    <h2 class="section-header">Decisions / Outcomes</h2>
    ${decisionsHtml}

    <!-- 7. Action Items -->
    <h2 class="section-header">Action Items</h2>
    ${actionItemsHtml}

    <!-- 8. Risks -->
    <h2 class="section-header">Risks</h2>
    ${risksHtml}

    <!-- 9. Follow-Up Items -->
    <h2 class="section-header">Follow-Up Items</h2>
    ${followUpHtml}

    <!-- 10. Documents -->
    <h2 class="section-header">Documents</h2>
    ${documentsHtml}

    <!-- 11. Finalization / Approval -->
    <h2 class="section-header">Finalization / Approval</h2>
    ${approvalHtml}

    <!-- Footer -->
    <div class="print-footer">
      <div>Ahununu Logistics Corporate Records — Confidential Document</div>
      <div>Generated on ${generatedDate} via Meeting Management Portal</div>
    </div>
  `;
}

/**
 * Print utility designed specifically to print the FULL Meeting Minutes content
 * with all 11 sections, complete attendance roster, agenda, proceedings, decisions, action items, documents, and approval.
 */
export function printMeetingMinutes({
  meeting,
  minutesContent,
  customTitle,
}: PrintMeetingMinutesOptions): void {
  const html = generateFullMeetingMinutesHtml(meeting, minutesContent);
  printHtml(html, {
    title: `${meeting.code} — Meeting Minutes — Ahununu Logistics`,
  });
}

/**
 * Print a specific DOM element by ID or Element reference
 */
export function printElement(
  elementOrId: string | HTMLElement,
  options: { title?: string; extraStyles?: string } = {}
): void {
  const el = typeof elementOrId === "string" ? document.getElementById(elementOrId) : elementOrId;
  if (!el) {
    window.print();
    return;
  }

  const content = el.innerHTML;
  const wrappedHtml = `
    <div class="printed-element-wrapper">
      ${content}
    </div>
    ${options.extraStyles ? `<style>${options.extraStyles}</style>` : ""}
  `;

  printHtml(wrappedHtml, {
    title: options.title || "Print Report — Ahununu Logistics",
  });
}
