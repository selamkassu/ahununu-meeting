import React, { useState, useEffect } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { Loader2, Mail, AlertCircle, CheckCircle2, Eye, EyeOff, Sparkles, Building2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Button, Field, inputClass } from "../components/ui/Primitives";
import { Logo } from "../components/ui/Logo";
import { Modal } from "../components/ui/Modal";
import { GoogleAuthButton } from "../components/auth/GoogleAuthButton";
import { api } from "../api/client";

interface DepartmentOption {
  id: string;
  name: string;
  code: string;
}

export default function Login() {
  const { login, register, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Tab state: "signin" | "signup"
  const [activeTab, setActiveTab] = useState<"signin" | "signup">("signin");

  // Sign In form fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Sign Up form fields
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regShowPassword, setRegShowPassword] = useState(false);
  const [regDepartmentId, setRegDepartmentId] = useState("");
  const [regJobTitle, setRegJobTitle] = useState("");
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);

  // Submission & feedback states
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [suggestSignUp, setSuggestSignUp] = useState(false);

  // Forgot password modal state
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);

  // Pending approval modal state
  const [pendingModalOpen, setPendingModalOpen] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  // Load public department list for registration
  useEffect(() => {
    api.get<DepartmentOption[]>("/auth/departments")
      .then((data) => {
        if (Array.isArray(data)) setDepartments(data);
      })
      .catch(() => {});
  }, []);

  if (user) {
    const from = (location.state as any)?.from?.pathname || "/";
    return <Navigate to={from} replace />;
  }

  const navigateToDestination = () => {
    const from = (location.state as any)?.from?.pathname || "/";
    navigate(from, { replace: true });
  };

  // Regular password Sign In
  const onSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSuggestSignUp(false);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigateToDestination();
    } catch (err: any) {
      setError(err.message || "Invalid work email or password. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Regular password Sign Up
  const onSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSuggestSignUp(false);

    if (regPassword.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await register({
        name: regName.trim(),
        email: regEmail.trim(),
        password: regPassword,
        departmentId: regDepartmentId || undefined,
        jobTitle: regJobTitle.trim() || undefined,
      });
      if (res?.isPending) {
        setPendingMessage(
          res.message ||
            "Your registration was received and is pending administrator approval and role assignment. You will receive an email once an administrator approves your account."
        );
        setPendingModalOpen(true);
        setActiveTab("signin");
        setRegPassword("");
      } else {
        navigateToDestination();
      }
    } catch (err: any) {
      setError(err.message || "Account creation failed. Please check your information.");
    } finally {
      setSubmitting(false);
    }
  };

  // Google OAuth Success Handler
  const handleGoogleSuccess = (isNewUser: boolean, isPending?: boolean, message?: string) => {
    if (isPending) {
      setPendingMessage(
        message ||
          "Your Google sign-up was successful! Your account is currently stored as Pending with an Unassigned role. An authorized administrator will assign your corporate role and activate your account."
      );
      setPendingModalOpen(true);
      setActiveTab("signin");
      return;
    }
    if (isNewUser) {
      setSuccessMsg("Welcome to Ahununu Logistics Portal! Your account was created successfully.");
    }
    navigateToDestination();
  };

  // Google OAuth Error Handler
  const handleGoogleError = (errorMessage: string) => {
    setError(errorMessage);
    if (errorMessage.toLowerCase().includes("no existing account") || errorMessage.toLowerCase().includes("sign up")) {
      setSuggestSignUp(true);
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
      {/* Pending Approval Modal */}
      <Modal
        open={pendingModalOpen}
        onClose={() => setPendingModalOpen(false)}
        title="Registration Submitted"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200/80 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-700">
              <Sparkles size={20} />
            </div>
            <div className="text-xs">
              <p className="font-bold text-amber-950 text-sm">
                Account Awaiting Administrative Approval
              </p>
              <p className="mt-1.5 text-amber-900/90 leading-relaxed">
                {pendingMessage ||
                  "Your registration was received. As part of corporate governance, new registrations are stored with Status 'Pending' and Role 'Unassigned' until approved by an administrator."}
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-2 border-t border-slate2-100">
            <Button
              type="button"
              variant="primary"
              onClick={() => setPendingModalOpen(false)}
            >
              Understood, Back to Sign In
            </Button>
          </div>
        </div>
      </Modal>

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
        <div className="w-full max-w-md rounded-2xl border border-slate2-200 bg-white p-7 shadow-card transition-all duration-300">
          <div className="mb-6 flex flex-col items-center justify-center text-center">
            <Logo size={42} withText textVariant="dark" />
            <p className="mt-2 text-xs font-medium text-slate2-500">
              Meeting Management & Executive Decision Portal
            </p>
          </div>

          {/* Tab Selector: Sign In vs Sign Up */}
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-slate2-100/90 p-1 text-xs font-semibold text-slate2-600">
            <button
              type="button"
              onClick={() => {
                setActiveTab("signin");
                setError(null);
                setSuggestSignUp(false);
              }}
              className={`rounded-lg py-2 transition-all duration-150 ${
                activeTab === "signin"
                  ? "bg-white text-slate2-900 shadow-sm"
                  : "text-slate2-500 hover:text-slate2-800"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("signup");
                setError(null);
                setSuggestSignUp(false);
              }}
              className={`rounded-lg py-2 transition-all duration-150 ${
                activeTab === "signup"
                  ? "bg-white text-slate2-900 shadow-sm"
                  : "text-slate2-500 hover:text-slate2-800"
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* ═════════════════════════════════════════════════════════ */}
          {/* TAB 1: SIGN IN                                          */}
          {/* ═════════════════════════════════════════════════════════ */}
          {activeTab === "signin" && (
            <div className="space-y-4">
              {/* Google Sign In Button */}
              <GoogleAuthButton
                mode="signin"
                onSuccess={handleGoogleSuccess}
                onError={handleGoogleError}
              />

              {/* Elegant Divider */}
              <div className="relative flex items-center justify-center py-1">
                <div className="w-full border-t border-slate2-200" />
                <span className="absolute bg-white px-3 text-[11px] font-medium uppercase tracking-wider text-slate2-400">
                  or with work credentials
                </span>
              </div>

              {/* Standard Password Login Form */}
              <form onSubmit={onSignInSubmit} className="space-y-3.5">
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
                      autoComplete="current-password"
                      className={`${inputClass} pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate2-400 hover:text-slate2-600 focus:outline-none cursor-pointer"
                      title={showPassword ? "Hide password" : "Show password"}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
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
                  <div className="space-y-2">
                    <div className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
                      <AlertCircle size={16} className="shrink-0 text-rose-600 mt-0.5" />
                      <span>{error}</span>
                    </div>

                    {suggestSignUp && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab("signup");
                          setError(null);
                          setSuggestSignUp(false);
                        }}
                        className="w-full text-center text-xs font-semibold text-brand hover:underline"
                      >
                        Click here to create a new account with Google &rarr;
                      </button>
                    )}
                  </div>
                )}

                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting && <Loader2 size={15} className="animate-spin" />}
                  Sign In
                </Button>
              </form>

              <div className="pt-2 text-center text-xs text-slate2-500">
                Don't have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("signup");
                    setError(null);
                    setSuggestSignUp(false);
                  }}
                  className="font-semibold text-brand hover:underline cursor-pointer"
                >
                  Sign up with Google
                </button>
              </div>
            </div>
          )}

          {/* ═════════════════════════════════════════════════════════ */}
          {/* TAB 2: SIGN UP                                          */}
          {/* ═════════════════════════════════════════════════════════ */}
          {activeTab === "signup" && (
            <div className="space-y-4">
              {/* Google Sign Up Button */}
              <GoogleAuthButton
                mode="signup"
                departmentId={regDepartmentId || undefined}
                jobTitle={regJobTitle || undefined}
                onSuccess={handleGoogleSuccess}
                onError={handleGoogleError}
              />

              {/* Elegant Divider */}
              <div className="relative flex items-center justify-center py-1">
                <div className="w-full border-t border-slate2-200" />
                <span className="absolute bg-white px-3 text-[11px] font-medium uppercase tracking-wider text-slate2-400">
                  or register with work email
                </span>
              </div>

              {/* Standard Registration Form */}
              <form onSubmit={onSignUpSubmit} className="space-y-3">
                <Field label="Full Name" required>
                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="e.g. Abebe Kebede"
                    className={inputClass}
                  />
                </Field>

                <Field label="Work Email Address" required>
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="name@ahununulogistics.com"
                    className={inputClass}
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                </Field>

                <div>
                  <label className="block text-xs font-medium text-slate2-600 mb-1">
                    Password (min. 6 characters) <span className="text-danger">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={regShowPassword ? "text" : "password"}
                      required
                      minLength={6}
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Create a secure password"
                      autoComplete="new-password"
                      className={`${inputClass} pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setRegShowPassword((prev) => !prev)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate2-400 hover:text-slate2-600 focus:outline-none cursor-pointer"
                      title={regShowPassword ? "Hide password" : "Show password"}
                      aria-label={regShowPassword ? "Hide password" : "Show password"}
                    >
                      {regShowPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <Field label="Department (Optional)">
                    <select
                      value={regDepartmentId}
                      onChange={(e) => setRegDepartmentId(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">Select department...</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.code})
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Job Title (Optional)">
                    <input
                      type="text"
                      value={regJobTitle}
                      onChange={(e) => setRegJobTitle(e.target.value)}
                      placeholder="e.g. Operations Officer"
                      className={inputClass}
                    />
                  </Field>
                </div>

                {error && (
                  <div className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
                    <AlertCircle size={16} className="shrink-0 text-rose-600 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting && <Loader2 size={15} className="animate-spin" />}
                  Create Account
                </Button>
              </form>

              <div className="pt-2 text-center text-xs text-slate2-500">
                Already registered?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("signin");
                    setError(null);
                    setSuggestSignUp(false);
                  }}
                  className="font-semibold text-brand hover:underline cursor-pointer"
                >
                  Sign in to your account
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
