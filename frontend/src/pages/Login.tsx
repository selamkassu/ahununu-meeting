import React, { useState } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { Loader2, Mail, AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Button, Field, inputClass } from "../components/ui/Primitives";
import { Logo } from "../components/ui/Logo";
import { Modal } from "../components/ui/Modal";
import { api } from "../api/client";

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Forgot password modal state
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);

  if (user) {
    const from = (location.state as any)?.from?.pathname || "/";
    return <Navigate to={from} replace />;
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      const from = (location.state as any)?.from?.pathname || "/";
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err.message || "Invalid work email or password. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const openForgotModal = () => {
    setForgotModalOpen(true);
    setForgotEmail(email.includes("@") ? email.trim() : "");
    setForgotError(null);
    setForgotSuccess(null);
  };

  const closeForgotModal = () => {
    if (!forgotSubmitting) {
      setForgotModalOpen(false);
      setForgotError(null);
      setForgotSuccess(null);
    }
  };

  const onForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);
    setForgotSuccess(null);

    const trimmed = forgotEmail.trim();
    if (!trimmed) {
      setForgotError("Please enter your work email address.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      setForgotError("Please enter a valid email address (e.g. name@ahununulogistics.com).");
      return;
    }

    setForgotSubmitting(true);
    try {
      const res = await api.post<{ message: string }>("/auth/forgot-password", {
        email: trimmed,
      });
      setForgotSuccess(
        res?.message ||
          "A password reset link has been dispatched to your work email. Please check your inbox."
      );
    } catch (err: any) {
      setForgotError(err?.message || "Failed to send reset link. Please try again.");
    } finally {
      setForgotSubmitting(false);
    }
  };

  return (
    <>
      {/* Forgot Password Modal */}
      <Modal
        open={forgotModalOpen}
        onClose={closeForgotModal}
        title="Reset Your Password"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg bg-teal-50/70 border border-teal-200/80 p-3.5">
            <Mail className="shrink-0 text-brand mt-0.5" size={20} />
            <div className="text-xs">
              <p className="font-semibold text-slate2-800">
                Forgot your account password?
              </p>
              <p className="mt-1 text-slate2-600 leading-relaxed">
                Enter your registered work email address below. We will send you a secure verification link to reset your account password.
              </p>
            </div>
          </div>

          {forgotSuccess ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2.5 rounded-lg bg-emerald-50 border border-emerald-200 p-3.5 text-xs text-emerald-800">
                <CheckCircle2 size={18} className="shrink-0 text-emerald-600 mt-0.5" />
                <div>
                  <p className="font-semibold text-emerald-900">Reset instructions sent!</p>
                  <p className="mt-1 leading-relaxed text-emerald-700">{forgotSuccess}</p>
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate2-100">
                <Button
                  type="button"
                  variant="primary"
                  onClick={closeForgotModal}
                >
                  Back to Sign in
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={onForgotSubmit} className="space-y-4">
              <Field label="Work Email Address" required>
                <input
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => {
                    setForgotEmail(e.target.value);
                    if (forgotError) setForgotError(null);
                  }}
                  placeholder="name@ahununulogistics.com"
                  className={inputClass}
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              </Field>

              {forgotError && (
                <div className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
                  <AlertCircle size={16} className="shrink-0 text-rose-600 mt-0.5" />
                  <span>{forgotError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate2-100">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={closeForgotModal}
                  disabled={forgotSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={forgotSubmitting}
                >
                  {forgotSubmitting && <Loader2 size={14} className="animate-spin" />}
                  {forgotSubmitting ? "Sending Link..." : "Send Reset Link"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </Modal>

      <div className="flex min-h-screen items-center justify-center bg-slate2-50 p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate2-200 bg-white p-8 shadow-card">
          <div className="mb-8 flex items-center justify-center">
            <Logo size={42} withText textVariant="dark" />
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Work Email or Username" required>
              <input
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@ahununulogistics.com or Username"
                className={inputClass}
                autoCapitalize="none"
                autoCorrect="off"
              />
            </Field>

            {/* Password field with show/hide password toggle and Forgot Password link */}
            <div>
              <label className="block text-xs font-medium text-slate2-600 mb-1">
                Password <span className="text-danger">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="new-password"
                  className={`${inputClass} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate2-400 hover:text-slate2-600 focus:outline-none cursor-pointer"
                  title={showPassword ? "Hide password" : "Show password"}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <div className="flex justify-end mt-1.5">
                <button
                  type="button"
                  onClick={openForgotModal}
                  className="text-xs font-medium text-brand hover:text-brand-dark hover:underline cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
                <AlertCircle size={16} className="shrink-0 text-rose-600 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting && <Loader2 size={15} className="animate-spin" />}
              Sign In
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}
