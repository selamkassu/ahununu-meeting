import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Pencil, Lock, Search, X } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { DecisionOverviewItem, DecisionStatus } from "../types";
import { isLockedMeeting } from "../types";
import { Card, CardHeader, EmptyState, CodeChip, inputClass, Button } from "../components/ui/Primitives";
import { StatusBadge } from "../components/ui/Badge";
import { useAlert } from "../components/ui/AlertDialog";

export default function DecisionsPage() {
  const { hasPermission, user } = useAuth();
  const { alert } = useAlert();
  const hasAdminOverride = hasPermission("ADMIN_OVERRIDE");
  const [items, setItems] = useState<DecisionOverviewItem[]>([]);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
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

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.code.toLowerCase().includes(q) ||
        (d.description || "").toLowerCase().includes(q) ||
        d.meeting.title.toLowerCase().includes(q) ||
        d.meeting.code.toLowerCase().includes(q) ||
        d.meeting.department.name.toLowerCase().includes(q)
    );
  }, [items, search]);

  const updateStatus = async (id: string, newStatus: DecisionStatus) => {
    try {
      await api.put(`/meetings/decisions/${id}`, { status: newStatus });
      setItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, status: newStatus } : item
        )
      );
    } catch (err: any) {
      await alert({
        title: "Status Update Error",
        message: err.message || "Failed to update decision status.",
        tone: "danger",
      });
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
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-brand bg-brand/10 px-2.5 py-1 rounded-full">
              {filteredItems.length} {filteredItems.length === 1 ? "Decision" : "Decisions"}
            </span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputClass} w-auto text-xs`}>
              <option value="">All statuses</option>
              <option value="OPEN">Open</option>
              <option value="IMPLEMENTED">Implemented</option>
              <option value="REVERSED">Reversed</option>
            </select>
          </div>
        }
      />

      {/* Search Bar */}
      <div className="border-b border-slate2-100 bg-slate2-50/50 px-5 py-3">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate2-400" size={14} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search decisions by title, code, description, meeting..."
            className="w-full rounded-xl border border-slate2-200 bg-white py-2 pl-9 pr-8 text-xs text-slate2-800 placeholder:text-slate2-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand shadow-2xs"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate2-400 hover:text-slate2-600"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-slate2-100" />
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <EmptyState
          title={items.length === 0 ? "No decisions logged" : "No decisions match your search"}
          description={
            items.length === 0
              ? "Decisions recorded in any meeting will appear here."
              : "Try adjusting your search terms or status filter."
          }
          action={
            items.length > 0 && search ? (
              <Button variant="secondary" onClick={() => setSearch("")} className="mt-2 text-xs">
                Clear search
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="divide-y divide-slate2-100">
          {filteredItems.map((d) => {
            const completed = d.actionItems.filter((a) => a.status === "COMPLETED").length;
            const isApproved = d.meeting?.status === "APPROVED";
            const isMeetingLocked = isLockedMeeting(d.meeting?.status);
            // Locked meetings are strictly read-only until unlocked
            const canModifyDecision = !isMeetingLocked && canEditDecision(d);

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
