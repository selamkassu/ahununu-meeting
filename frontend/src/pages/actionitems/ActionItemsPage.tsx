import React, { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { ListChecks, ArrowLeft, ExternalLink } from "lucide-react";
import { api } from "../../api/client";
import type { ActionItem, Department, User } from "../../types";
import { Card, CardHeader, inputClass } from "../../components/ui/Primitives";
import { AccountabilityTable } from "../../components/dashboard/AccountabilityTable";
import { useAuth } from "../../context/AuthContext";

const STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export default function ActionItemsPage() {
  const { id } = useParams<{ id?: string }>();
  const { user, hasPermission } = useAuth();
  const [items, setItems] = useState<ActionItem[]>([]);
  const [focusedItem, setFocusedItem] = useState<ActionItem | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [status, setStatus] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [priority, setPriority] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Department[]>("/departments").then(setDepartments);
    api.get<User[]>("/users").then(setUsers);
  }, []);

  useEffect(() => {
    if (id) {
      api
        .get<ActionItem>(`/action-items/${id}`)
        .then(setFocusedItem)
        .catch(() => setFocusedItem(null));
    } else {
      setFocusedItem(null);
    }
  }, [id]);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (departmentId) params.set("departmentId", departmentId);
    if (priority) params.set("priority", priority);
    if (assignedToId) params.set("assignedToId", assignedToId);
    if (overdueOnly) params.set("overdue", "true");
    if (mineOnly) params.set("mine", "true");
    api
      .get<ActionItem[]>(`/action-items?${params.toString()}`)
      .then(setItems)
      .finally(() => setLoading(false));
  };

  useEffect(load, [status, departmentId, priority, assignedToId, overdueOnly, mineOnly]);

  const displayItems = useMemo(() => {
    if (!focusedItem) return items;
    if (items.some((i) => i.id === focusedItem.id)) return items;
    return [focusedItem, ...items];
  }, [items, focusedItem]);

  const overdueCount = displayItems.filter((i) => i.overdue).length;

  const hasActiveFilters = Boolean(
    status || priority || departmentId || assignedToId || overdueOnly || mineOnly
  );

  const clearFilters = () => {
    setStatus("");
    setPriority("");
    setDepartmentId("");
    setAssignedToId("");
    setOverdueOnly(false);
    setMineOnly(false);
  };

  return (
    <div className="space-y-4">
      {focusedItem && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50/80 px-4 py-3 text-xs text-teal-950 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-teal-600 px-2 py-0.5 text-[10px] font-semibold text-white">
              Selected Task
            </span>
            <span className="font-semibold text-slate2-800">{focusedItem.title}</span>
            <span className="font-mono text-[11px] text-teal-800 bg-teal-100/80 px-1.5 py-0.5 rounded border border-teal-200">
              {focusedItem.code}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {focusedItem.meetingId && (
              <Link
                to={`/meetings/${focusedItem.meetingId}`}
                className="inline-flex items-center gap-1 font-semibold text-brand hover:underline"
              >
                <span>View Meeting</span>
                <ExternalLink size={12} />
              </Link>
            )}
            <Link
              to="/action-items"
              className="inline-flex items-center gap-1 font-medium text-slate2-600 hover:text-slate2-900"
            >
              <ArrowLeft size={12} />
              <span>View All Tasks</span>
            </Link>
          </div>
        </div>
      )}

      <Card>
        <CardHeader
          title="Action & Accountability"
          subtitle="Every task assigned from a meeting — who owns it, when it's due, and where it stands"
          action={
            overdueCount > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-danger">
                <ListChecks size={13} /> {overdueCount} overdue
              </span>
            )
          }
        />
        <div className="flex flex-nowrap items-center justify-between gap-4 border-b border-slate2-100 p-4 overflow-x-auto">
          {/* Left side: Checkboxes and Clear */}
          <div className="flex items-center gap-4 shrink-0">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate2-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={overdueOnly}
                onChange={(e) => setOverdueOnly(e.target.checked)}
                className="rounded border-slate2-300 text-brand focus:ring-brand"
              />
              <span>Overdue only</span>
            </label>
            {user && (
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate2-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={mineOnly}
                  onChange={(e) => setMineOnly(e.target.checked)}
                  className="rounded border-slate2-300 text-brand focus:ring-brand"
                />
                <span>Assigned to me</span>
              </label>
            )}
            <button
              type="button"
              onClick={clearFilters}
              className={`text-xs font-medium transition-colors ${
                hasActiveFilters
                  ? "text-brand hover:text-brand-dark cursor-pointer font-semibold"
                  : "text-slate2-400 hover:text-slate2-600 cursor-pointer"
              }`}
            >
              Clear
            </button>
          </div>

          {/* Right side: Dropdowns in exact order */}
          <div className="flex items-center gap-2 shrink-0">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={`${inputClass} w-auto text-xs py-1.5`}
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className={`${inputClass} w-auto text-xs py-1.5`}
            >
              <option value="">All priorities</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            {(hasPermission("action_items:view:all") || user?.role?.code === "SYSTEM_ADMIN") && (
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className={`${inputClass} w-auto text-xs py-1.5`}
              >
                <option value="">All departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
            <select
              value={assignedToId}
              onChange={(e) => setAssignedToId(e.target.value)}
              className={`${inputClass} w-auto text-xs py-1.5`}
            >
              <option value="">Anyone</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {loading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-slate2-100" />
            ))}
          </div>
        ) : (
          <AccountabilityTable items={displayItems} highlightedId={id} />
        )}
      </Card>
    </div>
  );
}
