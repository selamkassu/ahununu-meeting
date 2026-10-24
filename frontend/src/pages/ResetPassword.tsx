import React, { useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { Loader2, CheckCircle2, AlertCircle, ArrowLeft, KeyRound } from "lucide-react";
import { api } from "../api/client";
import { Button, Field, inputClass } from "../components/ui/Primitives";
import { Logo } from "../components/ui/Logo";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("Missing or invalid password reset token. Please request a new link.");
      return;
    }

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match. Please verify both fields.");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/auth/reset-password", { token, newPassword });
      setSuccess(true);
    } catch (err: any) {
      setError(err?.message || "Failed to reset password. The link may have expired.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate2-50 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate2-200 bg-white p-8 shadow-card">
        <div className="mb-6 flex items-center justify-center">
          <Logo size={42} withText textVariant="dark" />
        </div>

        <div className="text-center mb-6">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-brand">
            <KeyRound size={22} />
          </div>
          <h2 className="font-display text-xl font-semibold text-slate2-800">
            Set New Password
          </h2>
          <p className="mt-1 text-xs text-slate2-500">
            Please choose a secure new password for your account.
          </p>
        </div>

        {success ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-xs text-emerald-800">
              <CheckCircle2 size={18} className="shrink-0 text-emerald-600 mt-0.5" />
              <div>
                <p className="font-semibold text-emerald-900 text-sm">Password reset complete!</p>
                <p className="mt-1 text-emerald-700">
                  Your account password has been updated. You can now sign in with your new credentials.
                </p>
              </div>
            </div>

            <Button
              type="button"
              variant="primary"
              onClick={() => navigate("/login")}
              className="w-full cursor-pointer"
            >
              Sign in now
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            {!token && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                <AlertCircle size={16} className="shrink-0 text-amber-600 mt-0.5" />
                <span>No reset token provided in URL. Please check the link in your email.</span>
              </div>
            )}

            <Field label="New Password" required>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                className={inputClass}
                minLength={6}
              />
            </Field>

            <Field label="Confirm New Password" required>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                className={inputClass}
                minLength={6}
              />
            </Field>

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
                <AlertCircle size={16} className="shrink-0 text-rose-600 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" disabled={submitting || !token} className="w-full cursor-pointer">
              {submitting && <Loader2 size={15} className="animate-spin" />}
              {submitting ? "Updating..." : "Update Password"}
            </Button>

            <div className="pt-2 text-center">
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate2-500 hover:text-brand"
              >
                <ArrowLeft size={13} /> Back to Sign In
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
