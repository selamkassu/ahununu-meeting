import React from "react";
import { AlertTriangle } from "lucide-react";
import type { ActionItem } from "../../types";
import { Avatar, ProgressBar, CodeChip, EmptyState } from "../ui/Primitives";
import { PriorityBadge, StatusBadge } from "../ui/Badge";
import { Link } from "react-router-dom";

export function AccountabilityTable({ items }: { items: ActionItem[] }) {
  if (items.length === 0) {
    return <EmptyState title="Nothing to track yet" description="Action items created from meeting decisions will show up here." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate2-100 text-[11px] uppercase tracking-wide text-slate2-400">
            <th className="px-5 py-3 font-medium">Task</th>
            <th className="px-5 py-3 font-medium">Responsible</th>
            <th className="px-5 py-3 font-medium">Deadline</th>
            <th className="px-5 py-3 font-medium">Priority</th>
            <th className="px-5 py-3 font-medium">Status</th>
            <th className="px-5 py-3 font-medium">Progress</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              className={`border-b border-slate2-50 last:border-0 hover:bg-slate2-50/60 ${
                item.overdue ? "bg-red-50/40" : ""
              }`}
            >
              <td className="px-5 py-3">
                <div className="flex items-start gap-2">
                  {item.overdue && <AlertTriangle size={14} className="mt-0.5 shrink-0 text-danger" />}
                  <div>
                    <Link to={`/meetings/${item.meetingId}`} className="text-sm font-medium text-slate2-800 hover:text-brand">
                      {item.title}
                    </Link>
                    <div className="mt-1 flex items-center gap-1.5">
                      <CodeChip>{item.code}</CodeChip>
                      {item.meeting && <span className="text-[11px] text-slate2-400">{item.meeting.code}</span>}
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-5 py-3">
                <div className="flex items-center gap-2">
                  <Avatar name={item.assignedTo.name} color={item.assignedTo.avatarColor} />
                  <div>
                    <p className="text-xs font-medium text-slate2-700">{item.assignedTo.name}</p>
                    <p className="text-[11px] text-slate2-400">{item.department.name}</p>
                  </div>
                </div>
              </td>
              <td className="px-5 py-3">
                <span className={`text-xs font-medium ${item.overdue ? "text-danger" : "text-slate2-600"}`}>
                  {new Date(item.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
                {item.overdue && <p className="text-[11px] text-danger">Overdue</p>}
              </td>
              <td className="px-5 py-3">
                <PriorityBadge priority={item.priority} />
              </td>
              <td className="px-5 py-3">
                <StatusBadge status={item.status} />
              </td>
              <td className="px-5 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-20">
                    <ProgressBar percent={item.progressPercent} tone={item.overdue ? "danger" : item.status === "COMPLETED" ? "success" : "brand"} />
                  </div>
                  <span className="text-[11px] font-medium text-slate2-500">{item.progressPercent}%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
