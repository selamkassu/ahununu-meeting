import React, { useEffect, useState } from "react";
import { ListChecks } from "lucide-react";
import { api } from "../../api/client";
import type { ActionItem, Department, User } from "../../types";
import { Card, CardHeader, inputClass } from "../../components/ui/Primitives";
import { AccountabilityTable } from "../../components/dashboard/AccountabilityTable";
import { useAuth } from "../../context/AuthContext";

const STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export default function ActionItemsPage() {
  const { user, hasPermission } = useAuth();
  const [items, setItems] = useState<ActionItem[]>([]);
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

  const overdueCount = items.filter((i) => i.overdue).length;

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
          <AccountabilityTable items={items} />
        )}
      </Card>
    </div>
  );
}
