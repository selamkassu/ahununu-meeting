import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getActionItemAssignees, type MeetingDetail, type MeetingMinutes, type MinutesOverviewItem } from "../types";

export interface DepartmentPerformanceItem {
  department: string;
  total: number;
  completed: number;
  overdue: number;
  completionRate: number;
}

/**
 * Format timestamp matching "September 25, 2026 at 11:05 AM"
 */
export function formatReportDateTime(date: Date = new Date()): string {
  const dateStr = date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${dateStr} at ${timeStr}`;
}

/**
 * Strip HTML tags to convert rich text into clean plain text
 */
export function stripHtml(html: string): string {
  if (!html) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

/**
 * Clean HTML content for Word/Document export
 */
function getDocumentHtml(meeting: MeetingDetail, contentHtml: string): string {
  const generatedAt = formatReportDateTime(new Date());
  const meetingDateFormatted = new Date(meeting.date).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeFormatted = `${meeting.startTime || "00:00"} - ${meeting.endTime || "00:00"}`;
  const locationFormatted = meeting.location || (meeting.onlineLink ? "Online / Virtual" : "Office");

  return `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset="utf-8">
      <title>${meeting.code} - Meeting Minutes</title>
      <style>
        body {
          font-family: 'Segoe UI', Arial, sans-serif;
          font-size: 11pt;
          line-height: 1.6;
          color: #1e293b;
          margin: 30px;
        }
        .header {
          border-bottom: 2px solid #0B7A6B;
          padding-bottom: 15px;
          margin-bottom: 20px;
        }
        .company-name {
          font-size: 16pt;
          font-weight: bold;
          color: #0B7A6B;
          margin: 0;
        }
        .portal-name {
          font-size: 9pt;
          color: #64748b;
          text-transform: uppercase;
        }
        .doc-title {
          font-size: 18pt;
          font-weight: bold;
          color: #0f172a;
          margin: 15px 0 5px 0;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 15px 0;
        }
        th, td {
          border: 1px solid #cbd5e1;
          padding: 8px 12px;
          text-align: left;
        }
        th {
          background-color: #f1f5f9;
          color: #0f172a;
          font-weight: bold;
        }
        .meta-table {
          margin-bottom: 25px;
        }
        .meta-table td {
          background-color: #f8fafc;
        }
        .footer {
          margin-top: 40px;
          border-top: 1px solid #cbd5e1;
          padding-top: 10px;
          font-size: 8.5pt;
          color: #64748b;
        }
        blockquote {
          border-left: 3px solid #0B7A6B;
          margin: 10px 0;
          padding-left: 15px;
          color: #475569;
          font-style: italic;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1 class="company-name">AHUNUNU LOGISTICS</h1>
        <div class="portal-name">Meeting Management Portal — Official Corporate Records</div>
      </div>

      <div class="doc-title">${meeting.title}</div>
      <p style="color: #64748b; margin-top: 0;">Meeting Reference: <strong>${meeting.code}</strong></p>

      <table class="meta-table">
        <tr>
          <td><strong>Department:</strong> ${meeting.department?.name || "General"}</td>
          <td><strong>Status:</strong> ${meeting.status.replace("_", " ")}</td>
        </tr>
        <tr>
          <td><strong>Date:</strong> ${meetingDateFormatted}</td>
          <td><strong>Time:</strong> ${timeFormatted}</td>
        </tr>
        <tr>
          <td><strong>Location:</strong> ${locationFormatted}</td>
          <td><strong>Organizer:</strong> ${meeting.organizer?.name || "Organizer"}</td>
        </tr>
      </table>

      <h2 style="color: #0B7A6B; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">Meeting Minutes & Proceedings</h2>
      <div>
        ${contentHtml || "<p><em>No minutes recorded for this meeting.</em></p>"}
      </div>

      ${meeting.decisions && meeting.decisions.length > 0
      ? `
        <h2 style="color: #0B7A6B; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-top: 30px;">Key Decisions</h2>
        <table>
          <thead>
            <tr>
              <th>Decision</th>
              <th>Details</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${meeting.decisions
        .map(
          (d) => `
              <tr>
                <td><strong>${d.title}</strong></td>
                <td>${d.description || "—"}</td>
                <td>${d.status.replace("_", " ")}</td>
              </tr>
            `
        )
        .join("")}
          </tbody>
        </table>
      `
      : ""
    }

      ${meeting.actionItems && meeting.actionItems.length > 0
      ? `
        <h2 style="color: #0B7A6B; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-top: 30px;">Assigned Action Items</h2>
        <table>
          <thead>
            <tr>
              <th>Action Item</th>
              <th>Assignee</th>
              <th>Due Date</th>
              <th>Priority</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${meeting.actionItems
        .map(
          (a) => `
              <tr>
                <td><strong>${a.title}</strong></td>
                <td>${getActionItemAssignees(a).map(u => u.name).join(", ") || a.assignedTo?.name || "Unassigned"}</td>
                <td>${new Date(a.deadline).toLocaleDateString()}</td>
                <td>${a.priority}</td>
                <td>${a.status.replace("_", " ")}</td>
              </tr>
            `
        )
        .join("")}
          </tbody>
        </table>
      `
      : ""
    }

      ${meeting.status === "APPROVED"
      ? `
        <div style="margin-top: 30px; border: 1.5px solid #86efac; background-color: #f0fdf4; padding: 15px; border-radius: 6px;">
          <h3 style="color: #15803d; margin: 0 0 5px 0;">✓ Formally Approved & Certified Corporate Record</h3>
          <p style="margin: 0; font-size: 10pt; color: #166534;">
            Approved by <strong>${meeting.approvedBy?.name || "Authorized Reviewer"}</strong> on ${meeting.approvedAt ? new Date(meeting.approvedAt).toLocaleString() : ""
      }
          </p>
        </div>
      `
      : ""
    }

      <div class="footer">
        <div>Ahununu Logistics Corporate Records — Confidential Document</div>
        <div>Generated: ${generatedAt} via Meeting Management Portal</div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Export Department Performance to structured Excel (.xlsx) file
 */
export function exportDepartmentPerformanceToExcel(data: DepartmentPerformanceItem[]) {
  const rows = data.map((d) => ({
    "Department": d.department,
    "Total Action Items": d.total,
    "Completed": d.completed,
    "Overdue": d.overdue,
    "Completion Rate": `${d.completionRate}%`,
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Column widths
  worksheet["!cols"] = [
    { wch: 22 }, // Department
    { wch: 20 }, // Total Action Items
    { wch: 14 }, // Completed
    { wch: 14 }, // Overdue
    { wch: 18 }, // Completion Rate
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Department Performance");
  XLSX.writeFile(workbook, "Department_Performance.xlsx");
}

/**
 * Export Department Performance to PDF (.pdf) file
 */
export function exportDepartmentPerformanceToPdf(data: DepartmentPerformanceItem[]) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const generatedAt = `Generated: ${formatReportDateTime(new Date())}`;

  // Company Brand Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(11, 122, 107); // brand #0B7A6B
  doc.text("AHUNUNU LOGISTICS", 14, 15);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("Meeting Management Portal", 14, 20);

  // Document Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(30, 41, 59); // slate-800
  doc.text("Department Performance", 14, 29);

  // Subtitle with timestamp
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text(generatedAt, 14, 35);

  // Department Performance Table
  autoTable(doc, {
    startY: 40,
    head: [["Department", "Total Action Items", "Completed", "Overdue", "Completion Rate"]],
    body: data.map((d) => [
      d.department,
      d.total.toString(),
      d.completed.toString(),
      d.overdue.toString(),
      `${d.completionRate}%`,
    ]),
    theme: "striped",
    headStyles: {
      fillColor: [11, 122, 107], // brand #0B7A6B
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9,
    },
    columnStyles: {
      0: { halign: "left" },
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
    },
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: 3,
      overflow: "linebreak",
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { top: 30, bottom: 20, left: 14, right: 14 },
    showHead: "everyPage", // repeat table header across pages
  });

  // Page numbering on every page
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(
      `Page ${i} of ${totalPages}`,
      doc.internal.pageSize.getWidth() - 14,
      doc.internal.pageSize.getHeight() - 10,
      { align: "right" }
    );
  }

  doc.save("Department_Performance.pdf");
}

/**
 * Export Meeting Minutes to PDF (.pdf) file
 */
export function exportMeetingMinutesToPdf(meeting: MeetingDetail, minutesContent?: string) {
  let content = minutesContent;
  if (!content) {
    const summaryMinute = (meeting.minutes || []).find(
      (m: MeetingMinutes) => m.type === "SUMMARY" || (!m.type && !m.attendeeId)
    );
    content = summaryMinute?.content || "";
  }

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const generatedAt = `Generated: ${formatReportDateTime(new Date())}`;
  const pageWidth = doc.internal.pageSize.getWidth();

  // Top Brand Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(11, 122, 107); // brand #0B7A6B
  doc.text("AHUNUNU LOGISTICS", 14, 15);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("Meeting Management Portal — Official Records", 14, 20);

  // Document Code badge
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(meeting.code, pageWidth - 14, 15, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Status: ${meeting.status}`, pageWidth - 14, 20, { align: "right" });

  // Divider line
  doc.setDrawColor(11, 122, 107);
  doc.setLineWidth(0.6);
  doc.line(14, 23, pageWidth - 14, 23);

  // Meeting Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  const titleLines = doc.splitTextToSize(meeting.title, pageWidth - 28);
  doc.text(titleLines, 14, 31);
  let currentY = 31 + titleLines.length * 6;

  // Metadata Table
  const meetingDateFormatted = new Date(meeting.date).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeFormatted = `${meeting.startTime || "00:00"} - ${meeting.endTime || "00:00"}`;
  const locationFormatted = meeting.location || (meeting.onlineLink ? "Online / Virtual" : "Office");

  autoTable(doc, {
    startY: currentY,
    head: [["Meeting Details", ""]],
    body: [
      ["Department", meeting.department?.name || "General"],
      ["Date & Time", `${meetingDateFormatted} (${timeFormatted})`],
      ["Location", locationFormatted],
      ["Meeting Organizer", meeting.organizer?.name || "Organizer"],
      ["Generated", generatedAt],
    ],
    theme: "plain",
    styles: {
      fontSize: 8.5,
      cellPadding: 2,
      font: "helvetica",
    },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 45, textColor: [71, 85, 105] },
      1: { textColor: [30, 41, 59] },
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [11, 122, 107],
      fontSize: 9,
      fontStyle: "bold",
    },
    margin: { left: 14, right: 14 },
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // Section: Meeting Minutes Content
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(11, 122, 107);
  doc.text("Meeting Minutes & Proceedings", 14, currentY);
  currentY += 6;

  const plainContent = stripHtml(content);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(30, 41, 59);

  const contentLines = doc.splitTextToSize(
    plainContent || "No detailed summary recorded for this meeting.",
    pageWidth - 28
  );

  // Render text lines, handling page breaks
  const lineHeight = 4.8;
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let i = 0; i < contentLines.length; i++) {
    if (currentY + lineHeight > pageHeight - 20) {
      doc.addPage();
      currentY = 20;
    }
    doc.text(contentLines[i], 14, currentY);
    currentY += lineHeight;
  }

  currentY += 6;

  // Supplementary: Key Decisions
  if (meeting.decisions && meeting.decisions.length > 0) {
    if (currentY + 25 > pageHeight - 20) {
      doc.addPage();
      currentY = 20;
    }

    autoTable(doc, {
      startY: currentY,
      head: [["Key Decisions", "Details", "Status"]],
      body: meeting.decisions.map((d) => [
        d.title,
        d.description || "—",
        d.status.replace("_", " "),
      ]),
      headStyles: {
        fillColor: [11, 122, 107],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8.5,
      },
      styles: {
        fontSize: 8,
        font: "helvetica",
        cellPadding: 2.5,
      },
      columnStyles: {
        0: { cellWidth: 50, fontStyle: "bold" },
        1: { cellWidth: 90 },
        2: { cellWidth: 40 },
      },
      margin: { left: 14, right: 14 },
    });

    currentY = (doc as any).lastAutoTable.finalY + 8;
  }

  // Supplementary: Action Items
  if (meeting.actionItems && meeting.actionItems.length > 0) {
    if (currentY + 25 > pageHeight - 20) {
      doc.addPage();
      currentY = 20;
    }

    autoTable(doc, {
      startY: currentY,
      head: [["Action Item", "Assignee", "Due Date", "Priority", "Status"]],
      body: meeting.actionItems.map((a) => [
        a.title,
        getActionItemAssignees(a).map(u => u.name).join(", ") || a.assignedTo?.name || "Unassigned",
        new Date(a.deadline).toLocaleDateString(),
        a.priority,
        a.status.replace("_", " "),
      ]),
      headStyles: {
        fillColor: [11, 122, 107],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8.5,
      },
      styles: {
        fontSize: 8,
        font: "helvetica",
        cellPadding: 2.5,
      },
      margin: { left: 14, right: 14 },
    });

    currentY = (doc as any).lastAutoTable.finalY + 8;
  }

  // Supplementary: Formal Approval Block
  if (meeting.status === "APPROVED") {
    if (currentY + 20 > pageHeight - 20) {
      doc.addPage();
      currentY = 20;
    }

    doc.setDrawColor(134, 239, 172);
    doc.setFillColor(240, 253, 244);
    doc.roundedRect(14, currentY, pageWidth - 28, 16, 2, 2, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(21, 128, 61);
    doc.text("✓ Formally Approved & Certified Corporate Record", 18, currentY + 6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(22, 101, 52);
    doc.text(
      `Approved by ${meeting.approvedBy?.name || "Authorized Reviewer"}${meeting.approvedAt ? ` on ${new Date(meeting.approvedAt).toLocaleString()}` : ""
      }`,
      18,
      currentY + 11
    );
  }

  // Page Numbers and Footer on Every Page
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      "Ahununu Logistics Corporate Records — Confidential Document",
      14,
      doc.internal.pageSize.getHeight() - 8
    );
    doc.text(
      `Page ${i} of ${totalPages}`,
      pageWidth - 14,
      doc.internal.pageSize.getHeight() - 8,
      { align: "right" }
    );
  }

  const safeFileName = `${meeting.code.replace(/[^a-zA-Z0-9_-]/g, "_")}_Minutes.pdf`;
  doc.save(safeFileName);
}

/**
 * Export Meeting Minutes to Microsoft Word document (.doc)
 */
export function exportMeetingMinutesToDoc(meeting: MeetingDetail, minutesContent?: string) {
  let content = minutesContent;
  if (!content) {
    const summaryMinute = (meeting.minutes || []).find(
      (m: MeetingMinutes) => m.type === "SUMMARY" || (!m.type && !m.attendeeId)
    );
    content = summaryMinute?.content || "";
  }

  const html = getDocumentHtml(meeting, content);
  const blob = new Blob(["\ufeff", html], {
    type: "application/msword;charset=utf-8",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${meeting.code.replace(/[^a-zA-Z0-9_-]/g, "_")}_Minutes.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export Meeting Minutes and structured report to Excel (.xlsx)
 */
export function exportMeetingMinutesToExcel(meeting: MeetingDetail, minutesContent?: string) {
  let content = minutesContent;
  if (!content) {
    const summaryMinute = (meeting.minutes || []).find(
      (m: MeetingMinutes) => m.type === "SUMMARY" || (!m.type && !m.attendeeId)
    );
    content = summaryMinute?.content || "";
  }

  const workbook = XLSX.utils.book_new();

  // Sheet 1: Minutes Overview
  const overviewRows = [
    { Field: "Meeting Title", Value: meeting.title },
    { Field: "Meeting Code", Value: meeting.code },
    { Field: "Department", Value: meeting.department?.name || "General" },
    { Field: "Date", Value: new Date(meeting.date).toLocaleDateString() },
    { Field: "Time", Value: `${meeting.startTime || "00:00"} - ${meeting.endTime || "00:00"}` },
    { Field: "Location", Value: meeting.location || (meeting.onlineLink ? "Online / Virtual" : "Office") },
    { Field: "Status", Value: meeting.status },
    { Field: "Organizer", Value: meeting.organizer?.name || "Organizer" },
    { Field: "Summary / Minutes", Value: stripHtml(content) },
    { Field: "Generated At", Value: formatReportDateTime(new Date()) },
  ];

  const overviewSheet = XLSX.utils.json_to_sheet(overviewRows);
  overviewSheet["!cols"] = [{ wch: 22 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(workbook, overviewSheet, "Meeting Minutes");

  // Sheet 2: Action Items (if available)
  if (meeting.actionItems && meeting.actionItems.length > 0) {
    const actionRows = meeting.actionItems.map((a) => ({
      "Action Item": a.title,
      "Assignee": getActionItemAssignees(a).map(u => u.name).join(", ") || a.assignedTo?.name || "Unassigned",
      "Due Date": new Date(a.deadline).toLocaleDateString(),
      "Priority": a.priority,
      "Status": a.status,
    }));
    const actionSheet = XLSX.utils.json_to_sheet(actionRows);
    actionSheet["!cols"] = [{ wch: 35 }, { wch: 22 }, { wch: 15 }, { wch: 12 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(workbook, actionSheet, "Action Items");
  }

  // Sheet 3: Decisions (if available)
  if (meeting.decisions && meeting.decisions.length > 0) {
    const decisionRows = meeting.decisions.map((d) => ({
      "Decision": d.title,
      "Context / Details": d.description || "",
      "Status": d.status,
    }));
    const decisionSheet = XLSX.utils.json_to_sheet(decisionRows);
    decisionSheet["!cols"] = [{ wch: 35 }, { wch: 50 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(workbook, decisionSheet, "Decisions");
  }

  // Sheet 4: Participants
  if (meeting.participants && meeting.participants.length > 0) {
    const participantRows = meeting.participants.map((p) => ({
      "Name": p.user.name,
      "Email": p.user.email,
      "Role": p.user.role?.name || "Participant",
      "Invitation Status": p.status === "ACCEPTED" ? "Accepted" : (p.status === "REJECTED" || p.status === "DECLINED") ? "Rejected" : "Awaiting Response",
      "Rejection Reason": p.rejectionReason || "",
      "Attended": p.participated ? "Yes" : "No",
    }));
    const participantSheet = XLSX.utils.json_to_sheet(participantRows);
    participantSheet["!cols"] = [{ wch: 25 }, { wch: 30 }, { wch: 15 }, { wch: 16 }, { wch: 28 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(workbook, participantSheet, "Attendees");
  }

  const safeFileName = `${meeting.code.replace(/[^a-zA-Z0-9_-]/g, "_")}_Meeting_Summary.xlsx`;
  XLSX.writeFile(workbook, safeFileName);
}

/**
 * Export Meeting Minutes to Plain Text (.txt)
 */
export function exportMeetingMinutesToText(meeting: MeetingDetail, minutesContent?: string) {
  let content = minutesContent;
  if (!content) {
    const summaryMinute = (meeting.minutes || []).find(
      (m: MeetingMinutes) => m.type === "SUMMARY" || (!m.type && !m.attendeeId)
    );
    content = summaryMinute?.content || "";
  }

  const meetingDateFormatted = new Date(meeting.date).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const locationFormatted = meeting.location || (meeting.onlineLink ? "Online / Virtual" : "Office");

  let text = `=======================================================\n`;
  text += `AHUNUNU LOGISTICS — OFFICIAL MEETING MINUTES\n`;
  text += `=======================================================\n\n`;
  text += `Meeting Title:   ${meeting.title}\n`;
  text += `Reference Code:  ${meeting.code}\n`;
  text += `Department:      ${meeting.department?.name || "General"}\n`;
  text += `Date:            ${meetingDateFormatted}\n`;
  text += `Time:            ${meeting.startTime || "00:00"} - ${meeting.endTime || "00:00"}\n`;
  text += `Location:        ${locationFormatted}\n`;
  text += `Organizer:       ${meeting.organizer?.name || "Organizer"}\n`;
  text += `Status:          ${meeting.status}\n`;
  text += `Generated At:    ${formatReportDateTime(new Date())}\n\n`;

  text += `-------------------------------------------------------\n`;
  text += `MEETING MINUTES & PROCEEDINGS\n`;
  text += `-------------------------------------------------------\n\n`;
  text += `${stripHtml(content) || "No detailed summary recorded."}\n\n`;

  if (meeting.decisions && meeting.decisions.length > 0) {
    text += `-------------------------------------------------------\n`;
    text += `KEY DECISIONS\n`;
    text += `-------------------------------------------------------\n`;
    meeting.decisions.forEach((d, idx) => {
      text += `${idx + 1}. ${d.title}\n`;
      if (d.description) text += `   Details: ${d.description}\n`;
      text += `   Status: ${d.status}\n\n`;
    });
  }

  if (meeting.actionItems && meeting.actionItems.length > 0) {
    text += `-------------------------------------------------------\n`;
    text += `ASSIGNED ACTION ITEMS\n`;
    text += `-------------------------------------------------------\n`;
    meeting.actionItems.forEach((a, idx) => {
      text += `${idx + 1}. [${a.status}] ${a.title}\n`;
      text += `   Assignee: ${getActionItemAssignees(a).map(u => u.name).join(", ") || a.assignedTo?.name || "Unassigned"} | Priority: ${a.priority} | Due: ${new Date(
        a.deadline
      ).toLocaleDateString()}\n\n`;
    });
  }

  if (meeting.status === "APPROVED" && meeting.approvedBy) {
    text += `-------------------------------------------------------\n`;
    text += `FORMAL APPROVAL & ATTESTATION\n`;
    text += `-------------------------------------------------------\n`;
    text += `Approved By: ${meeting.approvedBy.name} on ${meeting.approvedAt ? new Date(meeting.approvedAt).toLocaleString() : ""
      }\n\n`;
  }

  text += `=======================================================\n`;
  text += `Ahununu Logistics Corporate Records — Confidential\n`;

  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${meeting.code.replace(/[^a-zA-Z0-9_-]/g, "_")}_Minutes.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export all Meeting Minutes from overview to Excel (.xlsx)
 */
export function exportAllMinutesToExcel(items: MinutesOverviewItem[]) {
  const rows = items.map((m) => ({
    "Meeting Title": m.meeting.title,
    "Meeting Code": m.meeting.code,
    "Department": m.meeting.department?.name || "",
    "Meeting Date": new Date(m.meeting.date).toLocaleDateString(),
    "Recorded By": m.recordedBy?.name || "",
    "Recorded Date": new Date(m.createdAt).toLocaleDateString(),
    "Minutes Summary": stripHtml(m.content),
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!cols"] = [
    { wch: 30 },
    { wch: 16 },
    { wch: 20 },
    { wch: 15 },
    { wch: 20 },
    { wch: 15 },
    { wch: 60 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Minutes Overview");
  XLSX.writeFile(workbook, "Ahununu_Meeting_Minutes_Overview.xlsx");
}

/**
 * Export all Meeting Minutes from overview to PDF (.pdf)
 */
export function exportAllMinutesToPdf(items: MinutesOverviewItem[]) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const generatedAt = `Generated: ${formatReportDateTime(new Date())}`;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(11, 122, 107);
  doc.text("AHUNUNU LOGISTICS", 14, 15);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("Meeting Management Portal — Corporate Minutes Overview", 14, 20);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(30, 41, 59);
  doc.text("Meeting Minutes Overview", 14, 29);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(generatedAt, 14, 35);

  autoTable(doc, {
    startY: 40,
    head: [["Meeting", "Code", "Department", "Date", "Summary Snippet", "Recorded By"]],
    body: items.map((m) => {
      const plain = stripHtml(m.content);
      const snippet = plain.length > 80 ? `${plain.substring(0, 80)}...` : plain;
      return [
        m.meeting.title,
        m.meeting.code,
        m.meeting.department?.name || "",
        new Date(m.meeting.date).toLocaleDateString(),
        snippet,
        m.recordedBy?.name || "",
      ];
    }),
    theme: "striped",
    headStyles: {
      fillColor: [11, 122, 107],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8.5,
    },
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 2.5,
      overflow: "linebreak",
    },
    margin: { top: 30, bottom: 20, left: 14, right: 14 },
    showHead: "everyPage",
  });

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Page ${i} of ${totalPages}`,
      doc.internal.pageSize.getWidth() - 14,
      doc.internal.pageSize.getHeight() - 10,
      { align: "right" }
    );
  }

  doc.save("Ahununu_Meeting_Minutes_Overview.pdf");
}
