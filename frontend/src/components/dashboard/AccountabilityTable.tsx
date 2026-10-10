import React from "react";
import { AlertTriangle, ChevronRight, Calendar, ExternalLink } from "lucide-react";
import type { ActionItem } from "../../types";
import { getActionItemAssignees } from "../../types";
import { Avatar, ProgressBar, CodeChip, EmptyState } from "../ui/Primitives";
import { PriorityBadge, StatusBadge } from "../ui/Badge";
import { Link } from "react-router-dom";

function formatShortDate(dateStr: string) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getRelativeTag(deadlineStr: string, isCompleted: boolean) {
  if (isCompleted) return null;
  const d = new Date(deadlineStr);
  const now = new Date();
  const dMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((dMidnight.getTime() - nowMidnight.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const days = Math.abs(diffDays);
    return {
      text: `${days}d overdue`,
      tone: "danger",
    };
  }
  if (diffDays === 0) {
    return { text: "Today", tone: "warning" };
  }
  if (diffDays === 1) {
    return { text: "Tomorrow", tone: "warning" };
  }
  if (diffDays <= 5) {
    return { text: `${diffDays}d left`, tone: "neutral" };
  }
  return null;
}

export function AccountabilityTable({
  items,
  highlightedId,
}: {
  items: ActionItem[];
  highlightedId?: string;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="No commitments recorded"
        description="Action items created from meeting decisions will appear here for operational tracking and accountability."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] text-left text-sm border-collapse">
        <thead>
          <tr className="border-b border-slate2-200/80 bg-slate2-50/70 text-xs font-semibold text-slate2-600">
            <th className="px-5 py-3 font-semibold whitespace-nowrap">Task & Source</th>
            <th className="px-5 py-3 font-semibold whitespace-nowrap">Accountability</th>
            <th className="px-5 py-3 font-semibold whitespace-nowrap">Target Deadline</th>
            <th className="px-5 py-3 font-semibold whitespace-nowrap">Priority</th>
            <th className="px-5 py-3 font-semibold whitespace-nowrap">Status</th>
            <th className="px-5 py-3 font-semibold whitespace-nowrap">Execution</th>
            <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">Details</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate2-100">
          {items.map((item) => {
            const assignees = getActionItemAssignees(item);
            const isCompleted = item.status === "COMPLETED";
            const relTag = getRelativeTag(item.deadline, isCompleted);
            const isHighlighted = item.id === highlightedId;

            return (
              <tr
                key={item.id}
                className={`transition-colors group hover:bg-slate2-50/80 ${
                  isHighlighted
                    ? "bg-teal-50/70 border-l-4 border-l-brand"
                    : item.overdue && !isCompleted
                    ? "bg-rose-50/20"
                    : "bg-white"
                }`}
              >
                {/* Task Title, Description & Source */}
                <td className="px-5 py-3.5 min-w-[240px] max-w-[340px]">
                  <div className="flex items-start gap-2.5">
                    {item.overdue && !isCompleted && (
                      <span title="Overdue deliverable" className="mt-0.5 shrink-0">
                        <AlertTriangle size={14} className="text-danger" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/action-items/${item.id}`}
                        className="text-xs sm:text-sm font-semibold text-slate2-900 hover:text-brand transition-colors line-clamp-1 group-hover:text-brand block"
                        title={item.title}
                      >
                        {item.title}
                      </Link>

                      {/* Visible Action Item Description */}
                      {item.description && item.description.trim() ? (
                        <p
                          className="mt-1 text-xs text-slate2-600 line-clamp-2 leading-relaxed"
                          title={item.description}
                        >
                          {item.description}
                        </p>
                      ) : null}

                      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                        <CodeChip>{item.code}</CodeChip>
                        {item.meeting && (
                          <Link
                            to={`/meetings/${item.meeting.id}`}
                            className="inline-flex items-center gap-0.5 text-[11px] font-mono text-slate2-400 hover:text-brand hover:underline"
                            title={`Meeting: ${item.meeting.title}`}
                          >
                            <span>{item.meeting.code}</span>
                            <ExternalLink size={10} className="opacity-70" />
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </td>

                {/* Responsible Team / Assignees */}
                <td className="px-5 py-3.5">
                  {assignees.length === 0 ? (
                    <span className="text-xs text-slate2-400 italic">Unassigned</span>
                  ) : assignees.length === 1 ? (
                    <div className="flex items-center gap-2">
                      <Avatar name={assignees[0].name} color={assignees[0].avatarColor} />
                      <div className="min-w-0 max-w-[150px]">
                        <p className="text-xs font-semibold text-slate2-800 truncate">{assignees[0].name}</p>
                        <p className="text-[11px] text-slate2-400 truncate">{item.department?.name || "Corporate"}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="flex -space-x-2 overflow-hidden shrink-0">
                        {assignees.slice(0, 3).map((u) => (
                          <div key={u.id} className="ring-2 ring-white rounded-full">
                            <Avatar name={u.name} color={u.avatarColor} />
                          </div>
                        ))}
                        {assignees.length > 3 && (
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate2-100 text-[10px] font-bold text-slate2-600 ring-2 ring-white">
                            +{assignees.length - 3}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 max-w-[150px]">
                        <p
                          className="text-xs font-semibold text-slate2-800 truncate"
                          title={assignees.map((u) => u.name).join(", ")}
                        >
                          {assignees[0].name} +{assignees.length - 1}
                        </p>
                        <p className="text-[11px] text-slate2-400 truncate">{item.department?.name}</p>
                      </div>
                    </div>
                  )}
                </td>

                {/* Deadline & Urgency */}
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <Calendar size={12} className="text-slate2-400 shrink-0" />
                    <span className={`text-xs font-medium ${item.overdue && !isCompleted ? "text-danger font-semibold" : "text-slate2-700"}`}>
                      {formatShortDate(item.deadline)}
                    </span>
                  </div>
                  {relTag && (
                    <span
                      className={`inline-block mt-0.5 text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                        relTag.tone === "danger"
                          ? "bg-rose-50 text-rose-700 border border-rose-200"
                          : relTag.tone === "warning"
                          ? "bg-amber-50 text-amber-800 border border-amber-200"
                          : "bg-slate2-100 text-slate2-600"
                      }`}
                    >
                      {relTag.text}
                    </span>
                  )}
                </td>

                {/* Priority */}
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <PriorityBadge priority={item.priority} />
                </td>

                {/* Status */}
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <StatusBadge status={item.status} />
                </td>

                {/* Progress Bar */}
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <div className="w-20">
                      <ProgressBar
                        percent={item.progressPercent}
                        tone={item.overdue && !isCompleted ? "danger" : isCompleted ? "success" : "brand"}
                      />
                    </div>
                    <span className="text-[11px] font-mono font-medium text-slate2-500">{item.progressPercent}%</span>
                  </div>
                </td>

                {/* Details Button */}
                <td className="px-4 py-3.5 text-right whitespace-nowrap">
                  <Link
                    to={`/action-items/${item.id}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate2-500 hover:text-brand bg-slate2-50 hover:bg-teal-50 px-2 py-1 rounded-md border border-slate2-200 hover:border-brand/30 transition-all"
                  >
                    <span>Inspect</span>
                    <ChevronRight size={12} />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

