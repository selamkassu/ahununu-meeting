import React from "react";
import { AlertTriangle } from "lucide-react";
import type { ActionItem } from "../../types";
import { getActionItemAssignees } from "../../types";
import { Avatar, ProgressBar, CodeChip, EmptyState } from "../ui/Primitives";
import { PriorityBadge, StatusBadge } from "../ui/Badge";
import { Link } from "react-router-dom";

export function AccountabilityTable({
  items,
  highlightedId,
}: {
  items: ActionItem[];
  highlightedId?: string;
}) {
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
                item.id === highlightedId
                  ? "bg-teal-50/90 ring-2 ring-brand ring-inset font-medium"
                  : item.overdue
                  ? "bg-red-50/40"
                  : ""
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
                {(() => {
                  const assignees = getActionItemAssignees(item);
                  if (assignees.length === 0) {
                    return <span className="text-xs text-slate2-400">Unassigned</span>;
                  }
                  if (assignees.length === 1) {
                    const u = assignees[0];
                    return (
                      <div className="flex items-center gap-2">
                        <Avatar name={u.name} color={u.avatarColor} />
                        <div>
                          <p className="text-xs font-medium text-slate2-700">{u.name}</p>
                          <p className="text-[11px] text-slate2-400">{item.department.name}</p>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="flex items-center gap-2">
                      <div className="flex -space-x-2 overflow-hidden shrink-0">
                        {assignees.slice(0, 3).map((u) => (
                          <div key={u.id} className="ring-2 ring-white rounded-full">
                            <Avatar name={u.name} color={u.avatarColor} />
                          </div>
                        ))}
                        {assignees.length > 3 && (
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate2-100 text-[10px] font-bold text-slate2-600 ring-2 ring-white">
                            +{assignees.length - 3}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 max-w-[200px]">
                        <p className="text-xs font-medium text-slate2-700 truncate" title={assignees.map((u) => u.name).join(", ")}>
                          {assignees.map((u) => u.name).join(", ")}
                        </p>
                        <p className="text-[11px] text-slate2-400">
                          {item.department.name} · <span className="text-[#005f56] font-semibold">{assignees.length} assignees</span>
                        </p>
                      </div>
                    </div>
                  );
                })()}
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
