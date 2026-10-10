import React, { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ListChecks,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Search,
  X,
  Filter,
  Sliders,
  CheckSquare,
} from "lucide-react";
import { api } from "../../api/client";
import type { ActionItem, Department, User } from "../../types";
import { Card, CardHeader, inputClass } from "../../components/ui/Primitives";
import { AccountabilityTable } from "../../components/dashboard/AccountabilityTable";
import { ActionItemDetailView } from "./ActionItemDetailView";
import { useAuth } from "../../context/AuthContext";

const STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

type QuickTab = "all" | "mine" | "in_progress" | "overdue" | "completed";

export default function ActionItemsPage() {
  const { id } = useParams<{ id?: string }>();
  const { user, hasPermission } = useAuth();

  // If a specific task ID is provided in the route, render the comprehensive Details Page
  if (id) {
    return <ActionItemDetailView id={id} />;
  }

  // Otherwise, render the Action & Accountability Hub Directory
  return <ActionItemsHub user={user} hasPermission={hasPermission} />;
}

function ActionItemsHub({
  user,
  hasPermission,
}: {
  user: any;
  hasPermission: (perm: string) => boolean;
}) {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<QuickTab>("all");

  const [status, setStatus] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [priority, setPriority] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [loading, setLoading] = useState(true);

  // Fetch reference metadata
  useEffect(() => {
    api.get<Department[]>("/departments").then(setDepartments).catch(() => {});
    api.get<User[]>("/users").then(setUsers).catch(() => {});
  }, []);

  // Fetch action items based on active server query parameters
  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();

    // Map quick tabs to server params
    if (activeTab === "mine") {
      params.set("mine", "true");
    } else if (activeTab === "overdue") {
      params.set("overdue", "true");
    } else if (activeTab === "in_progress") {
      params.set("status", "IN_PROGRESS");
    } else if (activeTab === "completed") {
      params.set("status", "COMPLETED");
    } else if (status) {
      params.set("status", status);
    }

    if (departmentId) params.set("departmentId", departmentId);
    if (priority) params.set("priority", priority);
    if (assignedToId) params.set("assignedToId", assignedToId);

    api
      .get<ActionItem[]>(`/action-items?${params.toString()}`)
      .then(setItems)
      .catch((err) => {
        console.error("Failed to load action items:", err);
        setItems([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [activeTab, status, departmentId, priority, assignedToId]);

  // Client-side text search filter
  const displayedItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase().trim();
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q)) ||
        (item.meeting?.code && item.meeting.code.toLowerCase().includes(q)) ||
        (item.assignedTo?.name && item.assignedTo.name.toLowerCase().includes(q))
    );
  }, [items, searchQuery]);

  // Metric computations for the Executive Pulse Strip
  const metrics = useMemo(() => {
    const total = items.length;
    const inProgress = items.filter((i) => i.status === "IN_PROGRESS").length;
    const overdue = items.filter((i) => i.overdue && i.status !== "COMPLETED").length;
    const completed = items.filter((i) => i.status === "COMPLETED").length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, inProgress, overdue, completed, completionRate };
  }, [items]);

  const hasActiveFilters = Boolean(
    activeTab !== "all" || status || priority || departmentId || assignedToId || searchQuery
  );

  const clearFilters = () => {
    setActiveTab("all");
    setStatus("");
    setPriority("");
    setDepartmentId("");
    setAssignedToId("");
    setSearchQuery("");
  };

  return (
    <div className="space-y-6">
      {/* ── Executive Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate2-900 tracking-tight">
            Action & Accountability
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate2-500 leading-relaxed max-w-2xl">
            Track commitments, assign operational ownership, and ensure thorough follow-through on corporate meeting decisions.
          </p>
        </div>

        {/* Live Search Input */}
        <div className="relative w-full sm:w-72 shrink-0">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate2-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by task, code, description, assignee…"
            className="w-full rounded-lg border border-slate2-200 bg-white pl-9 pr-8 py-2 text-xs text-slate2-800 placeholder-slate2-400 shadow-2xs focus:border-brand focus:outline-hidden focus:ring-1 focus:ring-brand"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate2-400 hover:text-slate2-600 p-0.5 rounded cursor-pointer"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* ── Executive Status Pulse Cards with Distinct Gaps ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Commitments */}
        <div className="rounded-xl border border-slate2-200/90 bg-white p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-shadow flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-slate2-500">Total Tasks</p>
            <p className="mt-1 text-2xl font-bold font-mono text-slate2-900">{metrics.total}</p>
            <p className="mt-0.5 text-[11px] text-slate2-400">Mandated across sessions</p>
          </div>
          <div className="h-10 w-10 rounded-lg bg-slate2-100/80 flex items-center justify-center text-slate2-600 shrink-0">
            <CheckSquare size={18} />
          </div>
        </div>

        {/* Card 2: In Progress */}
        <div className="rounded-xl border border-teal-100/90 bg-white p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-shadow flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-slate2-500">In Progress</p>
            <p className="mt-1 text-2xl font-bold font-mono text-brand">{metrics.inProgress}</p>
            <p className="mt-0.5 text-[11px] text-slate2-400">Actively being executed</p>
          </div>
          <div className="h-10 w-10 rounded-lg bg-teal-50 flex items-center justify-center text-brand shrink-0">
            <Clock size={18} />
          </div>
        </div>

        {/* Card 3: Overdue Deliverables */}
        <div className={`rounded-xl border p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-all flex items-center justify-between gap-3 ${
          metrics.overdue > 0 ? "border-rose-200/90 bg-rose-50/40" : "border-slate2-200/90 bg-white"
        }`}>
          <div>
            <p className={`text-xs font-medium ${metrics.overdue > 0 ? "text-rose-700 font-semibold" : "text-slate2-500"}`}>
              Overdue
            </p>
            <p className={`mt-1 text-2xl font-bold font-mono ${metrics.overdue > 0 ? "text-rose-700" : "text-slate2-900"}`}>
              {metrics.overdue}
            </p>
            <p className={`mt-0.5 text-[11px] ${metrics.overdue > 0 ? "text-rose-600" : "text-slate2-400"}`}>
              {metrics.overdue > 0 ? "Requiring urgent intervention" : "All deliverables on schedule"}
            </p>
          </div>
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
            metrics.overdue > 0 ? "bg-rose-100 text-rose-700" : "bg-slate2-100/80 text-slate2-600"
          }`}>
            <AlertTriangle size={18} />
          </div>
        </div>

        {/* Card 4: Completed Rate */}
        <div className="rounded-xl border border-emerald-100/90 bg-white p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-shadow flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-slate2-500">Completed</p>
            <div className="mt-1 flex items-baseline gap-2">
              <p className="text-2xl font-bold font-mono text-emerald-700">{metrics.completed}</p>
              <span className="text-xs font-mono font-semibold text-slate2-400">({metrics.completionRate}%)</span>
            </div>
            <p className="mt-0.5 text-[11px] text-slate2-400">Fulfilled & signed off</p>
          </div>
          <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
            <CheckCircle2 size={18} />
          </div>
        </div>
      </div>

      {/* ── Operational Registry Card ── */}
      <Card className="border border-slate2-200 bg-white shadow-sm overflow-hidden">
        {/* Streamlined Unified Toolbar */}
        <div className="p-3.5 sm:p-4 border-b border-slate2-100 bg-slate2-50/50 flex flex-wrap items-center justify-between gap-3">
          {/* Dropdown Filters Group */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Status / Scope Filter Dropdown */}
            <select
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value as any)}
              className="text-xs font-semibold py-1.5 px-3 rounded-lg border border-slate2-200 bg-white text-slate2-800 shadow-2xs hover:border-slate2-300 focus:outline-hidden focus:ring-1 focus:ring-brand focus:border-brand cursor-pointer min-w-[150px]"
            >
              <option value="all">All Tasks ({metrics.total})</option>
              {user && <option value="mine">Assigned to Me</option>}
              <option value="in_progress">In Progress ({metrics.inProgress})</option>
              <option value="overdue">Overdue ({metrics.overdue})</option>
              <option value="completed">Completed ({metrics.completed})</option>
            </select>
            {/* Priority Select */}
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="text-xs py-1.5 px-2.5 rounded-lg border border-slate2-200 bg-white text-slate2-700 shadow-2xs hover:border-slate2-300 focus:outline-hidden focus:ring-1 focus:ring-brand focus:border-brand cursor-pointer"
            >
              <option value="">All Priorities</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p} Priority
                </option>
              ))}
            </select>

            {/* Department Select */}
            {(hasPermission("action_items:view:all") || hasPermission("ADMIN_OVERRIDE")) && (
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="text-xs py-1.5 px-2.5 rounded-lg border border-slate2-200 bg-white text-slate2-700 shadow-2xs hover:border-slate2-300 focus:outline-hidden focus:ring-1 focus:ring-brand focus:border-brand cursor-pointer max-w-[170px]"
              >
                <option value="">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}

            {/* Assignee Select */}
            <select
              value={assignedToId}
              onChange={(e) => setAssignedToId(e.target.value)}
              className="text-xs py-1.5 px-2.5 rounded-lg border border-slate2-200 bg-white text-slate2-700 shadow-2xs hover:border-slate2-300 focus:outline-hidden focus:ring-1 focus:ring-brand focus:border-brand cursor-pointer max-w-[150px]"
            >
              <option value="">All Assignees</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>

            {/* Reset Button */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs font-semibold text-brand hover:text-brand-dark px-2 py-1 rounded transition-colors cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Table Content */}
        {loading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-11 animate-pulse rounded-lg bg-slate2-100" />
            ))}
          </div>
        ) : (
          <AccountabilityTable items={displayedItems} />
        )}
      </Card>
    </div>
  );
}
