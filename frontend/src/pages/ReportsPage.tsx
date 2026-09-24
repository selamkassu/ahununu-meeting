import React, { useEffect, useState } from "react";
import { Printer, Truck } from "lucide-react";
import { api } from "../api/client";
import type { DashboardResponse } from "../types";
import { Card, CardHeader, Button } from "../components/ui/Primitives";

export default function ReportsPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);

  useEffect(() => {
    api.get<DashboardResponse>("/dashboard/stats").then(setData);
  }, []);

  if (!data) {
    return <div className="h-64 animate-pulse rounded-xl bg-slate2-100" />;
  }

  const { cards, charts } = data;

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between bg-brand-dark px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-brand-dark">
              <Truck size={20} />
            </div>
            <div>
              <p className="font-display text-base font-bold">Ahununu Logistics</p>
              <p className="text-xs text-white/60">Meeting Management Portal — Company Report</p>
            </div>
          </div>
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer size={14} /> Print / Export
          </Button>
        </div>

        <div className="p-6">
          <p className="mb-4 text-xs text-slate2-400">
            Generated {new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })}
          </p>

          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate2-400">Meeting activity</p>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
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

          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate2-400">Accountability</p>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
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

          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate2-400">Department performance</p>
          <div className="overflow-x-auto rounded-lg border border-slate2-200">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate2-100 bg-slate2-50 text-[11px] uppercase tracking-wide text-slate2-400">
                  <th className="px-4 py-2 font-medium">Department</th>
                  <th className="px-4 py-2 font-medium">Total Action Items</th>
                  <th className="px-4 py-2 font-medium">Completed</th>
                  <th className="px-4 py-2 font-medium">Overdue</th>
                  <th className="px-4 py-2 font-medium">Completion Rate</th>
                </tr>
              </thead>
              <tbody>
                {charts.departmentPerformance.map((d) => (
                  <tr key={d.department} className="border-b border-slate2-50 last:border-0">
                    <td className="px-4 py-2 font-medium text-slate2-700">{d.department}</td>
                    <td className="px-4 py-2 text-slate2-600">{d.total}</td>
                    <td className="px-4 py-2 text-slate2-600">{d.completed}</td>
                    <td className="px-4 py-2 text-slate2-600">{d.overdue}</td>
                    <td className="px-4 py-2 font-medium text-slate2-700">{d.completionRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-6 text-[11px] text-slate2-400">
            This report is generated live from the Ahununu Logistics Meeting Management Portal. A scheduled PDF/Excel export and
            distribution via the Finance and HR systems is planned for a later integration phase.
          </p>
        </div>
      </Card>
    </div>
  );
}
