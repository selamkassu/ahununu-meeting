import React, { useEffect, useState } from "react";
import {
  CalendarDays,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  ListTodo,
  AlertOctagon,
  ListChecks,
  Gavel,
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  RadialBarChart,
  RadialBar,
} from "recharts";
import { api } from "../api/client";
import type { DashboardResponse } from "../types";
import { StatCard } from "../components/dashboard/StatCard";
import { AccountabilityTable } from "../components/dashboard/AccountabilityTable";
import { Card, CardHeader } from "../components/ui/Primitives";

const STATUS_COLORS: Record<string, string> = {
  PENDING: "#E0932B",
  IN_PROGRESS: "#AED580",
  COMPLETED: "#0B7A6B",
  CANCELLED: "#D64545",
};

export default function Dashboard() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<DashboardResponse>("/dashboard/stats")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <Card className="p-6 text-sm text-danger">
        Couldn't load the dashboard: {error}
      </Card>
    );
  }

  if (!data) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-slate2-100" />
        ))}
      </div>
    );
  }

  const { cards, charts, accountability } = data;

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Meetings" value={cards.totalMeetings} icon={CalendarDays} tone="brand" hint="+8.2% vs last month" />
        <StatCard label="Today's Meetings" value={cards.todaysMeetings} icon={CalendarClock} tone="info" hint="Active today" />
        <StatCard label="Upcoming Meetings" value={cards.upcomingMeetings} icon={CalendarCheck2} tone="info" hint="Scheduled next" />
        <StatCard label="Completed Meetings" value={cards.completedMeetings} icon={CheckCircle2} tone="brand" hint="Finished successfully" />
        <StatCard label="Pending Action Items" value={cards.pendingActionItems} icon={ListTodo} tone="warning" hint="Awaiting delivery" />
        <StatCard label="Overdue Action Items" value={cards.overdueActionItems} icon={AlertOctagon} tone="danger" hint="Requires attention" />
        <StatCard label="Completed Action Items" value={cards.completedActionItems} icon={ListChecks} tone="accent" hint="Task delivered" />
        <StatCard label="Pending Decisions" value={cards.pendingDecisions} icon={Gavel} tone="neutral" hint="Under review" />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Monthly Meetings" subtitle="Trailing 6 months, scheduled vs completed" />
          <div className="h-64 px-2 py-4">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={charts.monthlyMeetings} margin={{ left: 4, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F4" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#5B6B7A" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "#5B6B7A" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#E4E7EC" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="count" name="Meetings" fill="#0B7A6B" radius={[4, 4, 0, 0]} barSize={28} />
                <Line type="monotone" dataKey="completed" name="Completed" stroke="#AED580" strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Action Item Status" subtitle="Distribution across all action items" />
          <div className="flex h-64 items-center px-2 py-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={charts.actionItemStatus}
                  dataKey="count"
                  nameKey="status"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                >
                  {charts.actionItemStatus.map((entry) => (
                    <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || "#98A5B3"} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#E4E7EC" }} />
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(value) => value.toString().replace("_", " ")}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Department Performance" subtitle="Action item completion rate by department" />
          <div className="h-64 px-2 py-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.departmentPerformance} layout="vertical" margin={{ left: 16, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F4" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: "#5B6B7A" }} axisLine={false} tickLine={false} unit="%" />
                <YAxis
                  type="category"
                  dataKey="department"
                  width={110}
                  tick={{ fontSize: 11, fill: "#5B6B7A" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#E4E7EC" }} formatter={(v: number) => `${v}%`} />
                <Bar dataKey="completionRate" name="Completion rate" fill="#1F9D63" radius={[0, 4, 4, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Meeting Completion Rate" subtitle="Overall, all-time" />
          <div className="flex h-64 flex-col items-center justify-center px-2 py-4">
            <ResponsiveContainer width="100%" height="80%">
              <RadialBarChart
                innerRadius="70%"
                outerRadius="100%"
                data={[{ name: "rate", value: charts.meetingCompletionRate, fill: "#0B7A6B" }]}
                startAngle={90}
                endAngle={-270}
              >
                <RadialBar dataKey="value" cornerRadius={8} background={{ fill: "#EEF1F4" }} />
              </RadialBarChart>
            </ResponsiveContainer>
            <p className="-mt-16 font-display text-3xl font-bold text-slate2-800">{charts.meetingCompletionRate}%</p>
            <p className="mt-16 text-xs text-slate2-400">of meetings completed</p>
          </div>
        </Card>
      </div>

      {/* Action & Accountability dashboard */}
      <Card>
        <CardHeader
          title="Action & Accountability Dashboard"
          subtitle="Who's responsible, what's due, and what's overdue — across every department"
        />
        <AccountabilityTable items={accountability} />
      </Card>
    </div>
  );
}
