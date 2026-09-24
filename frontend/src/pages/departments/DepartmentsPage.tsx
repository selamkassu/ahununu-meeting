import React, { useEffect, useState } from "react";
import { Plus, Building2, Pencil, Trash2, AlertTriangle, Loader2, UserCircle, X } from "lucide-react";
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

  const isSuperAdmin =
    user?.role?.code === "SYSTEM_ADMIN" ||
    user?.role?.name?.toLowerCase().includes("super admin") ||
    user?.role?.name?.toLowerCase().includes("system admin");

  const canCreate = isSuperAdmin || hasPermission("departments:create");
  const canEdit = isSuperAdmin || hasPermission("departments:edit");
  const canDelete = isSuperAdmin || hasPermission("departments:delete");

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

        {loading ? (
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-36 animate-pulse rounded-xl bg-slate2-100" />
            ))}
          </div>
        ) : departments.length === 0 ? (
          <EmptyState
            title="No departments yet"
            description="Add your first department to start organizing teams and scheduling meetings."
            action={
              canCreate && (
                <Button onClick={() => setCreateOpen(true)} className="mt-3">
                  <Plus size={15} /> Create first department
                </Button>
              )
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {departments.map((d) => (
              <div
                key={d.id}
                className="flex flex-col justify-between rounded-xl border border-slate2-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <div>
                  {/* Top Header: icon + name + code */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                        <Building2 size={17} strokeWidth={2} />
                      </div>
                      <div>
                        <h4 className="font-display text-sm font-bold text-slate2-800">{d.name}</h4>
                        <span className="font-mono text-[11px] text-slate2-400 font-semibold">{d.code}</span>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="mt-2.5 text-xs text-slate2-600 leading-relaxed min-h-[2.5rem]">
                    {d.description || <span className="italic text-slate2-400">No description provided.</span>}
                  </p>

                  {/* Department Head */}
                  {d.head ? (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-slate2-600">
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                        style={{ backgroundColor: d.head.avatarColor ?? "#0B7A6B" }}
                      >
                        {d.head.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="font-medium text-slate2-700">{d.head.name}</span>
                      <span className="text-slate2-400">— Head</span>
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] italic text-slate2-400">No department head assigned.</p>
                  )}

                  {/* Status row */}
                  <div className="mt-3 flex items-center justify-between border-t border-slate2-100 pt-2.5">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="font-medium text-slate2-500">Status:</span>
                      <Badge tone={d.isActive ? "success" : "neutral"}>
                        {d.isActive ? "ACTIVE" : "INACTIVE"}
                      </Badge>
                    </div>
                    <span className="text-[11px] text-slate2-400">
                      {d._count?.users ?? 0} users · {d._count?.meetings ?? 0} meetings
                    </span>
                  </div>
                </div>

                {/* Actions: Edit & Delete */}
                {(canEdit || canDelete) && (
                  <div className="mt-3.5 flex items-center justify-end gap-2 border-t border-slate2-100 pt-3">
                    {canEdit && (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setEditingDepartment(d)}
                        className="px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 hover:border-brand hover:text-brand"
                      >
                        <Pencil size={13} />
                        <span>Edit</span>
                      </Button>
                    )}

                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => setDeletingDepartment(d)}
                        className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-danger transition-colors hover:bg-red-50 hover:border-red-300"
                        title="Delete department"
                      >
                        <Trash2 size={13} />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>
                )}
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
