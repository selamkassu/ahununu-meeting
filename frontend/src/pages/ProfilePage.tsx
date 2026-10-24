import React, { useState, useEffect } from "react";
import {
  User as UserIcon,
  Mail,
  Phone,
  Briefcase,
  Shield,
  Building,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Lock,
  Eye,
  EyeOff,
  Palette,
  Calendar,
  Sparkles,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api, ApiError } from "../api/client";
import { Button, Card, CardHeader, Field, inputClass, Avatar } from "../components/ui/Primitives";
import { Badge } from "../components/ui/Badge";
import type { User } from "../types";

const AVATAR_COLORS = [
  { name: "Brand Teal", hex: "#0B7A6B" },
  { name: "Brand Light", hex: "#AED580" },
  { name: "Emerald", hex: "#1F9D63" },
  { name: "Sky Blue", hex: "#0284C7" },
  { name: "Indigo", hex: "#4F46E5" },
  { name: "Purple", hex: "#7C3AED" },
  { name: "Rose", hex: "#E11D48" },
  { name: "Amber", hex: "#D97706" },
  { name: "Slate", hex: "#475569" },
];

export default function ProfilePage() {
  const { user, updateUser, refreshUser } = useAuth();

  // Personal details state
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [jobTitle, setJobTitle] = useState(user?.jobTitle || "");
  const [avatarColor, setAvatarColor] = useState(user?.avatarColor || "#0B7A6B");
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsSuccess, setDetailsSuccess] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setName(user.name || "");
      setPhone(user.phone || "");
      setJobTitle(user.jobTitle || "");
      setAvatarColor(user.avatarColor || "#0B7A6B");
    }
  }, [user]);

  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setDetailsSuccess(null);
    setDetailsError(null);

    if (!name.trim()) {
      setDetailsError("Full name is required.");
      return;
    }

    setSavingDetails(true);
    try {
      const res = await api.put<{ user: User; message: string }>("/auth/profile", {
        name: name.trim(),
        phone: phone.trim() || null,
        jobTitle: jobTitle.trim() || null,
        avatarColor,
      });

      if (res.user) {
        updateUser(res.user);
      } else {
        await refreshUser();
      }
      setDetailsSuccess(res.message || "Personal details updated successfully.");
    } catch (err: any) {
      setDetailsError(
        err instanceof ApiError
          ? err.message
          : err?.message || "Failed to update profile details. Please try again."
      );
    } finally {
      setSavingDetails(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordSuccess(null);
    setPasswordError(null);

    if (!currentPassword) {
      setPasswordError("Please enter your current password.");
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match. Please verify.");
      return;
    }

    setSavingPassword(true);
    try {
      const res = await api.put<{ message: string }>("/auth/change-password", {
        currentPassword,
        newPassword,
      });
      setPasswordSuccess(res.message || "Password changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPasswordError(
        err instanceof ApiError
          ? err.message
          : err?.message || "Failed to change password. Please check your current password."
      );
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* ── Top Header Profile Summary Card ── */}
      <div className="rounded-2xl border border-slate2-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div
                className="flex h-16 w-16 items-center justify-center rounded-2xl text-xl font-bold text-white shadow-sm transition-all"
                style={{ backgroundColor: avatarColor }}
              >
                {name
                  ? name
                      .split(" ")
                      .map((p) => p[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase()
                  : "U"}
              </div>
              <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-emerald-500 shadow-sm" title="Active">
                <span className="h-2 w-2 rounded-full bg-white" />
              </span>
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-xl font-bold text-slate2-900">{name || "User Profile"}</h1>
                {jobTitle && (
                  <span className="rounded-md bg-slate2-100 px-2 py-0.5 text-xs font-semibold text-slate2-700">
                    {jobTitle}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-slate2-500 flex items-center gap-1.5">
                <Mail size={13} className="text-slate2-400" /> {user?.email}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {user?.department && (
                  <span className="inline-flex items-center gap-1 text-slate2-600 bg-slate2-50 border border-slate2-200 rounded px-2 py-0.5 text-[11px]">
                    <Building size={12} className="text-slate2-400" />
                    {user.department.name}
                  </span>
                )}
                {user?.role && (
                  <Badge tone="brand">
                    <Shield size={11} className="mr-1 inline" />
                    {user.role.name}
                  </Badge>
                )}
                <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200/60 rounded px-2 py-0.5 text-[11px] font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Active Account
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── Left Column: Personal Details Form (2 Cols) ── */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title={
                <div className="flex items-center gap-2">
                  <UserIcon className="h-5 w-5 text-brand" />
                  <span>Personal Details</span>
                </div>
              }
              subtitle="Update your profile information and how you appear in meetings and manifests"
            />

            <form onSubmit={handleSaveDetails} className="space-y-5 p-6">
              {detailsSuccess && (
                <div className="flex items-start gap-2.5 rounded-lg bg-emerald-50 border border-emerald-200 p-3.5 text-xs text-emerald-800">
                  <CheckCircle2 size={16} className="shrink-0 text-emerald-600 mt-0.5" />
                  <span>{detailsSuccess}</span>
                </div>
              )}

              {detailsError && (
                <div className="flex items-start gap-2.5 rounded-lg bg-rose-50 border border-rose-200 p-3.5 text-xs text-rose-800">
                  <AlertCircle size={16} className="shrink-0 text-rose-600 mt-0.5" />
                  <span>{detailsError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Full Name" required>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Selam Kasu"
                    className={inputClass}
                  />
                </Field>

                <Field label="Job Title">
                  <input
                    type="text"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="e.g. Operations Coordinator"
                    className={inputClass}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Work Email Address" hint="Company work email (managed by System Administrator)">
                  <input
                    type="email"
                    disabled
                    value={user?.email || ""}
                    className={`${inputClass} bg-slate2-100 text-slate2-500 cursor-not-allowed`}
                  />
                </Field>

                <Field label="Contact Phone Number">
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+251 91 123 4567"
                    className={inputClass}
                  />
                </Field>
              </div>

              {/* Avatar Accent Color */}
              <div>
                <label className="block text-xs font-medium text-slate2-600 mb-2">
                  <Palette size={13} className="inline mr-1 text-brand" /> Avatar Accent Color
                </label>
                <div className="flex flex-wrap items-center gap-2.5">
                  {AVATAR_COLORS.map((c) => {
                    const isSelected = avatarColor.toLowerCase() === c.hex.toLowerCase();
                    return (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => setAvatarColor(c.hex)}
                        title={c.name}
                        className={`h-8 w-8 rounded-full transition-transform cursor-pointer relative ${
                          isSelected ? "scale-110 ring-2 ring-offset-2 ring-brand" : "hover:scale-105"
                        }`}
                        style={{ backgroundColor: c.hex }}
                      >
                        {isSelected && (
                          <span className="absolute inset-0 flex items-center justify-center text-white">
                            ✓
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end pt-3 border-t border-slate2-100">
                <Button type="submit" variant="primary" disabled={savingDetails}>
                  {savingDetails && <Loader2 size={14} className="animate-spin" />}
                  Save Details
                </Button>
              </div>
            </form>
          </Card>

          {/* ── Security & Change Password Card ── */}
          <Card>
            <CardHeader
              title={
                <div className="flex items-center gap-2">
                  <Lock className="h-5 w-5 text-brand" />
                  <span>Security & Password</span>
                </div>
              }
              subtitle="Update your password to keep your portal account secure"
            />

            <form onSubmit={handleChangePassword} className="space-y-4 p-6">
              {passwordSuccess && (
                <div className="flex items-start gap-2.5 rounded-lg bg-emerald-50 border border-emerald-200 p-3.5 text-xs text-emerald-800">
                  <CheckCircle2 size={16} className="shrink-0 text-emerald-600 mt-0.5" />
                  <span>{passwordSuccess}</span>
                </div>
              )}

              {passwordError && (
                <div className="flex items-start gap-2.5 rounded-lg bg-rose-50 border border-rose-200 p-3.5 text-xs text-rose-800">
                  <AlertCircle size={16} className="shrink-0 text-rose-600 mt-0.5" />
                  <span>{passwordError}</span>
                </div>
              )}

              <Field label="Current Password" required>
                <div className="relative">
                  <input
                    type={showCurrentPass ? "text" : "password"}
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    className={`${inputClass} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPass(!showCurrentPass)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate2-400 hover:text-slate2-600 cursor-pointer"
                  >
                    {showCurrentPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="New Password (min 6 characters)" required>
                  <div className="relative">
                    <input
                      type={showNewPass ? "text" : "password"}
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      className={`${inputClass} pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPass(!showNewPass)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate2-400 hover:text-slate2-600 cursor-pointer"
                    >
                      {showNewPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </Field>

                <Field label="Confirm New Password" required>
                  <div className="relative">
                    <input
                      type={showConfirmPass ? "text" : "password"}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat new password"
                      className={`${inputClass} pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPass(!showConfirmPass)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate2-400 hover:text-slate2-600 cursor-pointer"
                    >
                      {showConfirmPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </Field>
              </div>

              <div className="flex justify-end pt-3 border-t border-slate2-100">
                <Button type="submit" variant="primary" disabled={savingPassword}>
                  {savingPassword && <Loader2 size={14} className="animate-spin" />}
                  Update Password
                </Button>
              </div>
            </form>
          </Card>
        </div>

        {/* ── Right Column: Role & Permissions Summary (1 Col) ── */}
        <div className="space-y-6">
          <Card>
            <CardHeader
              title={
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-brand" />
                  <span>Access & Role</span>
                </div>
              }
              subtitle="Your system assigned permissions and department"
            />
            <div className="p-5 space-y-4">
              <div className="rounded-xl border border-slate2-200 bg-slate2-50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate2-500">Assigned Role</span>
                  <Badge tone="brand">{user?.role?.name || "Member"}</Badge>
                </div>
                <p className="text-xs text-slate2-600 leading-relaxed">
                  {user?.role?.description || "Standard access permissions for Ahununu Logistics staff."}
                </p>
              </div>

              {user?.department && (
                <div className="rounded-xl border border-slate2-200 p-4 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate2-500">Department</span>
                    <span className="font-semibold text-slate2-800">{user.department.name}</span>
                  </div>
                  {user.department.code && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate2-500">Code</span>
                      <span className="font-mono text-slate2-600">{user.department.code}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Permissions list */}
              <div>
                <p className="text-xs font-semibold text-slate2-700 mb-2 flex items-center gap-1.5">
                  <Sparkles size={13} className="text-brand" /> Active Permissions ({user?.role?.permissions?.length || 0})
                </p>
                <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto pr-1">
                  {user?.role?.permissions && user.role.permissions.length > 0 ? (
                    user.role.permissions.map((p) => (
                      <span
                        key={p}
                        className="rounded bg-slate2-100 px-2 py-0.5 font-mono text-[11px] text-slate2-600 border border-slate2-200"
                      >
                        {p}
                      </span>
                    ))
                  ) : (
                    <p className="text-xs text-slate2-400">Standard view privileges</p>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
