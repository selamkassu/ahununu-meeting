import React, { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  Shield,
  UserCheck,
  UserX,
  AlertTriangle,
  Eye,
  Edit2,
  Phone,
  Mail,
  Building2,
  Briefcase,
  RefreshCw,
  X,
  ChevronRight,
  CheckCircle2,
  Lock,
  FileText,
  PauseCircle,
  PlayCircle,
  Sparkles,
} from "lucide-react";
import { api, ApiError } from "../../api/client";
import type { Department, User, UserStatus, RoleListItem } from "../../types";
import { USER_STATUS_LABELS, PERMISSION_LABELS } from "../../types";
import { Card, CardHeader, Button, Field, inputClass, Avatar, EmptyState } from "../../components/ui/Primitives";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { useAuth } from "../../context/AuthContext";

function resolveUserStatus(user: User): UserStatus {
  if (user.status) return user.status;
  return user.isActive ? "ACTIVE" : "SUSPENDED";
}

function getStatusConfig(status: UserStatus) {
  switch (status) {
    case "ACTIVE":
      return {
        tone: "success" as const,
        label: "Active",
        bgBadge: "bg-emerald-50 text-emerald-700 border border-emerald-200/60",
        dot: "bg-emerald-500",
        description: "User can access and use the system normally.",
      };
    case "SUSPENDED":
      return {
        tone: "warning" as const,
        label: "Suspended",
        bgBadge: "bg-amber-50 text-amber-700 border border-amber-200/60",
        dot: "bg-amber-500",
        description: "User is temporarily blocked from accessing the system.",
      };
    case "DEACTIVATED":
      return {
        tone: "danger" as const,
        label: "Deactivated",
        bgBadge: "bg-rose-50 text-rose-700 border border-rose-200/60",
        dot: "bg-rose-500",
        description: "User account is disabled.",
      };
  }
}

export default function UsersPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("users:create");
  const canEdit = hasPermission("users:edit");
  const canManageStatus = hasPermission("users:manage_status");

  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roles, setRoles] = useState<RoleListItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDept, setSelectedDept] = useState<string>("ALL");
  const [selectedRole, setSelectedRole] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");

  // Modals & Drawers
  const [createOpen, setCreateOpen] = useState(false);
  const [viewUser, setViewUser] = useState<User | null>(null);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [lifecycleConfirm, setLifecycleConfirm] = useState<{
    user: User;
    targetStatus: UserStatus;
  } | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .get<User[]>("/users")
      .then(setUsers)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    api.get<Department[]>("/departments").then(setDepartments);
    api.get<RoleListItem[]>("/roles").then(setRoles);
    load();
  }, []);

  // Compute metrics
  const stats = useMemo(() => {
    let active = 0;
    let suspended = 0;
    let deactivated = 0;
    users.forEach((u) => {
      const st = resolveUserStatus(u);
      if (st === "ACTIVE") active++;
      else if (st === "SUSPENDED") suspended++;
      else if (st === "DEACTIVATED") deactivated++;
    });
    return { total: users.length, active, suspended, deactivated };
  }, [users]);

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const status = resolveUserStatus(u);
      if (selectedStatus !== "ALL" && status !== selectedStatus) return false;
      if (selectedRole !== "ALL" && u.roleId !== selectedRole) return false;
      if (selectedDept !== "ALL" && u.departmentId !== selectedDept) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = u.name.toLowerCase().includes(q);
        const matchesEmail = u.email?.toLowerCase().includes(q);
        const matchesPhone = u.phone?.toLowerCase().includes(q);
        const matchesTitle = u.jobTitle?.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesPhone && !matchesTitle) return false;
      }
      return true;
    });
  }, [users, selectedStatus, selectedRole, selectedDept, searchQuery]);

  const handleUpdateStatus = async (user: User, targetStatus: UserStatus) => {
    setStatusUpdating(true);
    try {
      await api.patch(`/users/${user.id}/status`, { status: targetStatus });
      setLifecycleConfirm(null);
      if (viewUser?.id === user.id) {
        setViewUser((prev) => (prev ? { ...prev, status: targetStatus, isActive: targetStatus === "ACTIVE" } : null));
      }
      load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to update user status");
    } finally {
      setStatusUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & KPI Summary */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate2-900">User Management</h1>
          <p className="mt-1 text-sm text-slate2-500">
            Enterprise user structure, department affiliations, role-based permissions, and complete account lifecycle.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)} className="shadow-sm">
            <Plus size={16} /> Add User
          </Button>
        )}
      </div>

      {/* Operational Stats Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button
          onClick={() => setSelectedStatus("ALL")}
          className={`flex flex-col rounded-xl border p-4 text-left transition-all ${
            selectedStatus === "ALL"
              ? "border-brand bg-brand/5 ring-2 ring-brand/20"
              : "border-slate2-200 bg-white hover:border-slate2-300"
          }`}
        >
          <span className="text-xs font-medium uppercase tracking-wider text-slate2-400">Total Users</span>
          <span className="mt-2 text-2xl font-bold text-slate2-800">{stats.total}</span>
          <span className="mt-1 text-[11px] text-slate2-500">All registered system accounts</span>
        </button>

        <button
          onClick={() => setSelectedStatus(selectedStatus === "ACTIVE" ? "ALL" : "ACTIVE")}
          className={`flex flex-col rounded-xl border p-4 text-left transition-all ${
            selectedStatus === "ACTIVE"
              ? "border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-500/20"
              : "border-slate2-200 bg-white hover:border-slate2-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-emerald-700">Active</span>
            <span className="h-2 w-2 rounded-full bg-emerald-500 ring-4 ring-emerald-100" />
          </div>
          <span className="mt-2 text-2xl font-bold text-emerald-800">{stats.active}</span>
          <span className="mt-1 text-[11px] text-emerald-600">Full system access enabled</span>
        </button>

        <button
          onClick={() => setSelectedStatus(selectedStatus === "SUSPENDED" ? "ALL" : "SUSPENDED")}
          className={`flex flex-col rounded-xl border p-4 text-left transition-all ${
            selectedStatus === "SUSPENDED"
              ? "border-amber-500 bg-amber-50/60 ring-2 ring-amber-500/20"
              : "border-slate2-200 bg-white hover:border-slate2-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-amber-700">Suspended</span>
            <span className="h-2 w-2 rounded-full bg-amber-500 ring-4 ring-amber-100" />
          </div>
          <span className="mt-2 text-2xl font-bold text-amber-800">{stats.suspended}</span>
          <span className="mt-1 text-[11px] text-amber-600">Temporarily blocked accounts</span>
        </button>

        <button
          onClick={() => setSelectedStatus(selectedStatus === "DEACTIVATED" ? "ALL" : "DEACTIVATED")}
          className={`flex flex-col rounded-xl border p-4 text-left transition-all ${
            selectedStatus === "DEACTIVATED"
              ? "border-rose-500 bg-rose-50/60 ring-2 ring-rose-500/20"
              : "border-slate2-200 bg-white hover:border-slate2-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-rose-700">Deactivated</span>
            <span className="h-2 w-2 rounded-full bg-rose-500 ring-4 ring-rose-100" />
          </div>
          <span className="mt-2 text-2xl font-bold text-rose-800">{stats.deactivated}</span>
          <span className="mt-1 text-[11px] text-rose-600">Disabled accounts</span>
        </button>
      </div>

      {/* Main Operational Card */}
      <Card>
        {/* Search and Filters Bar */}
        <div className="border-b border-slate2-100 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Search */}
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate2-400" />
              <input
                type="text"
                placeholder="Search by name, email, phone, or title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`${inputClass} pl-10`}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate2-400 hover:text-slate2-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Department Filter */}
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="h-10 rounded-lg border border-slate2-200 bg-white px-3 py-1.5 text-xs font-medium text-slate2-700 shadow-sm focus:border-brand"
              >
                <option value="ALL">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.code})
                  </option>
                ))}
              </select>

              {/* Role Filter — now dynamic */}
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="h-10 rounded-lg border border-slate2-200 bg-white px-3 py-1.5 text-xs font-medium text-slate2-700 shadow-sm focus:border-brand"
              >
                <option value="ALL">All Roles</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="h-10 rounded-lg border border-slate2-200 bg-white px-3 py-1.5 text-xs font-medium text-slate2-700 shadow-sm focus:border-brand"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="DEACTIVATED">Deactivated</option>
              </select>

              <Button variant="secondary" onClick={load} title="Refresh list" className="h-10 px-3">
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              </Button>
            </div>
          </div>
        </div>

        {/* Users Table */}
        {loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-slate2-100" />
            ))}
          </div>
        ) : filteredUsers.length === 0 ? (
          <EmptyState
            title="No users match your filters"
            description="Try changing your search keywords or filter criteria."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedDept("ALL");
                  setSelectedRole("ALL");
                  setSelectedStatus("ALL");
                }}
              >
                Reset filters
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate2-100 bg-slate2-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate2-500">
                  <th className="px-5 py-3.5">Name</th>
                  <th className="px-5 py-3.5">Role</th>
                  <th className="px-5 py-3.5">Department</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate2-100">
                {filteredUsers.map((u) => {
                  const status = resolveUserStatus(u);
                  const stConfig = getStatusConfig(status);

                  return (
                    <tr
                      key={u.id}
                      className="group transition-colors hover:bg-slate2-50/60"
                    >
                      {/* Name Column */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <Avatar name={u.name} color={u.avatarColor} />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-slate2-800">{u.name}</span>
                              {u.jobTitle && (
                                <span className="rounded bg-slate2-100 px-1.5 py-0.5 text-[11px] font-medium text-slate2-600">
                                  {u.jobTitle}
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-slate2-400">
                              <span className="flex items-center gap-1">
                                <Mail size={12} className="shrink-0" />
                                {u.email}
                              </span>
                              {u.phone && (
                                <span className="flex items-center gap-1 text-slate2-500">
                                  <Phone size={12} className="shrink-0" />
                                  {u.phone}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role Column */}
                      <td className="px-5 py-3.5">
                        <div className="flex flex-col items-start gap-1">
                          <Badge tone="brand">{u.role?.name || "Unknown"}</Badge>
                          <span className="text-[11px] text-slate2-400">
                            {u.role?.permissions?.length || 0} permissions
                          </span>
                        </div>
                      </td>

                      {/* Department Column */}
                      <td className="px-5 py-3.5">
                        {u.department ? (
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate2-700">{u.department.name}</span>
                            <span className="rounded bg-slate2-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate2-600">
                              {u.department.code}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate2-400">—</span>
                        )}
                      </td>

                      {/* Status Column */}
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${stConfig.bgBadge}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${stConfig.dot}`} />
                          {stConfig.label}
                        </span>
                      </td>

                      {/* Actions Column */}
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setViewUser(u)}
                            className="rounded-lg p-1.5 text-slate2-400 hover:bg-slate2-100 hover:text-slate2-700"
                            title="View full user profile & permissions"
                          >
                            <Eye size={15} />
                          </button>

                          {canEdit && (
                            <button
                              onClick={() => setEditUser(u)}
                              className="rounded-lg p-1.5 text-slate2-400 hover:bg-slate2-100 hover:text-slate2-700"
                              title="Edit user details"
                            >
                              <Edit2 size={15} />
                            </button>
                          )}

                          {canManageStatus && (
                            <>
                              {status === "ACTIVE" ? (
                                <button
                                  onClick={() => setLifecycleConfirm({ user: u, targetStatus: "SUSPENDED" })}
                                  className="rounded-lg p-1.5 text-amber-600 hover:bg-amber-50"
                                  title="Suspend user access"
                                >
                                  <PauseCircle size={15} />
                                </button>
                              ) : (
                                <button
                                  onClick={() => setLifecycleConfirm({ user: u, targetStatus: "ACTIVE" })}
                                  className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50"
                                  title="Reactivate user"
                                >
                                  <PlayCircle size={15} />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Role Structure Quick Reference — now dynamic */}
      <Card className="p-5">
        <div className="flex items-center justify-between border-b border-slate2-100 pb-3">
          <div>
            <h4 className="font-display text-xs font-semibold uppercase tracking-wider text-slate2-500">
              Role & Permission Architecture
            </h4>
            <p className="mt-0.5 text-xs text-slate2-400">
              Dynamic roles with fine-grained permissions from the system catalog
            </p>
          </div>
          <span className="rounded-full bg-brand/10 px-2.5 py-1 text-[11px] font-medium text-brand">
            {roles.length} Roles
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {roles.map((r) => (
            <div key={r.id} className="flex flex-col rounded-xl border border-slate2-100 bg-slate2-50/60 p-3.5">
              <div className="flex items-center gap-2">
                <Shield size={14} className="text-brand" />
                <p className="text-xs font-bold text-slate2-800">{r.name}</p>
              </div>
              <p className="mt-1 text-[11px] text-slate2-500">
                {r.permissions.length} permissions · {r.userCount} user{r.userCount !== 1 ? "s" : ""}
              </p>
              {r.description && (
                <p className="mt-1.5 text-[10px] text-slate2-400 line-clamp-2">{r.description}</p>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Add User Modal */}
      {createOpen && (
        <UserCreateModal
          departments={departments}
          roles={roles}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            load();
          }}
        />
      )}

      {/* Edit User Modal */}
      {editUser && (
        <UserEditModal
          user={editUser}
          departments={departments}
          roles={roles}
          onClose={() => setEditUser(null)}
          onUpdated={() => {
            setEditUser(null);
            load();
          }}
        />
      )}

      {/* View User Details Drawer/Modal */}
      {viewUser && (
        <UserDetailModal
          user={viewUser}
          canEdit={canEdit}
          canManageStatus={canManageStatus}
          onClose={() => setViewUser(null)}
          onEdit={() => {
            setEditUser(viewUser);
            setViewUser(null);
          }}
          onStatusChange={(targetStatus) => handleUpdateStatus(viewUser, targetStatus)}
        />
      )}

      {/* Lifecycle Status Confirmation Dialog */}
      {lifecycleConfirm && (
        <Modal
          open
          onClose={() => setLifecycleConfirm(null)}
          title={`Confirm User ${
            lifecycleConfirm.targetStatus === "ACTIVE"
              ? "Reactivation"
              : lifecycleConfirm.targetStatus === "SUSPENDED"
              ? "Suspension"
              : "Deactivation"
          }`}
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg bg-slate2-50 p-3.5">
              {lifecycleConfirm.targetStatus === "ACTIVE" ? (
                <PlayCircle className="shrink-0 text-emerald-600" size={24} />
              ) : lifecycleConfirm.targetStatus === "SUSPENDED" ? (
                <PauseCircle className="shrink-0 text-amber-600" size={24} />
              ) : (
                <AlertTriangle className="shrink-0 text-rose-600" size={24} />
              )}
              <div className="text-xs">
                <p className="font-semibold text-slate2-800">
                  {lifecycleConfirm.targetStatus === "ACTIVE"
                    ? `Reactivate account for ${lifecycleConfirm.user.name}?`
                    : lifecycleConfirm.targetStatus === "SUSPENDED"
                    ? `Suspend account for ${lifecycleConfirm.user.name}?`
                    : `Deactivate account for ${lifecycleConfirm.user.name}?`}
                </p>
                <p className="mt-1 text-slate2-500">
                  {lifecycleConfirm.targetStatus === "ACTIVE" &&
                    "This user will immediately regain portal access based on their assigned role and permissions."}
                  {lifecycleConfirm.targetStatus === "SUSPENDED" &&
                    "This user will be temporarily blocked from signing into the portal. Their records, meetings, and actions remain preserved."}
                  {lifecycleConfirm.targetStatus === "DEACTIVATED" &&
                    "This user account will be permanently disabled from login. You can reactivate them later if required."}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate2-100 pt-3">
              <Button variant="secondary" onClick={() => setLifecycleConfirm(null)} disabled={statusUpdating}>
                Cancel
              </Button>
              <Button
                variant={
                  lifecycleConfirm.targetStatus === "ACTIVE"
                    ? "primary"
                    : lifecycleConfirm.targetStatus === "SUSPENDED"
                    ? "primary"
                    : "danger"
                }
                onClick={() => handleUpdateStatus(lifecycleConfirm.user, lifecycleConfirm.targetStatus)}
                disabled={statusUpdating}
              >
                {statusUpdating
                  ? "Updating..."
                  : lifecycleConfirm.targetStatus === "ACTIVE"
                  ? "Reactivate User"
                  : lifecycleConfirm.targetStatus === "SUSPENDED"
                  ? "Suspend User"
                  : "Deactivate User"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// =========================================================================
// ADD USER MODAL
// =========================================================================
function UserCreateModal({
  departments: initialDepartments = [],
  roles: initialRoles = [],
  onClose,
  onCreated,
}: {
  departments: Department[];
  roles: RoleListItem[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  const [departments, setDepartments] = useState<Department[]>(initialDepartments);
  const [roles, setRoles] = useState<RoleListItem[]>(initialRoles);
  const [loadingDepts, setLoadingDepts] = useState(initialDepartments.length === 0);
  const [loadingRoles, setLoadingRoles] = useState(initialRoles.length === 0);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("Ahununu@123");
  const [jobTitle, setJobTitle] = useState("");
  const [departmentId, setDepartmentId] = useState(initialDepartments[0]?.id || "");
  const [roleId, setRoleId] = useState(
    initialRoles.find((r) => r.code === "PARTICIPANT")?.id || initialRoles[0]?.id || ""
  );
  const [responsibilities, setResponsibilities] = useState("");
  const [status, setStatus] = useState<UserStatus>("ACTIVE");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchDepartments = () => {
    setLoadingDepts(true);
    api
      .get<Department[]>("/departments")
      .then((res) => {
        setDepartments(res);
        setDepartmentId((prev) => prev || res[0]?.id || "");
      })
      .catch((err) => console.error("Failed to load departments", err))
      .finally(() => setLoadingDepts(false));
  };

  const fetchRoles = () => {
    setLoadingRoles(true);
    api
      .get<RoleListItem[]>("/roles")
      .then((res) => {
        setRoles(res);
        setRoleId(
          (prev) => prev || res.find((r) => r.code === "PARTICIPANT")?.id || res[0]?.id || ""
        );
      })
      .catch((err) => console.error("Failed to load roles", err))
      .finally(() => setLoadingRoles(false));
  };

  // Self-fetch departments if not provided or updated
  useEffect(() => {
    if (initialDepartments.length > 0) {
      setDepartments(initialDepartments);
      setDepartmentId((prev) => prev || initialDepartments[0].id);
      setLoadingDepts(false);
    } else {
      fetchDepartments();
    }
  }, [initialDepartments]);

  // Self-fetch roles if not provided or updated
  useEffect(() => {
    if (initialRoles.length > 0) {
      setRoles(initialRoles);
      setRoleId(
        (prev) => prev || initialRoles.find((r) => r.code === "PARTICIPANT")?.id || initialRoles[0]?.id || ""
      );
      setLoadingRoles(false);
    } else {
      fetchRoles();
    }
  }, [initialRoles]);

  const selectedRole = roles.find((r) => r.id === roleId);

  const submit = async () => {
    setError(null);
    if (!name.trim() || !email.trim()) {
      setError("Please provide a valid full name and email.");
      setStep(1);
      return;
    }
    if (!departmentId) {
      setError("Please select a department.");
      setStep(2);
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/users", {
        name,
        email,
        phone: phone.trim() || null,
        password,
        roleId,
        departmentId,
        jobTitle: jobTitle.trim() || null,
        status,
        responsibilities: responsibilities.trim() || null,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the user.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Add New User" wide>
      <div className="space-y-5">
        {/* Step Indicator */}
        <div className="grid grid-cols-4 gap-1 border-b border-slate2-100 pb-3 text-center">
          {[
            { s: 1, label: "Information" },
            { s: 2, label: "Department" },
            { s: 3, label: "Role" },
            { s: 4, label: "Status" },
          ].map((item) => (
            <button
              key={item.s}
              type="button"
              onClick={() => setStep(item.s as any)}
              className={`flex flex-col items-center rounded-lg p-1.5 text-xs transition-colors ${
                step === item.s
                  ? "bg-brand/10 font-bold text-brand"
                  : step > item.s
                  ? "font-medium text-slate2-700 hover:bg-slate2-50"
                  : "text-slate2-400 hover:text-slate2-600"
              }`}
            >
              <span
                className={`mb-1 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                  step === item.s
                    ? "bg-brand text-white"
                    : step > item.s
                    ? "bg-emerald-500 text-white"
                    : "bg-slate2-200 text-slate2-600"
                }`}
              >
                {step > item.s ? "✓" : item.s}
              </span>
              <span className="hidden sm:inline">{item.label}</span>
            </button>
          ))}
        </div>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-danger">{error}</p>}

        {/* STEP 1: USER INFORMATION */}
        {step === 1 && (
          <div className="space-y-4 animate-in fade-in">
            <div className="rounded-lg border border-slate2-100 bg-slate2-50/50 p-3">
              <h4 className="text-xs font-semibold text-slate2-700">1. User Information</h4>
              <p className="text-[11px] text-slate2-500">
                Personal contact details and initial credentials for the user account.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Full Name" required>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                  placeholder="e.g. Almaz Kebede"
                  autoFocus
                />
              </Field>
              <Field label="Work Email" required>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="name@ahununulogistics.com"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Phone Number" hint="e.g. +251 91 234 5678">
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputClass}
                  placeholder="+251 9..."
                />
              </Field>
              <Field label="Job Title" hint="e.g. Fleet Coordinator">
                <input
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  className={inputClass}
                  placeholder="e.g. Fleet Coordinator"
                />
              </Field>
            </div>

            <Field label="Temporary Password" required hint="Must be at least 6 characters">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                placeholder="Temporary login password"
              />
            </Field>

            <div className="flex justify-end pt-2">
              <Button
                type="button"
                onClick={() => {
                  if (!name.trim() || !email.trim()) {
                    setError("Please enter Full Name and Work Email before continuing.");
                    return;
                  }
                  setError(null);
                  setStep(2);
                }}
              >
                Next: Select Department <ChevronRight size={15} />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: SELECT DEPARTMENT */}
        {step === 2 && (
          <div className="space-y-4 animate-in fade-in">
            <div className="rounded-lg border border-slate2-100 bg-slate2-50/50 p-3">
              <h4 className="text-xs font-semibold text-slate2-700">2. Select Department</h4>
              <p className="text-[11px] text-slate2-500">
                Assign the user to an operational department at Ahununu Logistics.
              </p>
            </div>

            {/* DIRECT DEPARTMENT INPUT DROPDOWN */}
            <Field
              label="Department Input"
              required
              hint="Select from the department list or click a department card below"
            >
              <div className="flex gap-2">
                <select
                  value={departmentId}
                  onChange={(e) => {
                    setDepartmentId(e.target.value);
                    setError(null);
                  }}
                  className={`${inputClass} flex-1`}
                  disabled={loadingDepts}
                >
                  <option value="">-- Choose / Input Department --</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code})
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="secondary"
                  className="px-2.5 py-1.5 text-xs"
                  onClick={fetchDepartments}
                  title="Reload Departments"
                  disabled={loadingDepts}
                >
                  <RefreshCw size={14} className={loadingDepts ? "animate-spin" : ""} />
                </Button>
              </div>
            </Field>

            {loadingDepts ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate2-200 bg-slate2-50/50 py-8 text-center">
                <RefreshCw size={24} className="animate-spin text-brand" />
                <p className="mt-2 text-xs font-medium text-slate2-600">Loading operational departments...</p>
              </div>
            ) : departments.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-rose-200 bg-rose-50/50 py-6 text-center">
                <AlertTriangle size={24} className="text-amber-500" />
                <p className="mt-1 text-xs font-semibold text-slate2-700">No departments found</p>
                <p className="mt-0.5 text-[11px] text-slate2-500">Could not retrieve the department list from the server.</p>
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-3 px-3 py-1.5 text-xs"
                  onClick={fetchDepartments}
                >
                  <RefreshCw size={12} /> Retry Loading Departments
                </Button>
              </div>
            ) : (
              <div>
                <p className="mb-2 text-[11px] font-medium text-slate2-500">Or quick-select department card:</p>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 max-h-56 overflow-y-auto pr-1">
                  {departments.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => {
                        setDepartmentId(d.id);
                        setError(null);
                      }}
                      className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-all ${
                        departmentId === d.id
                          ? "border-brand bg-brand/5 ring-2 ring-brand/20 shadow-sm"
                          : "border-slate2-200 bg-white hover:border-slate2-300 hover:bg-slate2-50/50"
                      }`}
                    >
                      <Building2 size={18} className={departmentId === d.id ? "text-brand" : "text-slate2-400"} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <p className={`text-xs font-bold truncate ${departmentId === d.id ? "text-brand" : "text-slate2-800"}`}>
                            {d.name}
                          </p>
                          <span className="rounded bg-slate2-100 px-1.5 py-0.5 text-[10px] font-bold text-slate2-600 shrink-0">
                            {d.code}
                          </span>
                        </div>
                        {d.description && (
                          <p className="mt-1 text-[11px] text-slate2-500 line-clamp-1">{d.description}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button type="button" variant="secondary" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button
                type="button"
                onClick={() => {
                  if (!departmentId) {
                    setError("Please select a department before proceeding.");
                    return;
                  }
                  setError(null);
                  setStep(3);
                }}
              >
                Next: Select Role <ChevronRight size={15} />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: SELECT ROLE */}
        {step === 3 && (
          <div className="space-y-4 animate-in fade-in">
            <div className="rounded-lg border border-slate2-100 bg-slate2-50/50 p-3">
              <h4 className="text-xs font-semibold text-slate2-700">3. Select Role</h4>
              <p className="text-[11px] text-slate2-500">
                Choose the role that defines this user's permissions.
              </p>
            </div>

            {/* DIRECT ROLE INPUT DROPDOWN */}
            <Field
              label="Role Input"
              required
              hint="Select from the role list or click a role card below"
            >
              <div className="flex gap-2">
                <select
                  value={roleId}
                  onChange={(e) => {
                    setRoleId(e.target.value);
                    setError(null);
                  }}
                  className={`${inputClass} flex-1`}
                  disabled={loadingRoles}
                >
                  <option value="">-- Choose / Input Role --</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.permissions?.length || 0} permissions)
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="secondary"
                  className="px-2.5 py-1.5 text-xs"
                  onClick={fetchRoles}
                  title="Reload Roles"
                  disabled={loadingRoles}
                >
                  <RefreshCw size={14} className={loadingRoles ? "animate-spin" : ""} />
                </Button>
              </div>
            </Field>

            {loadingRoles ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate2-200 bg-slate2-50/50 py-8 text-center">
                <RefreshCw size={24} className="animate-spin text-brand" />
                <p className="mt-2 text-xs font-medium text-slate2-600">Loading access roles...</p>
              </div>
            ) : roles.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-rose-200 bg-rose-50/50 py-6 text-center">
                <AlertTriangle size={24} className="text-amber-500" />
                <p className="mt-1 text-xs font-semibold text-slate2-700">No roles found</p>
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-3 px-3 py-1.5 text-xs"
                  onClick={fetchRoles}
                >
                  <RefreshCw size={12} /> Retry Loading Roles
                </Button>
              </div>
            ) : (
              <div>
                <p className="mb-2 text-[11px] font-medium text-slate2-500">Or quick-select role card:</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 max-h-56 overflow-y-auto pr-1">
                  {roles.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setRoleId(r.id);
                        setError(null);
                      }}
                      className={`flex flex-col rounded-xl border p-3.5 text-left transition-all ${
                        roleId === r.id
                          ? "border-brand bg-brand/5 ring-2 ring-brand/20 shadow-sm"
                          : "border-slate2-200 bg-white hover:border-slate2-300 hover:bg-slate2-50/50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold ${roleId === r.id ? "text-brand" : "text-slate2-800"}`}>
                          {r.name}
                        </span>
                        {roleId === r.id && <CheckCircle2 size={16} className="text-brand" />}
                      </div>
                      {r.description && (
                        <p className="mt-1 text-[11px] text-slate2-500 line-clamp-2">{r.description}</p>
                      )}
                      <p className="mt-1.5 text-[10px] font-medium text-brand">
                        {r.permissions.length} permissions
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Field
              label="Responsibilities"
              hint="Describe operational responsibilities (e.g. 'Leads weekly Ops sync & fleet action items')"
            >
              <textarea
                rows={2}
                value={responsibilities}
                onChange={(e) => setResponsibilities(e.target.value)}
                className={inputClass}
                placeholder="Operational responsibilities and key assignments..."
              />
            </Field>

            <div className="flex justify-between pt-2">
              <Button type="button" variant="secondary" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button
                type="button"
                onClick={() => {
                  if (!roleId) {
                    setError("Please select a role before proceeding.");
                    return;
                  }
                  setError(null);
                  setStep(4);
                }}
              >
                Next: Set Status & Save <ChevronRight size={15} />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 4: STATUS & SAVE */}
        {step === 4 && (
          <div className="space-y-4 animate-in fade-in">
            <div className="rounded-lg border border-slate2-100 bg-slate2-50/50 p-3">
              <h4 className="text-xs font-semibold text-slate2-700">4. Set User Status & Confirm</h4>
              <p className="text-[11px] text-slate2-500">
                Define the initial account access status for this user.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(["ACTIVE", "SUSPENDED", "DEACTIVATED"] as UserStatus[]).map((st) => {
                const conf = getStatusConfig(st);
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatus(st)}
                    className={`flex flex-col rounded-xl border p-3.5 text-left transition-all ${
                      status === st
                        ? "border-brand bg-brand/5 ring-2 ring-brand/20"
                        : "border-slate2-200 bg-white hover:border-slate2-300"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${conf.dot}`} />
                      <span className="text-xs font-bold text-slate2-800">{conf.label}</span>
                    </div>
                    <p className="mt-1.5 text-[11px] text-slate2-500">{conf.description}</p>
                  </button>
                );
              })}
            </div>

            {/* Summary Box */}
            <div className="rounded-xl border border-slate2-200 bg-white p-4">
              <h5 className="text-xs font-bold uppercase tracking-wider text-slate2-500">Summary Overview</h5>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate2-400">User:</span>
                  <p className="font-semibold text-slate2-800">{name || "—"}</p>
                  <p className="text-slate2-500">{email || "—"}</p>
                  {phone && <p className="text-slate2-500">{phone}</p>}
                </div>
                <div>
                  <span className="text-slate2-400">Assignment:</span>
                  <p className="font-semibold text-slate2-800">
                    {departments.find((d) => d.id === departmentId)?.name || "—"}
                  </p>
                  <p className="text-brand font-medium">{selectedRole?.name || "—"}</p>
                  <p className="text-slate2-500">{selectedRole?.permissions.length || 0} permissions</p>
                </div>
              </div>
            </div>

            <div className="flex justify-between pt-2">
              <Button type="button" variant="secondary" onClick={() => setStep(3)}>
                Back
              </Button>
              <Button type="button" onClick={() => submit()} disabled={submitting}>
                {submitting ? "Saving..." : "Save User"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// =========================================================================
// EDIT USER MODAL
// =========================================================================
function UserEditModal({
  user,
  departments: initialDepartments,
  roles: initialRoles,
  onClose,
  onUpdated,
}: {
  user: User;
  departments: Department[];
  roles: RoleListItem[];
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [departments, setDepartments] = useState<Department[]>(initialDepartments);
  const [roles, setRoles] = useState<RoleListItem[]>(initialRoles);

  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email || "");
  const [phone, setPhone] = useState(user.phone || "");
  const [jobTitle, setJobTitle] = useState(user.jobTitle || "");
  const [departmentId, setDepartmentId] = useState(user.departmentId || initialDepartments[0]?.id || "");
  const [roleId, setRoleId] = useState(user.roleId || initialRoles[0]?.id || "");
  const [status, setStatus] = useState<UserStatus>(resolveUserStatus(user));
  const [responsibilities, setResponsibilities] = useState(user.responsibilities || "");
  const [password, setPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (initialDepartments.length > 0) {
      setDepartments(initialDepartments);
      setDepartmentId((prev) => prev || user.departmentId || initialDepartments[0]?.id || "");
    } else {
      api
        .get<Department[]>("/departments")
        .then((res) => {
          setDepartments(res);
          setDepartmentId((prev) => prev || user.departmentId || res[0]?.id || "");
        })
        .catch((err) => console.error("Failed to load departments in edit modal", err));
    }
  }, [initialDepartments, user.departmentId]);

  useEffect(() => {
    if (initialRoles.length > 0) {
      setRoles(initialRoles);
      setRoleId((prev) => prev || user.roleId || initialRoles[0]?.id || "");
    } else {
      api
        .get<RoleListItem[]>("/roles")
        .then((res) => {
          setRoles(res);
          setRoleId((prev) => prev || user.roleId || res[0]?.id || "");
        })
        .catch((err) => console.error("Failed to load roles in edit modal", err));
    }
  }, [initialRoles, user.roleId]);

  const selectedRole = roles.find((r) => r.id === roleId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.put(`/users/${user.id}`, {
        name,
        email,
        phone: phone.trim() || null,
        jobTitle: jobTitle.trim() || null,
        departmentId,
        roleId,
        status,
        responsibilities: responsibilities.trim() || null,
        password: password.trim() ? password.trim() : undefined,
      });
      onUpdated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't update user.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Edit User: ${user.name}`} wide>
      <form onSubmit={submit} className="space-y-4">
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-danger">{error}</p>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Full Name" required>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Work Email" required>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Phone Number">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} placeholder="+251..." />
          </Field>
          <Field label="Job Title">
            <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className={inputClass} />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Department" required>
            <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className={inputClass}>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Role" required>
            <select value={roleId} onChange={(e) => setRoleId(e.target.value)} className={inputClass}>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status" required>
            <select value={status} onChange={(e) => setStatus(e.target.value as UserStatus)} className={inputClass}>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="DEACTIVATED">Deactivated</option>
            </select>
          </Field>
        </div>

        {/* Role permissions summary */}
        {selectedRole && (
          <div className="rounded-lg border border-slate2-200 bg-slate2-50/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate2-700">
                Role Permissions ({selectedRole.permissions.length})
              </span>
              <Badge tone="brand">{selectedRole.name}</Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {selectedRole.permissions.slice(0, 8).map((p) => (
                <span key={p} className="rounded bg-white border border-slate2-200 px-1.5 py-0.5 text-[10px] text-slate2-600">
                  {PERMISSION_LABELS[p] || p}
                </span>
              ))}
              {selectedRole.permissions.length > 8 && (
                <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">
                  +{selectedRole.permissions.length - 8} more
                </span>
              )}
            </div>
          </div>
        )}

        <Field label="Responsibilities">
          <textarea
            rows={2}
            value={responsibilities}
            onChange={(e) => setResponsibilities(e.target.value)}
            className={inputClass}
            placeholder="Operational scope and responsibilities..."
          />
        </Field>

        <Field label="Reset Password" hint="Leave blank to keep existing password">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            placeholder="Enter new password (optional)"
          />
        </Field>

        <div className="flex justify-end gap-2 border-t border-slate2-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// =========================================================================
// VIEW USER DETAILS MODAL
// =========================================================================
function UserDetailModal({
  user,
  canEdit,
  canManageStatus,
  onClose,
  onEdit,
  onStatusChange,
}: {
  user: User;
  canEdit: boolean;
  canManageStatus: boolean;
  onClose: () => void;
  onEdit: () => void;
  onStatusChange: (status: UserStatus) => void;
}) {
  const status = resolveUserStatus(user);
  const stConfig = getStatusConfig(status);

  return (
    <Modal open onClose={onClose} title="User Profile & Access" wide>
      <div className="space-y-5">
        {/* Header Profile Summary */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-xl bg-slate2-50 p-4">
          <div className="flex items-center gap-3.5">
            <Avatar name={user.name} color={user.avatarColor} />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-base font-bold text-slate2-900">{user.name}</h3>
                {user.jobTitle && (
                  <span className="rounded bg-slate2-200 px-2 py-0.5 text-xs font-semibold text-slate2-700">
                    {user.jobTitle}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate2-500">{user.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge tone="brand">{user.role?.name || "Unknown"}</Badge>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${stConfig.bgBadge}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${stConfig.dot}`} />
              {stConfig.label}
            </span>
          </div>
        </div>

        {/* Structured User Attributes */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* User Information */}
          <div className="rounded-xl border border-slate2-200 p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate2-400">User Information</h4>
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate2-500">Full Name</span>
                <span className="font-medium text-slate2-800">{user.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate2-500">Email</span>
                <span className="font-medium text-slate2-800">{user.email}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate2-500">Phone</span>
                <span className="font-medium text-slate2-800">{user.phone || "Not specified"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate2-500">Status</span>
                <span className="font-medium text-slate2-800">{stConfig.label}</span>
              </div>
            </div>
          </div>

          {/* Department & Role */}
          <div className="rounded-xl border border-slate2-200 p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate2-400">Department & Scope</h4>
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate2-500">Department</span>
                <span className="font-medium text-slate2-800">
                  {user.department?.name || "Unassigned"} ({user.department?.code || "—"})
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate2-500">Role</span>
                <span className="font-medium text-brand">{user.role?.name || "Unknown"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate2-500">Designation</span>
                <span className="font-medium text-slate2-800">{user.jobTitle || "Team Member"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Responsibilities */}
        <div className="rounded-xl border border-slate2-200 p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate2-400">Responsibilities</h4>
          <p className="mt-2 text-xs text-slate2-700 leading-relaxed">
            {user.responsibilities || "No specific operational responsibilities registered."}
          </p>
        </div>

        {/* Assigned Permissions (from role) */}
        <div className="rounded-xl border border-slate2-200 p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate2-400">
              Role Permissions ({user.role?.name || "—"})
            </h4>
            <span className="text-xs font-semibold text-slate2-600">
              {user.role?.permissions?.length || 0} Active
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {user.role?.permissions && user.role.permissions.length > 0 ? (
              user.role.permissions.map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate2-200 bg-slate2-50 px-2.5 py-1 text-xs text-slate2-700 font-medium"
                >
                  <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
                  {PERMISSION_LABELS[p] || p}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate2-400">No permissions assigned to this role.</span>
            )}
          </div>
        </div>

        {/* Lifecycle Actions */}
        {(canEdit || canManageStatus) && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate2-100 pt-4">
            <div className="flex items-center gap-2">
              {canManageStatus && (
                <>
                  {status === "ACTIVE" ? (
                    <>
                      <Button
                        variant="secondary"
                        onClick={() => onStatusChange("SUSPENDED")}
                        className="text-amber-700 hover:bg-amber-50"
                      >
                        <PauseCircle size={15} /> Suspend User
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => onStatusChange("DEACTIVATED")}
                        className="text-rose-700 hover:bg-rose-50"
                      >
                        <UserX size={15} /> Deactivate User
                      </Button>
                    </>
                  ) : status === "SUSPENDED" ? (
                    <>
                      <Button
                        variant="primary"
                        onClick={() => onStatusChange("ACTIVE")}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <PlayCircle size={15} /> Reactivate User
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => onStatusChange("DEACTIVATED")}
                        className="text-rose-700 hover:bg-rose-50"
                      >
                        <UserX size={15} /> Deactivate User
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="primary"
                      onClick={() => onStatusChange("ACTIVE")}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <PlayCircle size={15} /> Reactivate User
                    </Button>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
              {canEdit && (
                <Button variant="primary" onClick={onEdit}>
                  <Edit2 size={15} /> Edit User
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
