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
  Calendar,
  X,
  ChevronRight,
  CheckCircle2,
  FileText,
  Filter,
  Pencil,
} from "lucide-react";
import { api } from "../../api/client";
import type { MeetingListItem, Department } from "../../types";
import { isLockedMeeting } from "../../types";
import { Card, EmptyState, Button, inputClass, Avatar } from "../../components/ui/Primitives";
import { CodeChip } from "../../components/ui/Primitives";
import { StatusBadge, PriorityBadge } from "../../components/ui/Badge";
import { useAuth } from "../../context/AuthContext";
import MeetingCreateModal from "./MeetingCreateModal";
import MeetingEditModal from "./MeetingEditModal";

const STATUS_FILTERS = [
  { value: "", label: "All Sessions" },
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "PENDING_SIGNATURES", label: "Pending Signatures" },
  { value: "READY_FOR_APPROVAL", label: "Ready for Approval" },
  { value: "APPROVED", label: "Approved" },
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
  const [editingMeeting, setEditingMeeting] = useState<MeetingListItem | null>(null);
  const [feedbackToast, setFeedbackToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const canCreate = hasPermission("meetings:create");

  const canEditMeeting = (m: MeetingListItem) => {
    if (hasPermission("meetings:edit:all") || hasPermission("ADMIN_OVERRIDE")) return true;
    if (hasPermission("meetings:edit:dept") && user?.department?.id === m.department?.id) return true;
    if (hasPermission("meetings:edit:own") && user?.id === m.organizer?.id) return true;
    return false;
  };

  const handleMeetingUpdated = (updated: any) => {
    setFeedbackToast({
      message: `Session "${updated.title}" (${updated.code}) updated successfully.`,
      type: "success",
    });
    setTimeout(() => setFeedbackToast(null), 4000);
    load();
  };

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

  const clearAllFilters = () => {
    setStatus("");
    setDepartmentId("");
    setQ("");
    setSearchParams({}, { replace: true });
  };

  const hasActiveFilters = Boolean(status || departmentId || q.trim());

  const filteredMeetings = useMemo(() => {
    let result = meetings;
    if (status === "FORCE_APPROVED") {
      result = result.filter((m) => m.forceApproved === true);
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
        m.forceApproved &&
        ("force approved".includes(query) || "override".includes(query) || "force".includes(query));
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

  // Executive metrics count across current full list
  const metrics = useMemo(() => {
    const total = meetings.length;
    const inProgress = meetings.filter((m) => m.status === "IN_PROGRESS" || m.status === "SCHEDULED").length;
    const pendingSignatures = meetings.filter((m) => m.status === "PENDING_SIGNATURES" || m.status === "READY_FOR_APPROVAL").length;
    const certified = meetings.filter((m) => m.status === "APPROVED" || m.status === "COMPLETED").length;
    return { total, inProgress, pendingSignatures, certified };
  }, [meetings]);

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
    <div className="space-y-6">
      {/* Executive Command Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate2-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-brand" />
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate2-800">
              Meeting Directory
            </h1>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-slate2-500">
            Official logistics committees, executive proceedings, and departmental records
          </p>
        </div>

        {canCreate && (
          <Button
            onClick={() => setCreateOpen(true)}
            className="shrink-0 shadow-sm inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg"
          >
            <Plus size={16} /> Schedule Session
          </Button>
        )}
      </div>

      {/* Operational Metrics Pulse Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate2-200 bg-white p-3.5 shadow-2xs">
          <p className="text-[11px] font-medium text-slate2-500">All Registered</p>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-display text-xl font-bold text-slate2-800">{metrics.total}</span>
            <span className="text-[11px] text-slate2-400">Total sessions</span>
          </div>
        </div>

        <div className="rounded-xl border border-sky-100 bg-sky-50/40 p-3.5 shadow-2xs">
          <p className="text-[11px] font-medium text-sky-800">Active & Scheduled</p>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-display text-xl font-bold text-sky-900">{metrics.inProgress}</span>
            <span className="inline-flex h-2 w-2 rounded-full bg-sky-500 animate-pulse" />
          </div>
        </div>

        <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-3.5 shadow-2xs">
          <p className="text-[11px] font-medium text-amber-800">Awaiting Signatures</p>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-display text-xl font-bold text-amber-900">{metrics.pendingSignatures}</span>
            <span className="text-[11px] text-amber-700 font-medium">In review</span>
          </div>
        </div>

        <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3.5 shadow-2xs">
          <p className="text-[11px] font-medium text-emerald-800">Certified & Complete</p>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-display text-xl font-bold text-emerald-900">{metrics.certified}</span>
            <CheckCircle2 size={15} className="text-emerald-600" />
          </div>
        </div>
      </div>

      {/* Controls & Filter Strip */}
      <div className="rounded-xl border border-slate2-200 bg-white p-3.5 space-y-3 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Search Field */}
          <div className="relative flex-1">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate2-400"
            />
            <input
              value={q}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Search meetings by title, code, organizer, approver, attendee..."
              className={`${inputClass} pl-9 pr-8 text-xs sm:text-sm`}
            />
            {q && (
              <button
                type="button"
                onClick={() => handleQueryChange("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate2-400 hover:text-slate2-600"
                title="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Department Filter (Visible for elevated tiers) */}
          {(hasPermission("meetings:view:all") || hasPermission("ADMIN_OVERRIDE")) && (
            <div className="w-full sm:w-52 shrink-0">
              <select
                value={departmentId}
                onChange={(e) => handleDepartmentChange(e.target.value)}
                className={`${inputClass} text-xs sm:text-sm bg-white cursor-pointer`}
              >
                <option value="">All departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="inline-flex items-center justify-center gap-1.5 text-xs font-medium text-slate2-600 hover:text-danger px-3 py-2 rounded-lg border border-slate2-200 hover:border-red-200 bg-slate2-50 transition-colors"
            >
              <X size={13} /> Clear filters
            </button>
          )}
        </div>

        {/* Quick-filter status pill carousel */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5 border-t border-slate2-100 text-xs">
          <span className="text-[11px] font-semibold text-slate2-400 uppercase tracking-wider mr-1 shrink-0 flex items-center gap-1">
            <Filter size={11} /> Filter:
          </span>
          {STATUS_FILTERS.map((f) => {
            const isActive = status === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => handleStatusChange(f.value)}
                className={`whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-medium transition-all cursor-pointer ${
                  isActive
                    ? "bg-brand text-white shadow-2xs font-semibold"
                    : "bg-slate2-50 text-slate2-600 hover:bg-slate2-100 border border-slate2-200/60"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Ledger List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-slate2-100 border border-slate2-200/60" />
          ))}
        </div>
      ) : filteredMeetings.length === 0 ? (
        <Card className="p-8">
          <EmptyState
            title={hasActiveFilters ? "No sessions match these filters" : "No meetings found"}
            description={
              hasActiveFilters
                ? "Try adjusting your search query, or clear filters to view all sessions."
                : "Schedule your first meeting session to begin tracking agendas, minutes, and decisions."
            }
          />
          {hasActiveFilters && (
            <div className="mt-4 flex justify-center">
              <Button variant="secondary" onClick={clearAllFilters} className="text-xs">
                Reset all filters
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <div className="space-y-7">
          {grouped.map(([day, items]) => {
            const dateObj = new Date(day);
            const formattedDate = dateObj.toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            });

            return (
              <div key={day} className="space-y-3">
                {/* Clean Date Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate2-700">
                    <Calendar size={13} className="text-brand" />
                    <span>{formattedDate}</span>
                  </div>
                  <span className="rounded-full bg-slate2-100 px-2 py-0.5 text-[10px] font-semibold text-slate2-500">
                    {items.length} {items.length === 1 ? "session" : "sessions"}
                  </span>
                  <div className="h-px flex-1 bg-slate2-200/70" />
                </div>

                <div className="space-y-3">
                  {items.map((m) => {
                    const meetingDate = new Date(m.date);
                    const monthShort = meetingDate.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
                    const dayNum = meetingDate.toLocaleDateString("en-US", { day: "numeric" });

                    return (
                      <Link key={m.id} to={`/meetings/${m.id}`} className="group block">
                        <div
                          className={`rounded-xl border bg-white p-4 sm:p-5 transition-all duration-150 hover:border-brand/40 hover:shadow-sm ${
                            m.forceApproved
                              ? "border-l-4 border-l-amber-500 border-slate2-200"
                              : "border-slate2-200"
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                            {/* Calendar Block (Signature focal ledger element) */}
                            <div className="hidden sm:flex flex-col items-center justify-center h-16 w-16 rounded-xl border border-slate2-200 bg-slate2-50/70 shrink-0 text-center transition-colors group-hover:border-brand/30 group-hover:bg-brand/[0.03]">
                              <span className="text-[10px] font-bold tracking-wider text-brand font-mono">
                                {monthShort}
                              </span>
                              <span className="text-xl font-black text-slate2-800 leading-none mt-0.5 font-display">
                                {dayNum}
                              </span>
                            </div>

                            {/* Center Content Dossier */}
                            <div className="flex-1 min-w-0 space-y-2">
                              {/* Title, Monospace Code, Badges */}
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-sm sm:text-base font-bold text-slate2-900 group-hover:text-brand transition-colors">
                                  {m.title}
                                </h3>
                                <CodeChip>{m.code}</CodeChip>
                                <span className="inline-flex items-center rounded-md bg-slate2-100 px-2 py-0.5 text-[11px] font-medium text-slate2-700">
                                  {m.department.name}
                                </span>
                              </div>

                              {/* Description */}
                              {m.description && (
                                <p className="text-xs text-slate2-600 line-clamp-2 leading-relaxed">
                                  {m.description}
                                </p>
                              )}

                              {/* Participant search matches */}
                              {q.trim() &&
                                m.participants &&
                                m.participants.some((p) =>
                                  p.user.name.toLowerCase().includes(q.trim().toLowerCase())
                                ) && (
                                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate2-500 pt-0.5">
                                    <span className="text-[11px] text-slate2-400">Matched attendee:</span>
                                    {m.participants
                                      .filter((p) =>
                                        p.user.name.toLowerCase().includes(q.trim().toLowerCase())
                                      )
                                      .map((p) => (
                                        <span
                                          key={p.user.id}
                                          className="inline-flex items-center gap-1 rounded bg-slate2-100 px-1.5 py-0.5 text-[11px] font-medium text-slate2-700"
                                        >
                                          <span
                                            className="inline-block h-2 w-2 rounded-full"
                                            style={{ backgroundColor: p.user.avatarColor || "#0B7A6B" }}
                                          />
                                          <span>{p.user.name}</span>
                                          {p.status === "ACCEPTED" && (
                                            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 rounded-sm">
                                              (Accepted)
                                            </span>
                                          )}
                                        </span>
                                      ))}
                                  </div>
                                )}

                              {/* Administrative Override Callout */}
                              {m.forceApproved && (
                                <div className="flex items-center gap-2 rounded-lg bg-amber-50/90 border border-amber-200 px-2.5 py-1 text-xs text-amber-900">
                                  <AlertTriangle size={13} className="text-amber-600 shrink-0" />
                                  <span className="font-semibold shrink-0">Admin Override:</span>
                                  <span className="truncate text-amber-800">
                                    {m.bypassReason || "Certified prior to full participant signature collection"}
                                  </span>
                                </div>
                              )}

                              {/* Metadata Strip */}
                              <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-slate2-500">
                                <div className="flex items-center gap-1.5">
                                  <Avatar name={m.organizer.name} color={m.organizer.avatarColor} />
                                  <span className="font-medium text-slate2-700">{m.organizer.name}</span>
                                </div>

                                <span className="text-slate2-300">·</span>

                                <div className="flex items-center gap-1">
                                  <Users size={13} className="text-slate2-400" />
                                  <span>{m._count.participants} attendees</span>
                                </div>

                                {m.location && (
                                  <>
                                    <span className="text-slate2-300">·</span>
                                    <div className="flex items-center gap-1">
                                      <MapPin size={13} className="text-slate2-400" />
                                      <span className="truncate max-w-[160px]">{m.location}</span>
                                    </div>
                                  </>
                                )}

                                {m.onlineLink && (
                                  <>
                                    <span className="text-slate2-300">·</span>
                                    <div className="flex items-center gap-1 text-brand">
                                      <Video size={13} />
                                      <span>Online Room</span>
                                    </div>
                                  </>
                                )}

                                {m.approvedBy && (
                                  <>
                                    <span className="text-slate2-300">·</span>
                                    <div
                                      className={`flex items-center gap-1 font-medium ${
                                        m.forceApproved ? "text-amber-800" : "text-brand"
                                      }`}
                                    >
                                      <ShieldCheck
                                        size={13}
                                        className={m.forceApproved ? "text-amber-600" : "text-brand"}
                                      />
                                      <span>
                                        {m.forceApproved ? "Force certified" : "Certified by"} {m.approvedBy.name}
                                      </span>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Right Status & Time Column */}
                            <div className="flex flex-row sm:flex-col sm:items-end justify-between items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate2-100 shrink-0">
                              <div className="flex items-center gap-1.5 rounded-lg bg-slate2-50 border border-slate2-200/80 px-2.5 py-1 text-xs font-mono font-semibold text-slate2-800">
                                <Clock size={12} className="text-brand shrink-0" />
                                <span>
                                  {m.startTime} – {m.endTime}
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <PriorityBadge priority={m.priority} />
                                <StatusBadge status={m.status} />
                              </div>

                              <div className="flex items-center gap-2 pt-1">
                                {canEditMeeting(m) && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setEditingMeeting(m);
                                    }}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate2-200 bg-white hover:bg-slate2-50 text-slate2-700 hover:text-brand hover:border-brand/40 transition-colors shadow-2xs cursor-pointer"
                                    title={isLockedMeeting(m.status) ? "Session locked (unlock required to modify)" : "Edit meeting details"}
                                  >
                                    <Pencil size={11} className="text-brand" />
                                    <span>Edit</span>
                                  </button>
                                )}

                                <div className="hidden sm:flex items-center gap-1 text-xs font-semibold text-slate2-400 group-hover:text-brand transition-colors">
                                  <span>Open</span>
                                  <ChevronRight size={13} />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
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

      {editingMeeting && (
        <MeetingEditModal
          meeting={editingMeeting}
          departments={departments}
          onClose={() => setEditingMeeting(null)}
          onUpdated={handleMeetingUpdated}
        />
      )}

      {feedbackToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-slate2-900 text-white px-4 py-3 text-xs shadow-xl border border-slate2-700">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <span>{feedbackToast.message}</span>
          <button
            type="button"
            onClick={() => setFeedbackToast(null)}
            className="ml-2 text-slate2-400 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}


