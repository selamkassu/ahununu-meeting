import React, { useEffect, useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Plus,
  Search,
  MapPin,
  Video,
  Users,
  Clock,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { api } from "../../api/client";
import type { MeetingListItem, Department } from "../../types";
import { Card, EmptyState, Button, inputClass, Avatar } from "../../components/ui/Primitives";
import { CodeChip } from "../../components/ui/Primitives";
import { StatusBadge, PriorityBadge, ForceApprovedBadge } from "../../components/ui/Badge";
import { useAuth } from "../../context/AuthContext";
import MeetingCreateModal from "./MeetingCreateModal";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "PENDING_SIGNATURES", label: "Pending Signatures" },
  { value: "READY_FOR_APPROVAL", label: "Ready for Approval" },
  { value: "APPROVED", label: "Approved" },
  { value: "FORCE_APPROVED", label: "Force Approved" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

export default function MeetingList() {
  const { user, hasPermission } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(() => searchParams.get("status") || "");
  const [departmentId, setDepartmentId] = useState(() => searchParams.get("departmentId") || "");
  const [q, setQ] = useState(() => searchParams.get("q") || "");
  const [createOpen, setCreateOpen] = useState(false);

  const canCreate = hasPermission("meetings:create");

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (departmentId) params.set("departmentId", departmentId);
    if (q) params.set("q", q);
    api
      .get<MeetingListItem[]>(`/meetings?${params.toString()}`)
      .then(setMeetings)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    api.get<Department[]>("/departments").then(setDepartments);
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, departmentId, q]);

  const handleStatusChange = (newStatus: string) => {
    setStatus(newStatus);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (newStatus) next.set("status", newStatus);
        else next.delete("status");
        return next;
      },
      { replace: true }
    );
  };

  const handleDepartmentChange = (newDept: string) => {
    setDepartmentId(newDept);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (newDept) next.set("departmentId", newDept);
        else next.delete("departmentId");
        return next;
      },
      { replace: true }
    );
  };

  const handleQueryChange = (newQ: string) => {
    setQ(newQ);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (newQ.trim()) next.set("q", newQ);
        else next.delete("q");
        return next;
      },
      { replace: true }
    );
  };

  const filteredMeetings = useMemo(() => {
    let result = meetings;
    if (status === "FORCE_APPROVED") {
      result = result.filter((m) => m.forceApproved === true || Boolean(m.bypassReason));
    } else if (status) {
      result = result.filter((m) => m.status === status);
    }

    if (!q.trim()) return result;
    const query = q.trim().toLowerCase();
    return result.filter((m) => {
      const matchTitle = m.title?.toLowerCase().includes(query);
      const matchDescription = m.description?.toLowerCase().includes(query);
      const matchCode = m.code?.toLowerCase().includes(query);
      const matchOrganizer = m.organizer?.name?.toLowerCase().includes(query);
      const matchApprover = m.approvedBy?.name?.toLowerCase().includes(query);
      const matchBypassReason = m.bypassReason?.toLowerCase().includes(query);
      const matchStatus = m.status?.toLowerCase().includes(query);
      const matchForce =
        (m.forceApproved || Boolean(m.bypassReason)) &&
        ("force approved".includes(query) || "override".includes(query) || "force".includes(query) || "administrative override".includes(query));
      const matchParticipant = m.participants?.some((p) =>
        p.user?.name?.toLowerCase().includes(query)
      );
      return (
        matchTitle ||
        matchDescription ||
        matchCode ||
        matchOrganizer ||
        matchApprover ||
        matchBypassReason ||
        matchStatus ||
        matchForce ||
        matchParticipant
      );
    });
  }, [meetings, q, status]);

  const grouped = useMemo(() => {
    const map = new Map<string, MeetingListItem[]>();
    for (const m of filteredMeetings) {
      const key = new Date(m.date).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return Array.from(map.entries());
  }, [filteredMeetings]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap lg:flex-nowrap">
        {/* Search — grows to fill available space */}
        <div className="relative flex-1 min-w-[160px]">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate2-400" />
          <input
            value={q}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Search meetings by title, code, approver, force status…"
            className={`${inputClass} pl-8 w-full`}
          />
        </div>

        {/* Status dropdown */}
        <select
          value={status}
          onChange={(e) => handleStatusChange(e.target.value)}
          className={`${inputClass} w-full sm:w-48 shrink-0`}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Department dropdown (visible only for org-wide view tier) */}
        {(hasPermission("meetings:view:all") || hasPermission("ADMIN_OVERRIDE")) && (
          <select
            value={departmentId}
            onChange={(e) => handleDepartmentChange(e.target.value)}
            className={`${inputClass} w-full sm:w-44 shrink-0`}
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}

        {/* New Meeting button */}
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)} className="shrink-0 w-full sm:w-auto">
            <Plus size={15} /> New Meeting
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-slate2-100" />
          ))}
        </div>
      ) : filteredMeetings.length === 0 ? (
        <Card>
          <EmptyState
            title="No meetings match these filters"
            description="Try clearing a filter, or schedule a new meeting to get started."
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(([day, items]) => (
            <div key={day}>
              <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate2-400">
                {new Date(day).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              </p>
              <div className="flex flex-col gap-4">
                {items.map((m) => (
                  <Link key={m.id} to={`/meetings/${m.id}`} className="block">
                    <Card
                      className={`flex flex-col gap-3 p-4 transition-all hover:shadow-md sm:flex-row sm:items-center sm:justify-between ${
                        (m.forceApproved || Boolean(m.bypassReason))
                          ? "border-l-4 border-l-amber-500 bg-linear-to-r from-amber-50/20 to-white"
                          : ""
                        }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-display text-sm font-semibold text-slate2-800">{m.title}</p>
                          <CodeChip>{m.code}</CodeChip>
                        </div>
                        {m.description && (
                          <p className="mt-0.5 line-clamp-1 text-xs text-slate2-500">{m.description}</p>
                        )}
                        {q.trim() && m.participants && m.participants.some(p => p.user.name.toLowerCase().includes(q.trim().toLowerCase())) && (
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate2-500">
                            <span className="text-[11px] text-slate2-400">Participant match:</span>
                            {m.participants
                              .filter(p => p.user.name.toLowerCase().includes(q.trim().toLowerCase()))
                              .map(p => (
                                <span key={p.user.id} className="inline-flex items-center gap-1 rounded bg-slate2-100 px-1.5 py-0.5 text-[11px] font-medium text-slate2-700">
                                  <span
                                    className="inline-block h-2 w-2 rounded-full"
                                    style={{ backgroundColor: p.user.avatarColor || "#94a3b8" }}
                                  />
                                  <span>{p.user.name}</span>
                                  {p.status === "ACCEPTED" && (
                                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 rounded-sm">
                                      (Accepted)
                                    </span>
                                  )}
                                  {(p.status === "REJECTED" || p.status === "DECLINED") && (
                                    <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-1 rounded-sm">
                                      (Rejected){p.rejectionReason ? ` ➜ '${p.rejectionReason}'` : ""}
                                    </span>
                                  )}
                                </span>
                              ))}
                          </div>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-slate2-500">
                          <span className="flex items-center gap-1">
                            <Avatar name={m.organizer.name} color={m.organizer.avatarColor} />
                            {m.organizer.name}
                          </span>
                          <span>{m.department.name}</span>
                          {m.location && (
                            <span className="flex items-center gap-1">
                              <MapPin size={12} /> {m.location}
                            </span>
                          )}
                          {m.onlineLink && (
                            <span className="flex items-center gap-1">
                              <Video size={12} /> Online
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Users size={12} /> {m._count.participants}
                          </span>

                          {/* Approval Status Indicator in metadata */}
                          {m.approvedBy && (
                            <span
                              className={`inline-flex items-center gap-1 font-medium ${
                                (m.forceApproved || Boolean(m.bypassReason)) ? "text-amber-800" : "text-brand"
                              }`}
                              title={m.approvedAt ? `Formally certified on ${new Date(m.approvedAt).toLocaleString()}` : undefined}
                            >
                              <ShieldCheck size={13} className={(m.forceApproved || Boolean(m.bypassReason)) ? "text-amber-600" : "text-brand"} />
                              <span>{(m.forceApproved || Boolean(m.bypassReason)) ? "Force certified by" : "Approved by"} {m.approvedBy.name}</span>
                            </span>
                          )}
                        </div>

                        {/* Dedicated Administrative Override Notice when an Admin / Force Override is performed */}
                        {(m.forceApproved || Boolean(m.bypassReason)) && (
                          <div className="mt-2.5 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-300 px-3 py-2 text-xs text-amber-900 shadow-2xs">
                            <span className="text-sm shrink-0 leading-none mt-0.5" role="img" aria-label="warning">⚠️</span>
                            <div className="flex-1 min-w-0 leading-relaxed">
                              <span className="font-bold text-amber-950">Administrative Override: </span>
                              <span className="text-amber-900 font-medium">
                                {m.bypassReason || "Administrative override: approved before all attendee signatures collected"}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2.5 sm:flex-col sm:items-end sm:justify-center shrink-0">
                        <div className="flex items-center gap-1.5 rounded-lg bg-slate2-50 border border-slate2-200/80 px-2.5 py-1 text-xs font-semibold text-slate2-800 shadow-2xs">
                          <Clock size={13} className="text-brand shrink-0" />
                          <span>{m.startTime} – {m.endTime}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                          {(m.forceApproved || Boolean(m.bypassReason)) && (
                            <ForceApprovedBadge reason={m.bypassReason || "Administrative override: approved before all attendee signatures collected"} />
                          )}
                          <PriorityBadge priority={m.priority} />
                          <StatusBadge status={m.status} />
                        </div>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {createOpen && (
        <MeetingCreateModal
          departments={departments}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

