import React, { useEffect, useRef, useState } from "react";
import { Printer, Download, ChevronDown, FileSpreadsheet, FileText } from "lucide-react";
import { api } from "../api/client";
import type { DashboardResponse } from "../types";
import { Card, Button } from "../components/ui/Primitives";
import { Logo } from "../components/ui/Logo";
import {
  exportDepartmentPerformanceToExcel,
  exportDepartmentPerformanceToPdf,
  formatReportDateTime,
} from "../utils/exportReport";

export default function ReportsPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [printDate, setPrintDate] = useState<string>(() => formatReportDateTime());
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get<DashboardResponse>("/dashboard/stats").then(setData);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setExportMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!data) {
    return <div className="h-64 animate-pulse rounded-xl bg-slate2-100" />;
  }

  const { cards, charts } = data;

  const handlePrintDepartment = () => {
    const formatted = formatReportDateTime(new Date());
    setPrintDate(formatted);

    const dateEl = document.getElementById("dept-print-generated-date");
    if (dateEl) {
      dateEl.textContent = `Generated: ${formatted}`;
    }

    document.body.classList.add("print-dept-only");

    const cleanup = () => {
      document.body.classList.remove("print-dept-only");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    setTimeout(cleanup, 2000);

    requestAnimationFrame(() => {
      window.print();
    });
  };

  const handlePrintFullReport = () => {
    document.body.classList.remove("print-dept-only");
    window.print();
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden report-card print:overflow-visible print:border-none print:shadow-none">
        {/* Full Report Header Banner */}
        <div className="flex items-center justify-between bg-brand-dark px-6 py-5 text-white dept-no-print">
          <Logo size={42} withText textVariant="light" subtitle="Meeting Management Portal — Company Report" />
          <Button variant="secondary" onClick={handlePrintFullReport} className="no-print">
            <Printer size={14} /> Print / Export
          </Button>
        </div>

        <div className="p-6 report-card-body print:p-0">
          <p className="mb-4 text-xs text-slate2-400 dept-no-print">
            Generated {new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })}
          </p>

          {/* Meeting Activity */}
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate2-400 dept-no-print">
            Meeting activity
          </p>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 dept-no-print">
            {[
              ["Total Meetings", cards.totalMeetings],
              ["Today's Meetings", cards.todaysMeetings],
              ["Upcoming Meetings", cards.upcomingMeetings],
              ["Completed Meetings", cards.completedMeetings],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-lg border border-slate2-200 p-3 text-center">
                <p className="font-display text-xl font-semibold text-slate2-800">{value}</p>
                <p className="text-[11px] text-slate2-500">{label}</p>
              </div>
            ))}
          </div>

          {/* Accountability */}
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate2-400 dept-no-print">
            Accountability
          </p>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 dept-no-print">
            {[
              ["Pending Action Items", cards.pendingActionItems],
              ["Overdue Action Items", cards.overdueActionItems],
              ["Completed Action Items", cards.completedActionItems],
              ["Pending Decisions", cards.pendingDecisions],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-lg border border-slate2-200 p-3 text-center">
                <p className="font-display text-xl font-semibold text-slate2-800">{value}</p>
                <p className="text-[11px] text-slate2-500">{label}</p>
              </div>
            ))}
          </div>

          {/* Department Performance Section */}
          <div id="dept-performance-section" className="space-y-3 print-report department-performance-report">
            {/* Print-only Header for Department Performance */}
            <div className="dept-print-header mb-4">
              <div className="mb-2">
                <Logo size={36} withText textVariant="dark" subtitle="Ahununu Logistics — Meeting Management Portal" />
              </div>
              <h1 className="dept-print-title font-display text-xl font-bold text-slate2-900 mt-2">Department Performance</h1>
              <p id="dept-print-generated-date" className="mt-1 text-xs font-normal text-slate2-500">
                Generated: {printDate}
              </p>
            </div>

            {/* Screen Section Header with Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 no-print">
              <p className="text-xs font-bold uppercase tracking-wide text-slate2-400">Department performance</p>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={handlePrintDepartment}
                  id="print-dept-performance-btn"
                  className="h-8 px-3 text-xs font-medium"
                >
                  <Printer size={13} />
                  <span>Print</span>
                </Button>

                <div className="relative inline-flex" ref={exportMenuRef}>
                  <Button
                    variant="secondary"
                    onClick={() => charts.departmentPerformance && exportDepartmentPerformanceToExcel(charts.departmentPerformance)}
                    id="export-dept-performance-btn"
                    className="h-8 rounded-r-none border-r-0 px-3 text-xs font-medium"
                    title="Export to Excel (.xlsx)"
                  >
                    <Download size={13} />
                    <span>Export</span>
                  </Button>
                  <button
                    type="button"
                    id="export-dept-options-btn"
                    onClick={() => setExportMenuOpen(!exportMenuOpen)}
                    className="focus-ring inline-flex h-8 items-center rounded-r-lg border border-slate2-200 bg-white px-2 text-slate2-600 hover:bg-slate2-50"
                    title="Export options (Excel / PDF)"
                    aria-label="Export options"
                  >
                    <ChevronDown size={13} />
                  </button>

                  {exportMenuOpen && (
                    <div className="absolute right-0 top-full z-30 mt-1 w-52 rounded-lg border border-slate2-200 bg-white py-1 shadow-lg">
                      <button
                        type="button"
                        onClick={() => {
                          exportDepartmentPerformanceToExcel(charts.departmentPerformance);
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
                          exportDepartmentPerformanceToPdf(charts.departmentPerformance);
                          setExportMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate2-700 hover:bg-slate2-50"
                      >
                        <FileText size={15} className="text-red-600" />
                        <span>PDF Document (.pdf)</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Department Performance Table */}
            <div className="printable-table-container overflow-x-auto rounded-lg border border-slate2-200">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate2-100 bg-slate2-50 text-[11px] uppercase tracking-wide text-slate2-400 font-bold">
                    <th className="px-4 py-2 font-bold text-left text-slate2-700">Department</th>
                    <th className="px-4 py-2 font-bold text-right sm:text-right text-slate2-700">Total Action Items</th>
                    <th className="px-4 py-2 font-bold text-right sm:text-right text-slate2-700">Completed</th>
                    <th className="px-4 py-2 font-bold text-right sm:text-right text-slate2-700">Overdue</th>
                    <th className="px-4 py-2 font-bold text-right sm:text-right text-slate2-700">Completion Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {charts.departmentPerformance.map((d) => (
                    <tr key={d.department} className="border-b border-slate2-50 last:border-0">
                      <td className="px-4 py-2 font-normal text-slate2-700">{d.department}</td>
                      <td className="px-4 py-2 text-right font-normal text-slate2-600">{d.total}</td>
                      <td className="px-4 py-2 text-right font-normal text-slate2-600">{d.completed}</td>
                      <td className="px-4 py-2 text-right font-normal text-slate2-600">{d.overdue}</td>
                      <td className="px-4 py-2 text-right font-medium text-slate2-700 completion-rate-cell">{d.completionRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="mt-6 text-[11px] text-slate2-400 dept-no-print">
            This report is generated live from the Ahununu Logistics Meeting Management Portal. A scheduled PDF/Excel export and
            distribution via the Finance and HR systems is planned for a later integration phase.
          </p>
        </div>
      </Card>
    </div>
  );
}
