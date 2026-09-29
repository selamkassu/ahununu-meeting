import React, { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Eye,
  Edit2,
  Trash2,
  RefreshCw,
  X,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Users2,
  Lock,
  AlertTriangle,
} from "lucide-react";
import { api, ApiError } from "../../api/client";
import type { RoleListItem } from "../../types";
import { PERMISSION_GROUPS, PERMISSION_LABELS } from "../../types";
import { Card, CardHeader, Button, Field, inputClass, EmptyState } from "../../components/ui/Primitives";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { useAuth } from "../../context/AuthContext";

export default function RolesPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("roles:create");
  const canEdit = hasPermission("roles:edit");
  const canDelete = hasPermission("roles:delete");

  const [roles, setRoles] = useState<RoleListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Modals
  const [createOpen, setCreateOpen] = useState(false);
  const [editRole, setEditRole] = useState<RoleListItem | null>(null);
  const [viewRole, setViewRole] = useState<RoleListItem | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<RoleListItem | null>(null);

  const load = () => {
    setLoading(true);
    api
      .get<RoleListItem[]>("/roles")
      .then(setRoles)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const filteredRoles = useMemo(() => {
    if (!searchQuery.trim()) return roles;
    const q = searchQuery.toLowerCase();
    return roles.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q)
    );
  }, [roles, searchQuery]);

  const stats = useMemo(() => {
    const active = roles.filter((r) => r.isActive).length;
    const totalUsers = roles.reduce((sum, r) => sum + r.userCount, 0);
    return { total: roles.length, active, totalUsers };
  }, [roles]);

  const handleDelete = async (role: RoleListItem) => {
    try {
      await api.delete(`/roles/${role.id}`);
      setDeleteConfirm(null);
      load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to delete role.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate2-900">Role Management</h1>
          <p className="mt-1 text-sm text-slate2-500">
            Define dynamic roles and assign fine-grained permissions from the system catalog.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)} className="shadow-sm">
            <Plus size={16} /> New Role
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flex flex-col rounded-xl border border-slate2-200 bg-white p-4">
          <span className="text-xs font-medium uppercase tracking-wider text-slate2-400">Total Roles</span>
          <span className="mt-2 text-2xl font-bold text-slate2-800">{stats.total}</span>
          <span className="mt-1 text-[11px] text-slate2-500">Configured roles</span>
        </div>
        <div className="flex flex-col rounded-xl border border-slate2-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-emerald-700">Active</span>
            <CheckCircle2 size={13} className="text-emerald-600" />
          </div>
          <span className="mt-2 text-2xl font-bold text-emerald-700">{stats.active}</span>
          <span className="mt-1 text-[11px] text-slate2-500">Available for assignment</span>
        </div>
        <div className="flex flex-col rounded-xl border border-slate2-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate2-400">Assigned Users</span>
            <Users2 size={13} className="text-slate2-400" />
          </div>
          <span className="mt-2 text-2xl font-bold text-slate2-800">{stats.totalUsers}</span>
          <span className="mt-1 text-[11px] text-slate2-500">Across all roles</span>
        </div>
        <div className="flex flex-col rounded-xl border border-slate2-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-brand">Permissions</span>
            <Shield size={13} className="text-brand" />
          </div>
          <span className="mt-2 text-2xl font-bold text-brand">35</span>
          <span className="mt-1 text-[11px] text-slate2-500">Fine-grained capabilities</span>
        </div>
      </div>

      {/* Main Card */}
      <Card>
        {/* Search Bar */}
        <div className="border-b border-slate2-100 p-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate2-400" />
              <input
                type="text"
                placeholder="Search roles by name, code, or description..."
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
            <Button variant="secondary" onClick={load} title="Refresh list" className="h-10 px-3">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </Button>
          </div>
        </div>

        {/* Roles Table */}
        {loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-slate2-100" />
            ))}
          </div>
        ) : filteredRoles.length === 0 ? (
          <EmptyState
            title="No roles found"
            description="No roles match your search criteria."
            action={
              searchQuery ? (
                <Button variant="secondary" onClick={() => setSearchQuery("")}>
                  Clear search
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate2-100 bg-slate2-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate2-500">
                  <th className="px-5 py-3.5">Role</th>
                  <th className="px-5 py-3.5">Code</th>
                  <th className="px-5 py-3.5">Permissions</th>
                  <th className="px-5 py-3.5">Users</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate2-100">
                {filteredRoles.map((role) => (
                  <tr key={role.id} className="group transition-colors hover:bg-slate2-50/60">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 text-brand">
                          <Shield size={16} />
                        </div>
                        <div>
                          <p className="font-medium text-slate2-800">{role.name}</p>
                          {role.description && (
                            <p className="mt-0.5 text-[11px] text-slate2-400 line-clamp-1">{role.description}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="rounded bg-slate2-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate2-600">
                        {role.code}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs font-medium text-slate2-700">
                        {role.permissions.length} permissions
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <Users2 size={13} className="text-slate2-400" />
                        <span className="text-xs font-medium text-slate2-700">{role.userCount}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      {role.isActive ? (
                        <Badge tone="success">Active</Badge>
                      ) : (
                        <Badge tone="neutral">Inactive</Badge>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setViewRole(role)}
                          className="rounded-lg p-1.5 text-slate2-400 hover:bg-slate2-100 hover:text-slate2-700"
                          title="View role details"
                        >
                          <Eye size={15} />
                        </button>
                        {canEdit && (
                          <button
                            onClick={() => setEditRole(role)}
                            className="rounded-lg p-1.5 text-slate2-400 hover:bg-slate2-100 hover:text-slate2-700"
                            title="Edit role"
                          >
                            <Edit2 size={15} />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => {
                              if (role.userCount > 0) {
                                alert(`Cannot delete role "${role.name}": ${role.userCount} user(s) are currently assigned to this role. Please reassign them to another role first.`);
                                return;
                              }
                              setDeleteConfirm(role);
                            }}
                            className={`rounded-lg p-1.5 ${
                              role.userCount > 0
                                ? "text-slate2-300 hover:text-slate2-400 cursor-not-allowed"
                                : "text-rose-400 hover:bg-rose-50 hover:text-rose-600"
                            }`}
                            title={
                              role.userCount > 0
                                ? `Cannot delete: ${role.userCount} user(s) assigned`
                                : "Delete role"
                            }
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create Modal */}
      {createOpen && (
        <RoleFormModal
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false);
            load();
          }}
        />
      )}

      {/* Edit Modal */}
      {editRole && (
        <RoleFormModal
          role={editRole}
          onClose={() => setEditRole(null)}
          onSaved={() => {
            setEditRole(null);
            load();
          }}
        />
      )}

      {/* View Modal */}
      {viewRole && (
        <RoleViewModal
          role={viewRole}
          onClose={() => setViewRole(null)}
          onEdit={
            canEdit
              ? () => {
                  setEditRole(viewRole);
                  setViewRole(null);
                }
              : undefined
          }
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <Modal open onClose={() => setDeleteConfirm(null)} title="Delete Role">
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg bg-rose-50 p-3.5">
              <AlertTriangle className="shrink-0 text-rose-600" size={24} />
              <div className="text-xs">
                <p className="font-semibold text-slate2-800">
                  Delete the role "{deleteConfirm.name}"?
                </p>
                <p className="mt-1 text-slate2-500">
                  {deleteConfirm.userCount > 0
                    ? `This role is assigned to ${deleteConfirm.userCount} user(s). You must reassign them before deleting.`
                    : "This action cannot be undone. The role and its permission assignments will be permanently removed."}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate2-100 pt-3">
              <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => handleDelete(deleteConfirm)}
                disabled={deleteConfirm.userCount > 0}
              >
                Delete Role
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// =========================================================================
// ROLE CREATE/EDIT MODAL
// =========================================================================
function RoleFormModal({
  role,
  onClose,
  onSaved,
}: {
  role?: RoleListItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEditing = !!role;
  const [name, setName] = useState(role?.name || "");
  const [code, setCode] = useState(role?.code || "");
  const [description, setDescription] = useState(role?.description || "");
  const [permissions, setPermissions] = useState<string[]>(role?.permissions || []);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(PERMISSION_GROUPS.map((g) => g.label)));

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const togglePermission = (perm: string) => {
    setPermissions((prev) => (prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]));
  };

  const toggleGroupAll = (groupPerms: string[]) => {
    const allSelected = groupPerms.every((p) => permissions.includes(p));
    if (allSelected) {
      setPermissions((prev) => prev.filter((p) => !groupPerms.includes(p)));
    } else {
      setPermissions((prev) => [...new Set([...prev, ...groupPerms])]);
    }
  };

  const selectAll = () => {
    const all = PERMISSION_GROUPS.flatMap((g) => g.permissions);
    setPermissions(all);
  };

  const clearAll = () => setPermissions([]);

  const submit = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Role name is required.");
      return;
    }
    if (!isEditing && !code.trim()) {
      setError("Role code is required.");
      return;
    }
    if (permissions.length === 0) {
      setError("Select at least one permission.");
      return;
    }

    setSubmitting(true);
    try {
      if (isEditing) {
        await api.put(`/roles/${role!.id}`, {
          name,
          description: description.trim() || null,
          permissions,
        });
      } else {
        await api.post("/roles", {
          name,
          code: code.toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
          description: description.trim() || null,
          permissions,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save role.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={isEditing ? `Edit Role: ${role!.name}` : "Create New Role"} wide>
      <div className="space-y-4">
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-danger">{error}</p>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Role Name" required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="e.g. Fleet Dispatcher"
              autoFocus
            />
          </Field>
          <Field label="Role Code" required hint={isEditing ? "Code cannot be changed" : "Uppercase, e.g. FLEET_DISPATCHER"}>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))}
              className={inputClass}
              placeholder="e.g. FLEET_DISPATCHER"
              disabled={isEditing}
            />
          </Field>
        </div>

        <Field label="Description" hint="Brief description of this role's purpose">
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
            placeholder="Describe this role's scope and responsibilities..."
          />
        </Field>

        {/* Permissions */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-slate2-700">
              Permissions ({permissions.length} selected)
            </span>
            <div className="flex gap-2">
              <button type="button" onClick={selectAll} className="text-xs font-medium text-brand hover:underline">
                Select All
              </button>
              <button type="button" onClick={clearAll} className="text-xs font-medium text-slate2-500 hover:underline">
                Clear All
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto rounded-lg border border-slate2-200 bg-slate2-50/30">
            {PERMISSION_GROUPS.map((group) => {
              const isExpanded = expandedGroups.has(group.label);
              const selectedCount = group.permissions.filter((p) => permissions.includes(p)).length;
              const allSelected = selectedCount === group.permissions.length;

              return (
                <div key={group.label} className="border-b border-slate2-100 last:border-0">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.label)}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-xs font-semibold text-slate2-700 hover:bg-slate2-50"
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      <span>{group.label}</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                        selectedCount === group.permissions.length
                          ? "bg-brand/10 text-brand"
                          : selectedCount > 0
                          ? "bg-amber-100 text-amber-700"
                          : "bg-slate2-200 text-slate2-500"
                      }`}>
                        {selectedCount}/{group.permissions.length}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleGroupAll(group.permissions);
                      }}
                      className="rounded px-2 py-0.5 text-[10px] font-medium text-brand hover:bg-brand/10"
                    >
                      {allSelected ? "Deselect All" : "Select All"}
                    </button>
                  </button>
                  {isExpanded && (
                    <div className="grid grid-cols-1 gap-1 px-3 pb-2.5 sm:grid-cols-2">
                      {group.permissions.map((perm) => {
                        const isChecked = permissions.includes(perm);
                        return (
                          <label
                            key={perm}
                            className={`flex items-center gap-2 rounded-lg border p-2 text-xs cursor-pointer transition-colors ${
                              isChecked
                                ? "border-brand/40 bg-white font-medium text-slate2-800 shadow-xs"
                                : "border-transparent text-slate2-500 hover:bg-white/80"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => togglePermission(perm)}
                              className="rounded border-slate2-300 text-brand focus:ring-brand"
                            />
                            <span className="flex-1">{PERMISSION_LABELS[perm] || perm}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate2-100 pt-4">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Saving..." : isEditing ? "Save Changes" : "Create Role"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// =========================================================================
// VIEW ROLE MODAL
// =========================================================================
function RoleViewModal({
  role,
  onClose,
  onEdit,
}: {
  role: RoleListItem;
  onClose: () => void;
  onEdit?: () => void;
}) {
  return (
    <Modal open onClose={onClose} title="Role Details" wide>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between rounded-xl bg-slate2-50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <Shield size={20} />
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-slate2-900">{role.name}</h3>
              <p className="font-mono text-xs text-slate2-500">{role.code}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {role.isActive ? (
              <Badge tone="success">Active</Badge>
            ) : (
              <Badge tone="neutral">Inactive</Badge>
            )}
            <span className="flex items-center gap-1 rounded-full bg-slate2-100 px-2.5 py-1 text-xs font-medium text-slate2-600">
              <Users2 size={12} /> {role.userCount} users
            </span>
          </div>
        </div>

        {/* Description */}
        {role.description && (
          <div className="rounded-xl border border-slate2-200 p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate2-400">Description</h4>
            <p className="mt-2 text-xs text-slate2-700 leading-relaxed">{role.description}</p>
          </div>
        )}

        {/* Permissions by Group */}
        <div className="rounded-xl border border-slate2-200 p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate2-400">Assigned Permissions</h4>
            <span className="text-xs font-semibold text-slate2-600">{role.permissions.length} Total</span>
          </div>
          <div className="mt-3 space-y-3">
            {PERMISSION_GROUPS.map((group) => {
              const activeInGroup = group.permissions.filter((p) => role.permissions.includes(p));
              if (activeInGroup.length === 0) return null;

              return (
                <div key={group.label}>
                  <p className="mb-1.5 text-[11px] font-semibold text-slate2-500">{group.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {activeInGroup.map((perm) => (
                      <span
                        key={perm}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate2-200 bg-slate2-50 px-2.5 py-1 text-xs text-slate2-700 font-medium"
                      >
                        <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
                        {PERMISSION_LABELS[perm] || perm}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 border-t border-slate2-100 pt-4">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          {onEdit && (
            <Button onClick={onEdit}>
              <Edit2 size={15} /> Edit Role
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
