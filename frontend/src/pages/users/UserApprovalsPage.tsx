import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  UserCheck,
  Clock,
  Building2,
  Briefcase,
  Mail,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  Search,
  Filter,
  Check,
  UserX,
  History,
  Info,
  Calendar,
  Sparkles,
  ChevronRight,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { Toast } from "../../components/ui/Toast";
import { Modal } from "../../components/ui/Modal";
import { Button, Field, inputClass } from "../../components/ui/Primitives";
import { GoogleIcon } from "../../components/auth/GoogleAuthButton";
import type { User, RoleDetail } from "../../types";

interface DepartmentOption {
  id: string;
  name: string;
  code: string;
}

interface AdminNotificationItem {
  id: string;
  userId: string | null;
  type: string;
  title: string;
  message: string;
  metadata: any;
  isRead: boolean;
  createdAt: string;
}

function getRoleDisplayLabel(role: RoleDetail): string {
  switch (role.code) {
    case "SYSTEM_ADMIN":
      return "Super Admin (System Admin)";
    case "DEPARTMENT_HEAD":
      return "Branch Coordinator (Department Head)";
    case "MEETING_SECRETARY":
      return "Meeting Organizer (Meeting Secretary)";
    case "PARTICIPANT":
      return "Attendee (Participant)";
    case "MEETING_APPROVER":
      return "Meeting Approver";
    default:
      return role.name;
  }
}

export default function UserApprovalsPage() {
  const { user: currentUser, hasPermission } = useAuth();
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const showToast = useCallback((message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
  }, []);

  const [activeTab, setActiveTab] = useState<"pending" | "audit">("pending");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<RoleDetail[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [adminNotifications, setAdminNotifications] = useState<AdminNotificationItem[]>([]);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState("ALL");
  const [methodFilter, setMethodFilter] = useState<"ALL" | "google" | "local">("ALL");

  // Selection states per pending user: { [userId]: { roleId: string; departmentId: string } }
  const [assignments, setAssignments] = useState<Record<string, { roleId: string; departmentId: string }>>({});

  // Action modals
  const [approvingUserId, setApprovingUserId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Reject modal
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [userToReject, setUserToReject] = useState<User | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const [auditFilter, setAuditFilter] = useState<"ALL" | "PENDING" | "PROCESSED">("ALL");
  const [clearingAudit, setClearingAudit] = useState(false);

  // Unread count for notifications badge
  const unreadAdminNotifsCount = useMemo(
    () => adminNotifications.filter((n) => !n.isRead).length,
    [adminNotifications]
  );

  const filteredAdminNotifications = useMemo(() => {
    return adminNotifications.filter((n) => {
      if (auditFilter === "PENDING") return !n.isRead;
      if (auditFilter === "PROCESSED") return n.isRead;
      return true;
    });
  }, [adminNotifications, auditFilter]);

  const handleClearProcessedAudit = async () => {
    setClearingAudit(true);
    try {
      await api.delete("/notifications/admin-notifications/clear-processed");
      setAdminNotifications((prev) => prev.filter((n) => !n.isRead));
      showToast("Cleared processed notification records from audit log.", "success");
    } catch {
      showToast("Failed to clear processed notifications.", "error");
    } finally {
      setClearingAudit(false);
    }
  };

  const handleDeleteAuditRecord = async (id: string) => {
    try {
      await api.delete(`/notifications/admin-notifications/${id}`);
      setAdminNotifications((prev) => prev.filter((n) => n.id !== id));
      showToast("Audit record removed.", "info");
    } catch {
      showToast("Failed to delete audit record.", "error");
    }
  };

  const canApprove = hasPermission("users:approve") || hasPermission("ADMIN_OVERRIDE");

  // Fetch pending users, roles, and departments
  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const [pendingRes, rolesRes, deptsRes, notifRes] = await Promise.all([
        api.get<User[]>("/users/approvals"),
        api.get<RoleDetail[]>("/roles"),
        api.get<DepartmentOption[]>("/departments"),
        api.get<AdminNotificationItem[]>("/notifications/admin-notifications").catch(() => []),
      ]);

      const validPending = Array.isArray(pendingRes) ? pendingRes : [];
      setPendingUsers(validPending);

      // Filter out UNASSIGNED from selectable roles list
      const operationalRoles = (Array.isArray(rolesRes) ? rolesRes : []).filter(
        (r) => r.code !== "UNASSIGNED"
      );
      setRoles(operationalRoles);

      const validDepts = Array.isArray(deptsRes) ? deptsRes : [];
      setDepartments(validDepts);

      setAdminNotifications(Array.isArray(notifRes) ? notifRes : []);

      // Initialize default selections for new pending users (empty roleId to require deliberate selection)
      setAssignments((prev) => {
        const next = { ...prev };
        validPending.forEach((u) => {
          if (!next[u.id]) {
            next[u.id] = {
              roleId: "",
              departmentId: u.departmentId || "",
            };
          }
        });
        return next;
      });
    } catch (err: any) {
      showToast(err?.message || "Failed to load pending user approvals.", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle role change for a specific user card
  const handleRoleChange = (userId: string, roleId: string) => {
    setAssignments((prev) => ({
      ...prev,
      [userId]: {
        ...(prev[userId] || { departmentId: "" }),
        roleId,
      },
    }));
  };

  // Handle department change for a specific user card
  const handleDepartmentChange = (userId: string, departmentId: string) => {
    setAssignments((prev) => ({
      ...prev,
      [userId]: {
        ...(prev[userId] || { roleId: "" }),
        departmentId,
      },
    }));
  };

  // Execute Approval & Role Assignment
  const handleConfirmApproval = async (user: User) => {
    const assignment = assignments[user.id];
    if (!assignment?.roleId) {
      showToast("Please select a role from the dropdown menu.", "error");
      return;
    }

    const assignedRole = roles.find((r) => r.id === assignment.roleId);
    if (!assignedRole) {
      showToast("Selected role is invalid.", "error");
      return;
    }

    setApprovingUserId(user.id);
    setActionLoading(true);

    try {
      await api.post(`/users/${user.id}/approve`, {
        roleId: assignment.roleId,
        departmentId: assignment.departmentId || null,
        jobTitle: user.jobTitle || undefined,
      });

      showToast(
        `Approval confirmed! ${user.name} assigned to role '${assignedRole.name}' and is now Active.`,
        "success"
      );

      // Remove from pending list
      setPendingUsers((prev) => prev.filter((p) => p.id !== user.id));
      // Refresh audit logs in background
      api.get<AdminNotificationItem[]>("/notifications/admin-notifications")
        .then((data) => setAdminNotifications(Array.isArray(data) ? data : []))
        .catch(() => {});
    } catch (err: any) {
      showToast(err?.message || "Approval failed. Please check permissions.", "error");
    } finally {
      setApprovingUserId(null);
      setActionLoading(false);
    }
  };

  // Open rejection dialog
  const openRejectDialog = (user: User) => {
    setUserToReject(user);
    setRejectReason("");
    setRejectModalOpen(true);
  };

  // Confirm Rejection
  const handleConfirmReject = async () => {
    if (!userToReject) return;
    setActionLoading(true);
    try {
      await api.post(`/users/${userToReject.id}/reject`, {
        reason: rejectReason.trim() || undefined,
      });
      showToast(`Registration for ${userToReject.name} has been declined.`, "info");
      setPendingUsers((prev) => prev.filter((p) => p.id !== userToReject.id));
      setRejectModalOpen(false);
      setUserToReject(null);
    } catch (err: any) {
      showToast(err?.message || "Failed to decline registration.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Filtered pending users
  const filteredUsers = useMemo(() => {
    return pendingUsers.filter((u) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        u.name.toLowerCase().includes(q) ||
        Boolean(u.email && u.email.toLowerCase().includes(q)) ||
        Boolean(u.jobTitle && u.jobTitle.toLowerCase().includes(q));

      const matchesDept =
        deptFilter === "ALL" ||
        (deptFilter === "UNASSIGNED" && !u.departmentId) ||
        u.departmentId === deptFilter;

      const isGoogle = Boolean(u.googleId);
      const matchesMethod =
        methodFilter === "ALL" ||
        (methodFilter === "google" && isGoogle) ||
        (methodFilter === "local" && !isGoogle);

      return matchesSearch && matchesDept && matchesMethod;
    });
  }, [pendingUsers, searchQuery, deptFilter, methodFilter]);

  if (!canApprove) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 mb-4">
            <ShieldAlert size={28} />
          </div>
          <h2 className="text-xl font-bold text-rose-950">Access Restricted</h2>
          <p className="mt-2 text-sm text-rose-700 max-w-md mx-auto">
            You do not have the required permission (<code>users:approve</code>) to access the User Approvals and Role Assignment portal. Please contact a System Administrator.
          </p>
          <div className="mt-6">
            <Link to="/" className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-rose-300 rounded-xl text-sm font-semibold text-rose-800 shadow-sm hover:bg-rose-50">
              Return to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate2-200/80 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <UserCheck size={24} strokeWidth={2.2} />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-black tracking-tight text-slate2-900">
                  User Approvals & Role Assignment
                </h1>
                {pendingUsers.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-bold text-white shadow-sm">
                    {pendingUsers.length} Pending
                  </span>
                )}
              </div>
              <p className="text-sm text-slate2-500 mt-0.5">
                Review newly registered Google and self-service accounts, assign appropriate roles, and activate portal access.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={loading || refreshing}
            className="focus-ring inline-flex items-center gap-2 rounded-xl border border-slate2-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate2-700 shadow-sm hover:bg-slate2-50 cursor-pointer disabled:opacity-50"
            title="Refresh queue"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin text-brand" : "text-slate2-500"} />
            <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
          </button>

          <Link
            to="/users"
            className="focus-ring inline-flex items-center gap-1.5 rounded-xl border border-slate2-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate2-700 shadow-sm hover:bg-slate2-50"
          >
            <span>All Directory Users</span>
            <ChevronRight size={14} className="text-slate2-400" />
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate2-200">
        <button
          type="button"
          onClick={() => setActiveTab("pending")}
          className={`relative flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors cursor-pointer ${
            activeTab === "pending"
              ? "border-brand text-brand font-bold"
              : "border-transparent text-slate2-500 hover:text-slate2-800"
          }`}
        >
          <UserCheck size={17} />
          <span>Pending Approvals Queue</span>
          {pendingUsers.length > 0 && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                activeTab === "pending"
                  ? "bg-brand text-white"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {pendingUsers.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("audit")}
          className={`relative flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors cursor-pointer ${
            activeTab === "audit"
              ? "border-brand text-brand font-bold"
              : "border-transparent text-slate2-500 hover:text-slate2-800"
          }`}
        >
          <History size={17} />
          <span>System Audit & Notifications</span>
          {unreadAdminNotifsCount > 0 && (
            <span className="rounded-full bg-amber-500 text-white px-2 py-0.5 text-xs font-bold shadow-sm">
              {unreadAdminNotifsCount}
            </span>
          )}
        </button>
      </div>

      {/* MAIN TAB: PENDING APPROVALS */}
      {activeTab === "pending" && (
        <div className="space-y-6">
          {/* Workflow Info Banner */}
          <div className="rounded-2xl border border-teal-200/90 bg-gradient-to-r from-teal-50/90 via-emerald-50/50 to-white p-4.5 shadow-sm">
            <div className="flex items-start gap-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white shadow-sm mt-0.5">
                <Sparkles size={18} />
              </div>
              <div className="text-xs leading-relaxed text-slate2-700">
                <p className="font-bold text-slate2-900 text-sm">
                  Corporate Sign-up Governance Flow
                </p>
                <p className="mt-1">
                  When new users register with Google or corporate email, their record is assigned status{" "}
                  <strong className="text-amber-800 bg-amber-100/80 px-1.5 py-0.5 rounded font-semibold">PENDING</strong>{" "}
                  and role{" "}
                  <strong className="text-slate2-800 bg-slate2-200/80 px-1.5 py-0.5 rounded font-mono font-medium">UNASSIGNED</strong>.
                  Select a role from the dropdown and confirm approval to immediately grant portal access.
                </p>
              </div>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-col gap-3 rounded-2xl border border-slate2-200/80 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate2-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search pending user by name, email, or title..."
                className="focus-ring w-full rounded-xl border border-slate2-200 bg-slate2-50/50 pl-10 pr-4 py-2 text-xs font-medium text-slate2-800 placeholder-slate2-400 transition-colors focus:bg-white"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-1.5 text-xs text-slate2-500">
                <Filter size={14} className="text-slate2-400" />
                <span>Department:</span>
              </div>
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="focus-ring rounded-xl border border-slate2-200 bg-white px-3 py-1.5 text-xs font-medium text-slate2-700 cursor-pointer"
              >
                <option value="ALL">All Departments</option>
                <option value="UNASSIGNED">Unassigned Dept</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.code})
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1.5 text-xs text-slate2-500 ml-2">
                <span>Method:</span>
              </div>
              <select
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value as any)}
                className="focus-ring rounded-xl border border-slate2-200 bg-white px-3 py-1.5 text-xs font-medium text-slate2-700 cursor-pointer"
              >
                <option value="ALL">All Sign-up Methods</option>
                <option value="google">Google OAuth Only</option>
                <option value="local">Email & Password</option>
              </select>
            </div>
          </div>

          {/* Pending Queue List */}
          {loading ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-slate2-200 bg-white p-16 text-center shadow-sm">
              <Loader2 size={32} className="animate-spin text-brand mb-3" />
              <p className="text-sm font-semibold text-slate2-800">Loading pending approval queue...</p>
              <p className="text-xs text-slate2-400 mt-1">Retrieving unapproved accounts from database</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-slate2-200 bg-white p-16 text-center shadow-sm">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 mb-4 shadow-sm">
                <CheckCircle2 size={32} />
              </div>
              <h3 className="text-lg font-bold text-slate2-900">
                {pendingUsers.length === 0 ? "All Registrations Verified" : "No Matches Found"}
              </h3>
              <p className="mt-1 text-xs text-slate2-500 max-w-md">
                {pendingUsers.length === 0
                  ? "There are currently no new users awaiting administrative approval or role assignment. Newly registered Google and corporate users will automatically appear in this queue."
                  : "No pending registrations match your active search or department filter criteria."}
              </p>
              {pendingUsers.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setDeptFilter("ALL");
                    setMethodFilter("ALL");
                  }}
                  className="mt-4 text-xs font-semibold text-brand hover:underline cursor-pointer"
                >
                  Clear search filters
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate2-500 px-1">
                <span>
                  Showing <strong>{filteredUsers.length}</strong> of <strong>{pendingUsers.length}</strong> pending user registration(s)
                </span>
                <span className="flex items-center gap-1.5 text-amber-700">
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                  Requires Role Assignment
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {filteredUsers.map((pUser) => {
                  const assignment = assignments[pUser.id] || { roleId: "", departmentId: "" };
                  const selectedRole = roles.find((r) => r.id === assignment.roleId);
                  const isGoogleUser = Boolean(pUser.googleId);
                  const isApproving = approvingUserId === pUser.id;

                  return (
                    <div
                      key={pUser.id}
                      className="group rounded-2xl border border-slate2-200/90 bg-white shadow-sm transition-all hover:border-brand/40 hover:shadow-md overflow-hidden"
                    >
                      {/* TOP TIER: User Identity & Registration Details */}
                      <div className="p-5 sm:p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate2-100 bg-gradient-to-r from-slate2-50/60 to-white">
                        <div className="flex items-start sm:items-center gap-4 min-w-0">
                          {/* Avatar with OAuth Badge */}
                          <div className="relative shrink-0">
                            {pUser.avatarUrl ? (
                              <img
                                src={pUser.avatarUrl}
                                alt={pUser.name}
                                className="h-13 w-13 rounded-2xl object-cover border border-slate2-200 shadow-sm"
                              />
                            ) : (
                              <div
                                className="flex h-13 w-13 items-center justify-center rounded-2xl text-base font-bold text-white shadow-sm"
                                style={{ backgroundColor: pUser.avatarColor || "#0B7A6B" }}
                              >
                                {pUser.name
                                  .split(" ")
                                  .map((n) => n[0])
                                  .slice(0, 2)
                                  .join("")
                                  .toUpperCase()}
                              </div>
                            )}
                            {isGoogleUser && (
                              <span
                                className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-md border border-slate2-200"
                                title="Registered via Google OAuth"
                              >
                                <GoogleIcon className="w-3.5 h-3.5" />
                              </span>
                            )}
                          </div>

                          {/* Name, Email, Meta */}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2.5">
                              <h3 className="text-base font-bold text-slate2-900 tracking-tight">
                                {pUser.name}
                              </h3>
                              {isGoogleUser ? (
                                <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 border border-blue-200/80 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                                  <GoogleIcon className="w-3 h-3" />
                                  Google Account
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-md bg-slate2-100 border border-slate2-200 px-2 py-0.5 text-[11px] font-semibold text-slate2-700">
                                  <Mail size={11} />
                                  Email Sign-up
                                </span>
                              )}
                              <span className="inline-flex items-center gap-1 rounded-md bg-slate2-100 border border-slate2-200 px-2 py-0.5 text-[11px] font-mono text-slate2-600">
                                Role: Unassigned
                              </span>
                            </div>

                            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate2-500">
                              <span className="flex items-center gap-1.5 font-medium text-slate2-700">
                                <Mail size={13} className="text-slate2-400 shrink-0" />
                                {pUser.email}
                              </span>

                              {pUser.jobTitle && (
                                <span className="flex items-center gap-1.5 text-slate2-600">
                                  <Briefcase size={13} className="text-slate2-400 shrink-0" />
                                  {pUser.jobTitle}
                                </span>
                              )}

                              <span className="flex items-center gap-1.5 text-slate2-400">
                                <Calendar size={13} className="shrink-0" />
                                Registered {pUser.createdAt ? new Date(pUser.createdAt).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                }) : "Recently"}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Status Flag */}
                        <div className="flex items-center gap-2 shrink-0 self-start md:self-center">
                          <span className="inline-flex items-center gap-1.5 rounded-xl bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-900 shadow-xs">
                            <Clock size={13} className="text-amber-600" />
                            <span>Pending Role Assignment</span>
                          </span>
                        </div>
                      </div>

                      {/* BOTTOM TIER: Operational Assignment Deck */}
                      <div className="p-5 sm:p-6 bg-white">
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                          {/* Role Picker (5 columns) */}
                          <div className="md:col-span-5 space-y-1.5">
                            <label className="text-xs font-bold text-slate2-700 flex items-center justify-between">
                              <span className="flex items-center gap-1.5">
                                <ShieldCheck size={14} className="text-brand" />
                                <span>Select Role <span className="text-rose-500">*</span></span>
                              </span>
                              {selectedRole && (
                                <span className="text-[11px] font-semibold text-brand">
                                  {selectedRole.permissions.length} permissions
                                </span>
                              )}
                            </label>
                            <select
                              value={assignment.roleId}
                              onChange={(e) => handleRoleChange(pUser.id, e.target.value)}
                              disabled={isApproving || actionLoading}
                              className={`focus-ring w-full rounded-xl border px-3.5 py-2.5 text-xs font-semibold text-slate2-800 shadow-sm cursor-pointer transition-all ${
                                !assignment.roleId
                                  ? "border-amber-300 bg-amber-50/25 hover:border-amber-400 focus:border-brand"
                                  : "border-slate2-200 bg-white hover:border-slate2-300 focus:border-brand"
                              }`}
                            >
                              <option value="">Select Role</option>
                              {roles.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {getRoleDisplayLabel(r)}
                                </option>
                              ))}
                            </select>
                            {selectedRole?.description ? (
                              <p className="text-[11px] text-slate2-500 line-clamp-1 italic">
                                {selectedRole.description}
                              </p>
                            ) : (
                              <p className="text-[11px] text-slate2-400">
                                Determines dashboard access permissions and meeting authorizations.
                              </p>
                            )}
                          </div>

                          {/* Department Picker (4 columns) */}
                          <div className="md:col-span-4 space-y-1.5">
                            <label className="text-xs font-bold text-slate2-700 flex items-center gap-1.5">
                              <Building2 size={14} className="text-slate2-400" />
                              <span>Department</span>
                            </label>
                            <select
                              value={assignment.departmentId}
                              onChange={(e) => handleDepartmentChange(pUser.id, e.target.value)}
                              disabled={isApproving || actionLoading}
                              className="focus-ring w-full rounded-xl border border-slate2-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate2-800 shadow-sm cursor-pointer hover:border-slate2-300 focus:border-brand transition-all"
                            >
                              <option value="">Unassigned Department</option>
                              {departments.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name} ({d.code})
                                </option>
                              ))}
                            </select>
                            <p className="text-[11px] text-slate2-400">
                              Links user to department meetings and actions.
                            </p>
                          </div>

                          {/* Actions (3 columns) */}
                          <div className="md:col-span-3 flex items-center gap-2 pt-1 md:pt-0">
                            <button
                              type="button"
                              onClick={() => handleConfirmApproval(pUser)}
                              disabled={!assignment.roleId || isApproving || actionLoading}
                              className="focus-ring flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-brand-dark cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                              title="Approve registration and immediately activate account"
                            >
                              {isApproving ? (
                                <>
                                  <Loader2 size={14} className="animate-spin" />
                                  <span>Activating...</span>
                                </>
                              ) : (
                                <>
                                  <Check size={14} strokeWidth={2.5} />
                                  <span>Approve & Activate</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => openRejectDialog(pUser)}
                              disabled={isApproving || actionLoading}
                              className="focus-ring inline-flex items-center justify-center rounded-xl border border-slate2-200 bg-white p-2.5 text-xs font-semibold text-rose-600 shadow-sm hover:bg-rose-50 hover:border-rose-200 cursor-pointer disabled:opacity-40 transition-colors"
                              title="Decline registration"
                            >
                              <UserX size={15} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECOND TAB: SYSTEM AUDIT & NOTIFICATIONS */}
      {activeTab === "audit" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate2-200/80 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate2-100 pb-4 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate2-900">
                  Registration Notifications & Audit Archive
                </h3>
                <p className="text-xs text-slate2-500 mt-0.5">
                  Historical audit triggers from the <code>admin_notifications</code> table. Approved registrations are safely archived.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {adminNotifications.some((n) => n.isRead) && (
                  <button
                    type="button"
                    onClick={handleClearProcessedAudit}
                    disabled={clearingAudit}
                    className="focus-ring inline-flex items-center gap-1.5 rounded-xl border border-slate2-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:border-rose-200 cursor-pointer disabled:opacity-50 transition-colors"
                    title="Purge processed records from audit log"
                  >
                    <Trash2 size={13} />
                    <span>{clearingAudit ? "Clearing..." : "Clear Processed Archive"}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => loadData(true)}
                  disabled={refreshing}
                  className="focus-ring inline-flex items-center gap-1.5 rounded-xl border border-slate2-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate2-700 hover:bg-slate2-50 cursor-pointer"
                >
                  <RefreshCw size={13} className={refreshing ? "animate-spin text-brand" : "text-slate2-400"} />
                  <span>Refresh Log</span>
                </button>
              </div>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-2 mb-4 pb-1 overflow-x-auto">
              <button
                type="button"
                onClick={() => setAuditFilter("ALL")}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  auditFilter === "ALL"
                    ? "bg-brand text-white shadow-xs"
                    : "bg-slate2-100 text-slate2-600 hover:bg-slate2-200"
                }`}
              >
                All Events ({adminNotifications.length})
              </button>
              <button
                type="button"
                onClick={() => setAuditFilter("PENDING")}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  auditFilter === "PENDING"
                    ? "bg-amber-600 text-white shadow-xs"
                    : "bg-slate2-100 text-slate2-600 hover:bg-slate2-200"
                }`}
              >
                Pending Action ({unreadAdminNotifsCount})
              </button>
              <button
                type="button"
                onClick={() => setAuditFilter("PROCESSED")}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  auditFilter === "PROCESSED"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "bg-slate2-100 text-slate2-600 hover:bg-slate2-200"
                }`}
              >
                Resolved Archive ({adminNotifications.length - unreadAdminNotifsCount})
              </button>
            </div>

            {filteredAdminNotifications.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate2-400">
                <Info size={28} className="mx-auto mb-2 text-slate2-300" />
                <p className="font-semibold text-slate2-600">No notifications match this filter</p>
                <p className="mt-1 text-slate2-400">All registered notifications in this category have been processed or cleared.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate2-100">
                {filteredAdminNotifications.map((notif) => (
                  <div key={notif.id} className="group/item py-3.5 flex items-start gap-3.5 text-xs hover:bg-slate2-50/50 px-2 rounded-xl transition-colors">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl mt-0.5 shadow-xs ${
                      notif.isRead
                        ? "bg-emerald-50 text-emerald-600 border border-emerald-200/60"
                        : "bg-amber-50 text-amber-600 border border-amber-200/60"
                    }`}>
                      {notif.isRead ? <CheckCircle2 size={16} /> : <Clock size={16} />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-slate2-900">{notif.title}</p>
                        <span className="rounded bg-slate2-100 px-1.5 py-0.5 text-[10px] font-mono text-slate2-600">
                          {notif.type}
                        </span>
                        {notif.isRead ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                            <Check size={11} strokeWidth={2.5} /> Resolved & Role Assigned
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 border border-amber-300 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                            <Clock size={11} /> Pending Action
                          </span>
                        )}
                      </div>

                      <p className="text-slate2-600 mt-1 leading-relaxed">{notif.message}</p>

                      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-slate2-400">
                        <span>
                          Recorded at {new Date(notif.createdAt).toLocaleString()}
                        </span>
                        {notif.isRead && (
                          <span className="text-emerald-600 font-medium">
                            • Account is Active in Portal
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 opacity-0 group-hover/item:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => handleDeleteAuditRecord(notif.id)}
                        className="p-1.5 text-slate2-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Delete audit entry"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Decline Confirmation Modal */}
      <Modal
        open={rejectModalOpen}
        onClose={() => !actionLoading && setRejectModalOpen(false)}
        title="Decline User Registration"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl bg-rose-50 border border-rose-200/80 p-3.5 text-xs text-rose-800">
            <AlertCircle size={18} className="shrink-0 text-rose-600 mt-0.5" />
            <div>
              <p className="font-bold text-rose-950">Confirm Deactivation of Pending Account</p>
              <p className="mt-1 text-rose-800/90 leading-relaxed">
                You are about to decline registration for <strong>{userToReject?.name}</strong> ({userToReject?.email}). Their account status will be set to Deactivated and they will not be allowed portal access.
              </p>
            </div>
          </div>

          <Field label="Decline Reason / Note (Optional)">
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Unrecognized email domain or unauthorized registration request."
              rows={3}
              className={inputClass}
            />
          </Field>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate2-100">
            <button
              type="button"
              onClick={() => setRejectModalOpen(false)}
              disabled={actionLoading}
              className="px-4 py-2 text-xs font-semibold text-slate2-600 hover:text-slate2-900 cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <Button
              type="button"
              variant="danger"
              disabled={actionLoading}
              onClick={handleConfirmReject}
            >
              {actionLoading && <Loader2 size={14} className="animate-spin" />}
              Confirm Decline
            </Button>
          </div>
        </div>
      </Modal>

      {/* Toast Notification */}
      <Toast
        message={toast?.message || null}
        type={toast?.type}
        onClose={() => setToast(null)}
      />
    </div>
  );
}
