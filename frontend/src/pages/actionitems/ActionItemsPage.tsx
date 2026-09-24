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
  const { user } = useAuth();
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
        <div className="flex flex-wrap items-center gap-2 border-b border-slate2-100 p-4">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputClass} w-auto`}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className={`${inputClass} w-auto`}>
            <option value="">All priorities</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className={`${inputClass} w-auto`}>
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)} className={`${inputClass} w-auto`}>
            <option value="">Anyone</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate2-600">
            <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} /> Overdue only
          </label>
          {user && (
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate2-600">
              <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> Assigned to me
            </label>
          )}
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
