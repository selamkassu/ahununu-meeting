import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Pencil, Lock } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { DecisionOverviewItem, DecisionStatus } from "../types";
import { isLockedMeeting } from "../types";
import { Card, CardHeader, EmptyState, CodeChip, inputClass } from "../components/ui/Primitives";
import { StatusBadge } from "../components/ui/Badge";

export default function DecisionsPage() {
  const { hasPermission, user } = useAuth();
  const hasAdminOverride = hasPermission("ADMIN_OVERRIDE");
  const [items, setItems] = useState<DecisionOverviewItem[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const loadDecisions = () => {
    setLoading(true);
    const params = status ? `?status=${status}` : "";
    api
      .get<DecisionOverviewItem[]>(`/meetings/decisions-overview/all${params}`)
      .then(setItems)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDecisions();
  }, [status]);

  const updateStatus = async (id: string, newStatus: DecisionStatus) => {
    try {
      await api.put(`/meetings/decisions/${id}`, { status: newStatus });
      setItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, status: newStatus } : item
        )
      );
    } catch (err: any) {
      alert(err.message || "Failed to update decision status.");
    }
  };

  const canEditDecision = (d: DecisionOverviewItem) => {
    if (hasAdminOverride) return true;
    if (hasPermission("decisions:edit:all")) return true;
    const deptId = d.meeting?.departmentId || d.meeting?.department?.id;
    if (hasPermission("decisions:edit:dept") && user?.department?.id && deptId === user.department.id) {
      return true;
    }
    if (hasPermission("decisions:edit:own") && user?.id === d.meeting?.organizerId) {
      return true;
    }
    return false;
  };

  return (
    <Card>
      <CardHeader
        title="Decisions"
        subtitle="Formal outcomes from every meeting, and the action items tracking them through to completion"
        action={
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputClass} w-auto`}>
            <option value="">All statuses</option>
            <option value="OPEN">Open</option>
            <option value="IMPLEMENTED">Implemented</option>
            <option value="REVERSED">Reversed</option>
          </select>
        }
      />
      {loading ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-slate2-100" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="No decisions logged" description="Decisions recorded in any meeting will appear here." />
      ) : (
        <div className="divide-y divide-slate2-100">
          {items.map((d) => {
            const completed = d.actionItems.filter((a) => a.status === "COMPLETED").length;
            const isApproved = d.meeting?.status === "APPROVED";
            const isMeetingLocked = isLockedMeeting(d.meeting?.status);
            // Approved meetings are strictly read-only until unlocked
            const canModifyDecision = !isApproved && canEditDecision(d) && (!isMeetingLocked || hasAdminOverride);

            return (
              <div key={d.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate2-800">{d.title}</p>
                    <CodeChip>{d.code}</CodeChip>
                    {isApproved ? (
                      <span className="inline-flex items-center gap-1 rounded bg-slate2-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate2-500 border border-slate2-200">
                        <Lock size={10} /> Approved (Locked)
                      </span>
                    ) : isMeetingLocked ? (
                      <span className="inline-flex items-center gap-1 rounded bg-slate2-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate2-500 border border-slate2-200">
                        <Lock size={10} /> Certified Lock
                      </span>
                    ) : null}
                  </div>
                  {d.description && <p className="mt-1 text-sm text-slate2-600">{d.description}</p>}
                  <Link to={`/meetings/${d.meeting.id}?tab=decisions`} className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-slate2-500 hover:text-brand transition-colors font-medium">
                    {d.meeting.title} · {d.meeting.department.name} · {new Date(d.decisionDate).toLocaleDateString()}
                  </Link>
                </div>
                <div className="flex items-center gap-3">
                  {d.actionItems.length > 0 && (
                    <span className="text-xs text-slate2-500">
                      {completed}/{d.actionItems.length} action items done
                    </span>
                  )}
                  {canModifyDecision ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={d.status}
                        onChange={(e) => updateStatus(d.id, e.target.value as DecisionStatus)}
                        className="rounded-lg border border-slate2-200 bg-white px-2 py-1 text-xs font-semibold text-slate2-700 shadow-2xs focus-ring cursor-pointer hover:border-slate2-300"
                        title="Update status"
                      >
                        <option value="OPEN">OPEN</option>
                        <option value="IMPLEMENTED">IMPLEMENTED</option>
                        <option value="REVERSED">REVERSED</option>
                      </select>
                      <Link
                        to={`/meetings/${d.meeting.id}?tab=decisions`}
                        className="rounded-md p-1.5 text-slate2-400 hover:bg-slate2-100 hover:text-slate2-700 transition-colors"
                        title="Edit in meeting"
                      >
                        <Pencil size={14} />
                      </Link>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <StatusBadge status={d.status} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
