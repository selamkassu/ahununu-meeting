import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, MapPin, Video, Users } from "lucide-react";
import { api } from "../../api/client";
import type { MeetingListItem, Department } from "../../types";
import { Card, EmptyState, Button, inputClass, Avatar } from "../../components/ui/Primitives";
import { CodeChip } from "../../components/ui/Primitives";
import { StatusBadge, PriorityBadge } from "../../components/ui/Badge";
import { useAuth } from "../../context/AuthContext";
import MeetingCreateModal from "./MeetingCreateModal";

const STATUSES = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

export default function MeetingList() {
  const { user, hasPermission } = useAuth();
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [q, setQ] = useState("");
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

  const grouped = useMemo(() => {
    const map = new Map<string, MeetingListItem[]>();
    for (const m of meetings) {
      const key = new Date(m.date).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return Array.from(map.entries());
  }, [meetings]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap lg:flex-nowrap">
        {/* Search — grows to fill available space */}
        <div className="relative flex-1 min-w-[160px]">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate2-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search meetings…"
            className={`${inputClass} pl-8 w-full`}
          />
        </div>

        {/* Status dropdown */}
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={`${inputClass} w-full sm:w-36 shrink-0`}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </select>

        {/* Department dropdown */}
        <select
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          className={`${inputClass} w-full sm:w-40 shrink-0`}
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>

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
      ) : meetings.length === 0 ? (
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
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate2-400">
                {new Date(day).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              </p>
              <div className="space-y-2">
                {items.map((m) => (
                  <Link key={m.id} to={`/meetings/${m.id}`}>
                    <Card className="flex flex-col gap-3 p-4 transition-shadow hover:shadow-md sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                        <div className="flex w-16 shrink-0 flex-col items-center rounded-lg bg-slate2-50 py-1.5 text-center">
                          <span className="text-[11px] font-medium text-slate2-500">{m.startTime}</span>
                          <span className="text-[10px] text-slate2-400">{m.endTime}</span>
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-display text-sm font-semibold text-slate2-800">{m.title}</p>
                            <CodeChip>{m.code}</CodeChip>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate2-500">
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
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                        <PriorityBadge priority={m.priority} />
                        <StatusBadge status={m.status} />
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
