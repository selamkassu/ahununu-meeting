import React, { useEffect, useMemo, useState } from "react";
import { Plus, Building2, Pencil, Trash2, AlertTriangle, Loader2, UserCircle, X, Users, Search } from "lucide-react";
import { api, ApiError } from "../../api/client";
import type { Department, DepartmentHeadUser, UserLite } from "../../types";
import { Card, CardHeader, Button, Field, inputClass, EmptyState } from "../../components/ui/Primitives";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Toast, ToastType } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";

// ─────────────────────────────────────────────────────────────
// Reusable Department Head selector
// ─────────────────────────────────────────────────────────────
function DepartmentHeadSelect({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null, user: DepartmentHeadUser | null) => void;
}) {
  const [users, setUsers] = useState<UserLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<DepartmentHeadUser | null>(null);

  useEffect(() => {
    api
      .get<UserLite[]>("/users?isActive=true&limit=200")
      .then((res) => {
        const list = Array.isArray(res) ? res : (res as any)?.users ?? [];
        setUsers(list);
        if (value) {
          const found = list.find((u: UserLite) => u.id === value);
          if (found) setSelectedUser(found as unknown as DepartmentHeadUser);
        }
      })
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      (u.email ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const select = (u: UserLite) => {
    setSelectedUser(u as unknown as DepartmentHeadUser);
    onChange(u.id, u as unknown as DepartmentHeadUser);
    setOpen(false);
    setSearch("");
  };

  const clear = () => {
    setSelectedUser(null);
    onChange(null, null);
    setOpen(false);
    setSearch("");
  };

  return (
    <div className="relative">
      {selectedUser ? (
        <div className="flex items-center justify-between rounded-lg border border-slate2-200 bg-white px-3 py-2 text-sm">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
              style={{ backgroundColor: (selectedUser as any).avatarColor ?? "#0B7A6B" }}
            >
              {selectedUser.name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-slate2-800">{selectedUser.name}</p>
              {selectedUser.jobTitle && (
                <p className="truncate text-[10px] text-slate2-400">{selectedUser.jobTitle}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={clear}
            className="ml-2 rounded p-0.5 text-slate2-400 hover:bg-red-50 hover:text-danger"
            title="Remove department head"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`${inputClass} flex items-center justify-between text-sm text-slate2-400 hover:border-brand focus:border-brand focus:outline-none`}
        >
          <span className="flex items-center gap-1.5">
            <UserCircle size={14} />
            {loading ? "Loading users…" : "Select Department Head"}
          </span>
          <span className="text-[10px]">▼</span>
        </button>
      )}

      {open && !selectedUser && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-slate2-200 bg-white shadow-lg">
          <div className="border-b border-slate2-100 p-2">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email…"
              className="w-full rounded-lg border border-slate2-200 px-2.5 py-1.5 text-xs outline-none focus:border-brand"
            />
          </div>
          <ul className="max-h-48 overflow-y-auto p-1">
            <li>
              <button
                type="button"
                onClick={clear}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-slate2-500 hover:bg-slate2-50"
              >
                <UserCircle size={14} className="text-slate2-400" />
                No Department Head
              </button>
            </li>
            {loading ? (
              <li className="px-3 py-2 text-xs text-slate2-400">Loading…</li>
            ) : filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-slate2-400">No users found.</li>
            ) : (
              filtered.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => select(u)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-slate2-50"
                  >
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                      style={{ backgroundColor: u.avatarColor ?? "#0B7A6B" }}
                    >
                      {u.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate2-800">{u.name}</p>
                      {u.email && <p className="truncate text-[10px] text-slate2-400">{u.email}</p>}
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────
export default function DepartmentsPage() {
  const { user, hasPermission } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [deletingDepartment, setDeletingDepartment] = useState<Department | null>(null);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");

  const hasAdminOverride = hasPermission("ADMIN_OVERRIDE");
  const canCreate = hasAdminOverride || hasPermission("departments:create");
  const canEdit = hasAdminOverride || hasPermission("departments:edit");
  const canDelete = hasAdminOverride || hasPermission("departments:delete");

  const load = () => {
    setLoading(true);
    api
      .get<Department[]>("/departments")
      .then(setDepartments)
      .catch((err) => {
        setToast({
          message: err instanceof ApiError ? err.message : "Failed to load departments.",
          type: "error",
        });
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filteredDepartments = useMemo(() => {
    return departments.filter((d) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        d.name.toLowerCase().includes(q) ||
        d.code.toLowerCase().includes(q) ||
        (d.description || "").toLowerCase().includes(q) ||
        (d.head?.name || "").toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && d.isActive) ||
        (statusFilter === "INACTIVE" && !d.isActive);
      return matchesSearch && matchesStatus;
    });
  }, [departments, search, statusFilter]);

  const activeCount = useMemo(() => departments.filter((d) => d.isActive).length, [departments]);
  const inactiveCount = useMemo(() => departments.filter((d) => !d.isActive).length, [departments]);

  return (
    <div className="space-y-4">
      <Toast
        message={toast?.message || null}
        type={toast?.type}
        onClose={() => setToast(null)}
      />

      <Card>
        <CardHeader
          title="Departments"
          subtitle="Ahununu Logistics' organizational units — manage departments, statuses, and team allocations"
          action={
            canCreate && (
              <Button onClick={() => setCreateOpen(true)} className="flex items-center gap-1.5">
                <Plus size={15} /> New department
              </Button>
            )
          }
        />

        {/* Search & Filter Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate2-100 bg-slate2-50/50 px-5 py-3 text-xs">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate2-400" size={14} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by department name, code, description, or head..."
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

          <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto">
            <button
              type="button"
              onClick={() => setStatusFilter("ALL")}
              className={`px-3 py-1.5 rounded-full font-medium transition-colors cursor-pointer ${
                statusFilter === "ALL"
                  ? "bg-[#0B7A6B] text-white shadow-2xs font-semibold"
                  : "bg-white text-slate2-600 border border-slate2-200 hover:bg-slate2-50"
              }`}
            >
              All ({departments.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("ACTIVE")}
              className={`px-3 py-1.5 rounded-full font-medium transition-colors cursor-pointer ${
                statusFilter === "ACTIVE"
                  ? "bg-emerald-600 text-white shadow-2xs font-semibold"
                  : "bg-white text-emerald-800 border border-emerald-200 hover:bg-emerald-50"
              }`}
            >
              Active ({activeCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("INACTIVE")}
              className={`px-3 py-1.5 rounded-full font-medium transition-colors cursor-pointer ${
                statusFilter === "INACTIVE"
                  ? "bg-slate2-700 text-white shadow-2xs font-semibold"
                  : "bg-white text-slate2-600 border border-slate2-200 hover:bg-slate2-50"
              }`}
            >
              Inactive ({inactiveCount})
            </button>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-36 animate-pulse rounded-xl bg-slate2-100" />
            ))}
          </div>
        ) : filteredDepartments.length === 0 ? (
          <EmptyState
            title={departments.length === 0 ? "No departments yet" : "No departments match your search"}
            description={
              departments.length === 0
                ? "Add your first department to start organizing teams and scheduling meetings."
                : "Try adjusting your search query or filter."
            }
            action={
              departments.length === 0 && canCreate ? (
                <Button onClick={() => setCreateOpen(true)} className="mt-3">
                  <Plus size={15} /> Create first department
                </Button>
              ) : departments.length > 0 ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("ALL");
                  }}
                  className="mt-2 text-xs"
                >
                  Reset filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 p-4 sm:p-5 md:grid-cols-2 xl:grid-cols-3">
            {filteredDepartments.map((d) => (
              <div
                key={d.id}
                className="flex flex-col justify-between rounded-2xl border border-slate2-200/90 bg-white p-4 sm:p-5 shadow-sm transition-all hover:shadow-md overflow-hidden min-w-0"
              >
                <div>
                  {/* Top Header: Icon + Title + Code on left, Status Pill on right */}
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-2xl bg-[#e6f4f1] text-[#0d6e5a]">
                        <svg
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M6 22V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v14" />
                          <path d="M2 22V13a2 2 0 0 1 2-2h2v11" />
                          <path d="M18 22V13h2a2 2 0 0 1 2 2v7" />
                          <path d="M10 10h4" />
                          <path d="M10 13.5h4" />
                          <path d="M10 17h4" />
                          <path d="M2 22h20" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-display text-base font-bold text-slate2-900 tracking-tight truncate">
                          {d.name}
                        </h4>
                        <p className="text-xs font-bold text-slate2-500 tracking-wide mt-0.5">
                          {d.code}
                        </p>
                      </div>
                    </div>

                    {/* Status Pill in top right */}
                    {d.isActive ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#dcfce7]/70 px-2.5 py-1 text-xs font-bold tracking-wider text-[#15803d] shrink-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#15803d]" />
                        ACTIVE
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate2-100 px-2.5 py-1 text-xs font-bold tracking-wider text-slate2-500 shrink-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate2-400" />
                        INACTIVE
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  <p className="mt-3 text-sm text-slate2-800 leading-relaxed font-normal min-h-[2.5rem]">
                    {d.description || (
                      <span className="italic text-slate2-400">No description provided.</span>
                    )}
                  </p>

                  {/* Department Head */}
                  {d.head ? (
                    <div className="mt-2 flex items-center gap-2 text-sm text-slate2-600">
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                        style={{ backgroundColor: d.head.avatarColor ?? "#0B7A6B" }}
                      >
                        {d.head.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="font-medium text-slate2-700">{d.head.name}</span>
                      <span className="text-slate2-400 text-xs">— Head</span>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm italic text-slate2-400">
                      No department head assigned.
                    </p>
                  )}
                </div>

                {/* Footer Divider & Controls */}
                <div className="mt-4 border-t border-slate2-100/90 pt-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-slate2-500 font-medium min-w-0 truncate">
                    <Users size={14} className="text-slate2-400 stroke-[1.8] shrink-0" />
                    <span className="truncate">
                      {d._count?.users ?? 0} users · {d._count?.meetings ?? 0} meetings
                    </span>
                  </div>

                  {(canEdit || canDelete) && (
                    <div className="flex items-center gap-1.5 ml-auto shrink-0 justify-end">
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => setEditingDepartment(d)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#2dd4bf]/70 bg-white text-[#0d6e5a] shadow-2xs hover:bg-[#ecfdf5] hover:border-[#14b8a6] transition-colors"
                          title="Edit department"
                          aria-label="Edit department"
                        >
                          <Pencil size={13} className="stroke-[2.2]" />
                        </button>
                      )}

                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => setDeletingDepartment(d)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-200 bg-white text-[#dc2626] shadow-2xs hover:bg-red-50 hover:border-red-300 transition-colors"
                          title="Delete department"
                          aria-label="Delete department"
                        >
                          <Trash2 size={13} className="stroke-[2.2]" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Create Department Modal ── */}
      {createOpen && (
        <DepartmentCreateModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            load();
            setToast({ message: "Department created successfully.", type: "success" });
          }}
        />
      )}

      {/* ── Edit Department Modal ── */}
      {editingDepartment && (
        <DepartmentEditModal
          department={editingDepartment}
          onClose={() => setEditingDepartment(null)}
          onUpdated={() => {
            setEditingDepartment(null);
            load();
            setToast({ message: "Department updated successfully.", type: "success" });
          }}
          onError={() => {
            setToast({ message: "Failed to update department. Please try again.", type: "error" });
          }}
        />
      )}

      {/* ── Delete Confirmation Dialog ── */}
      {deletingDepartment && (
        <DepartmentDeleteModal
          department={deletingDepartment}
          onClose={() => setDeletingDepartment(null)}
          onDeleted={() => {
            setDeletingDepartment(null);
            load();
            setToast({ message: "Department deleted successfully.", type: "success" });
          }}
          onError={(msg) => {
            setDeletingDepartment(null);
            setToast({
              message: msg || "Failed to delete department. Please try again.",
              type: "error",
            });
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Edit Department Modal
// ─────────────────────────────────────────────────────────────
function DepartmentEditModal({
  department,
  onClose,
  onUpdated,
  onError,
}: {
  department: Department;
  onClose: () => void;
  onUpdated: () => void;
  onError: () => void;
}) {
  const [name, setName] = useState(department.name);
  const [description, setDescription] = useState(department.description || "");
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE">(
    department.isActive ? "ACTIVE" : "INACTIVE"
  );
  const [headId, setHeadId] = useState<string | null>(department.headId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Department name is required.");
      return;
    }
    if (name.trim().length < 2) {
      setError("Department name must be at least 2 characters.");
      return;
    }

    setSubmitting(true);
    try {
      await api.put(`/departments/${department.id}`, {
        name: name.trim(),
        description: description.trim() || null,
        status,
        headId: headId ?? null,
      });
      onUpdated();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to update department. Please try again.";
      setError(msg);
      onError();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Edit Department">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Department Name" required>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="e.g. Operations"
          />
        </Field>

        <Field label="Department Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className={inputClass}
            placeholder="Describe the department's core responsibilities..."
          />
        </Field>

        <Field label="Department Head (Optional)" hint="Select the user leading this department">
          <DepartmentHeadSelect
            value={headId}
            onChange={(id) => setHeadId(id)}
          />
        </Field>

        <Field label="Status" required hint="Active departments can be assigned to meetings and users">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "ACTIVE" | "INACTIVE")}
            className={inputClass}
          >
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
          </select>
        </Field>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-slate2-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting} className="flex items-center gap-1.5">
            {submitting && <Loader2 size={15} className="animate-spin" />}
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// Delete Department Confirmation Dialog
// ─────────────────────────────────────────────────────────────
function DepartmentDeleteModal({
  department,
  onClose,
  onDeleted,
  onError,
}: {
  department: Department;
  onClose: () => void;
  onDeleted: () => void;
  onError: (msg?: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  const confirmDelete = async () => {
    setSubmitting(true);
    try {
      await api.delete(`/departments/${department.id}`);
      onDeleted();
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : "Failed to delete department. Please try again.";
      onError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const usersCount = department._count?.users ?? 0;
  const meetingsCount = department._count?.meetings ?? 0;
  const hasDependencies = usersCount > 0 || meetingsCount > 0;

  return (
    <Modal open onClose={onClose} title="Delete Department?">
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg bg-red-50 p-3.5 text-danger">
          <AlertTriangle size={20} className="shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed">
            <p className="font-semibold">
              Are you sure you want to delete <span className="font-bold underline">{department.name}</span>? This action cannot be undone.
            </p>
            {hasDependencies && (
              <p className="mt-1.5 text-red-700">
                Warning: This department currently has <span className="font-semibold">{usersCount} user(s)</span> and{" "}
                <span className="font-semibold">{meetingsCount} meeting(s)</span> assigned to it. It may need to be deactivated rather than deleted.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-slate2-200 bg-slate2-50/50 p-3.5 space-y-1 text-xs text-slate2-600">
          <p>
            <strong className="text-slate2-800">Department:</strong> {department.name} ({department.code})
          </p>
          {department.description && (
            <p>
              <strong className="text-slate2-800">Description:</strong> {department.description}
            </p>
          )}
          <p>
            <strong className="text-slate2-800">Status:</strong> {department.isActive ? "ACTIVE" : "INACTIVE"}
          </p>
          {department.head && (
            <p>
              <strong className="text-slate2-800">Department Head:</strong> {department.head.name}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate2-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={confirmDelete}
            disabled={submitting}
            className="flex items-center gap-1.5"
          >
            {submitting && <Loader2 size={15} className="animate-spin" />}
            Delete Department
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// Create Department Modal
// ─────────────────────────────────────────────────────────────
function DepartmentCreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");
  const [headId, setHeadId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Department name is required.");
      return;
    }
    if (!code.trim()) {
      setError("Short code is required.");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/departments", {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        description: description.trim() || undefined,
        status,
        headId: headId ?? undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn'\''t create the department.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="New department">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Department name" required>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!code && e.target.value.length >= 3) {
                setCode(e.target.value.substring(0, 3).toUpperCase());
              }
            }}
            className={inputClass}
            placeholder="e.g. Operations"
          />
        </Field>
        <Field label="Short code" required hint="A few letters used on tracking codes and tables (2-10 chars)">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className={inputClass}
            placeholder="e.g. OPS"
            maxLength={10}
          />
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className={inputClass}
            placeholder="Describe the department's role..."
          />
        </Field>
        <Field label="Department Head (Optional)" hint="Select the user leading this department">
          <DepartmentHeadSelect
            value={headId}
            onChange={(id) => setHeadId(id)}
          />
        </Field>
        <Field label="Status" required>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "ACTIVE" | "INACTIVE")}
            className={inputClass}
          >
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
          </select>
        </Field>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-danger">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-slate2-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting} className="flex items-center gap-1.5">
            {submitting && <Loader2 size={15} className="animate-spin" />}
            Create department
          </Button>
        </div>
      </form>
    </Modal>
  );
}
