import React, { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { Printer, Download, ChevronDown, FileSpreadsheet, FileText } from "lucide-react";
import { api } from "../api/client";
import type { MinutesOverviewItem, MeetingDetail } from "../types";
import { Card, CardHeader, EmptyState, CodeChip, Button } from "../components/ui/Primitives";
import { RichTextRenderer } from "../components/editor/RichTextRenderer";
import { printHtml, printMeetingMinutes } from "../utils/printUtility";
import {
  exportAllMinutesToExcel,
  exportAllMinutesToPdf,
  exportMeetingMinutesToPdf,
  formatReportDateTime,
} from "../utils/exportReport";

export default function MinutesOverviewPage() {
  const [items, setItems] = useState<MinutesOverviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .get<MinutesOverviewItem[]>("/meetings/minutes-overview/recent")
      .then(setItems)
      .finally(() => setLoading(false));
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setExportMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handlePrintOverview = () => {
    const generatedDate = formatReportDateTime(new Date());
    const tableRows = items
      .map(
        (m) => `
      <tr>
        <td>
          <strong>${m.meeting.title}</strong><br>
          <span style="font-family:monospace; font-size:7.5pt; color:#64748b;">${m.meeting.code}</span>
        </td>
        <td>${m.meeting.department?.name || "General"}</td>
        <td>${new Date(m.meeting.date).toLocaleDateString()}</td>
        <td>${m.content}</td>
        <td>${m.recordedBy.name}</td>
      </tr>
    `
      )
      .join("");

    const overviewHtml = `
      <div class="letterhead-header">
        <div class="letterhead-brand">
          <img src="/logo.png" alt="Ahununu Logistics" class="letterhead-logo" />
          <div>
            <h2 class="letterhead-company">AHUNUNU LOGISTICS</h2>
            <div class="letterhead-portal">Meeting Management Portal</div>
          </div>
        </div>
        <div class="letterhead-doc-type">
          <div class="doc-title-badge">Corporate Minutes Overview</div>
          <div class="doc-ref-code">${items.length} Recorded Proceedings</div>
        </div>
      </div>

      <h1 style="margin: 0 0 6px 0;">Meeting Minutes Overview</h1>
      <p style="font-size: 8.5pt; color: #64748b; margin-top: 0;">
        Official proceedings and executive summaries recorded across Ahununu Logistics departments.
      </p>

      <table>
        <thead>
          <tr>
            <th style="width: 22%;">Meeting & Code</th>
            <th style="width: 14%;">Department</th>
            <th style="width: 12%;">Date</th>
            <th style="width: 38%;">Minutes Summary</th>
            <th style="width: 14%;">Recorded By</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>

      <div class="doc-footer">
        <div>Ahununu Logistics Corporate Records · Confidential</div>
        <div>Generated on ${generatedDate} via Meeting Management Portal</div>
      </div>
    `;

    printHtml(overviewHtml, {
      title: "Meeting Minutes Overview — Ahununu Logistics",
    });
  };

  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const handlePrintSingleMinute = async (m: MinutesOverviewItem) => {
    try {
      setActionLoadingId(`print-${m.id}`);
      const fullMeeting = await api.get<MeetingDetail>(`/meetings/${m.meeting.id}`);
      printMeetingMinutes({
        meeting: fullMeeting,
        minutesContent: m.content,
      });
    } catch (err) {
      console.error("Failed to load meeting details for full print report:", err);
      // Fallback with minimal mock meeting if API request encounters an issue
      const fallbackMeeting: any = {
        ...m.meeting,
        id: m.meeting.id,
        code: m.meeting.code,
        title: m.meeting.title,
        date: m.meeting.date,
        startTime: "09:00",
        endTime: "10:00",
        department: m.meeting.department,
        organizer: m.recordedBy,
        status: "APPROVED",
        priority: "MEDIUM",
        minutes: [m],
        participants: [],
        agendaItems: [],
        decisions: [],
        actionItems: [],
        documents: [],
      };
      printMeetingMinutes({
        meeting: fallbackMeeting,
        minutesContent: m.content,
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleExportSingleMinutePdf = async (m: MinutesOverviewItem) => {
    try {
      setActionLoadingId(`pdf-${m.id}`);
      const fullMeeting = await api.get<MeetingDetail>(`/meetings/${m.meeting.id}`);
      exportMeetingMinutesToPdf(fullMeeting, m.content);
    } catch (err) {
      console.error("Failed to load meeting details for PDF export:", err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const headerActions = (
    <div className="flex items-center gap-2">
      <Button
        variant="secondary"
        onClick={handlePrintOverview}
        id="print-minutes-overview-btn"
        className="h-8 px-3 text-xs font-medium inline-flex items-center gap-1.5"
        title="Print Minutes Overview"
        disabled={loading || items.length === 0}
      >
        <Printer size={13} className="text-slate2-600" />
        <span>Print Overview</span>
      </Button>

      <div className="relative inline-flex" ref={exportMenuRef}>
        <Button
          variant="secondary"
          onClick={() => {
            if (items.length > 0) exportAllMinutesToExcel(items);
          }}
          id="export-minutes-overview-btn"
          className="h-8 rounded-r-none border-r-0 px-3 text-xs font-medium inline-flex items-center gap-1.5"
          title="Export to Excel (.xlsx)"
          disabled={loading || items.length === 0}
        >
          <Download size={13} className="text-slate2-600" />
          <span>Export</span>
        </Button>
        <button
          type="button"
          id="export-minutes-overview-options-btn"
          onClick={() => setExportMenuOpen(!exportMenuOpen)}
          disabled={loading || items.length === 0}
          className="focus-ring inline-flex h-8 items-center rounded-r-lg border border-slate2-200 bg-white px-2 text-slate2-600 hover:bg-slate2-50 disabled:opacity-50"
          title="Export format options"
          aria-label="Export format options"
        >
          <ChevronDown size={13} />
        </button>

        {exportMenuOpen && (
          <div className="absolute right-0 top-full z-30 mt-1 w-52 rounded-lg border border-slate2-200 bg-white py-1 shadow-lg">
            <button
              type="button"
              onClick={() => {
                exportAllMinutesToExcel(items);
                setExportMenuOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate2-700 hover:bg-slate2-50"
            >
              <FileSpreadsheet size={15} className="text-emerald-600" />
              <span>Excel Spreadsheet (.xlsx)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                exportAllMinutesToPdf(items);
                setExportMenuOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate2-700 hover:bg-slate2-50"
            >
              <FileText size={15} className="text-rose-600" />
              <span>PDF Document (.pdf)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader
        title="Meeting Minutes"
        subtitle="The most recently recorded minutes across Ahununu Logistics"
        action={headerActions}
      />
      {loading ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-slate2-100" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No minutes recorded yet"
          description="Minutes recorded from any meeting will show up here, most recent first."
        />
      ) : (
        <div className="divide-y divide-slate2-100">
          {items.map((m) => (
            <div key={m.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3 group">
              <div className="flex-1 min-w-0">
                <Link to={`/meetings/${m.meeting.id}`} className="flex flex-wrap items-center gap-2 hover:text-brand">
                  <p className="text-sm font-semibold text-slate2-800">{m.meeting.title}</p>
                  <CodeChip>{m.meeting.code}</CodeChip>
                </Link>
                <RichTextRenderer content={m.content} className="mt-1.5 text-sm text-slate2-600" />
                <p className="mt-1.5 text-[11px] text-slate2-400">
                  Recorded by {m.recordedBy.name} · {new Date(m.createdAt).toLocaleString()} · {m.meeting.department.name}
                </p>
              </div>
              <div className="shrink-0 flex flex-wrap items-center gap-2 self-start sm:self-center">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => handlePrintSingleMinute(m)}
                  disabled={actionLoadingId === `print-${m.id}`}
                  className="text-xs py-1 px-2.5 h-7 inline-flex items-center gap-1 bg-white hover:bg-slate2-50 text-slate2-700 border border-slate2-200"
                  title="Print Full Official Meeting Minutes"
                >
                  <Printer size={12} className={actionLoadingId === `print-${m.id}` ? "animate-spin text-brand" : "text-slate2-600"} />
                  <span>{actionLoadingId === `print-${m.id}` ? "Loading..." : "Print Report"}</span>
                </Button>
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => handleExportSingleMinutePdf(m)}
                  disabled={actionLoadingId === `pdf-${m.id}`}
                  className="text-xs py-1 px-2.5 h-7 inline-flex items-center gap-1 bg-white hover:bg-slate2-50 text-slate2-700 border border-slate2-200"
                  title="Export Full PDF Report"
                >
                  <Download size={12} className={actionLoadingId === `pdf-${m.id}` ? "animate-spin text-brand" : "text-brand"} />
                  <span>{actionLoadingId === `pdf-${m.id}` ? "Exporting..." : "Export PDF"}</span>
                </Button>
                <Link
                  to={`/meetings/${m.meeting.id}`}
                  className="text-xs text-brand hover:underline font-medium px-2 py-1"
                >
                  View Meeting →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
