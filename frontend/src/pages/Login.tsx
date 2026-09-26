import React, { useState } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Button, Field, inputClass } from "../components/ui/Primitives";
import { Logo } from "../components/ui/Logo";

const DEMO_ACCOUNTS = [
  { label: "Super Admin", email: "dawit.bekele@ahununulogistics.com" },
  { label: "Management (CEO)", email: "selamawit.tesfaye@ahununulogistics.com" },
  { label: "Department Manager", email: "hana.alemu@ahununulogistics.com" },
  { label: "Meeting Organizer", email: "abenezer.solomon@ahununulogistics.com" },
  { label: "Employee", email: "samuel.wolde@ahununulogistics.com" },
];

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("Ahununu@123");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="flex min-h-screen bg-brand-dark">
      {/* Left: brand panel */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-brand-dark p-12 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-light/30 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />

        <div className="relative">
          <Logo size={46} withText textVariant="light" />
        </div>

        <div className="relative max-w-md">
          <p className="font-display text-3xl font-semibold leading-tight">
            Every decision tracked. <br /> Every action delivered.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-white/60">
            From agenda to action item, Ahununu Logistics gives every meeting a manifest — so no
            decision or assigned task ever goes missing in transit.
          </p>
        </div>

        <div className="relative flex gap-8 text-xs text-white/50">
          <div>
            <p className="font-display text-xl font-semibold text-white">13</p>
            <p>Portal modules</p>
          </div>
          <div>
            <p className="font-display text-xl font-semibold text-white">9</p>
            <p>Departments</p>
          </div>
          <div>
            <p className="font-display text-xl font-semibold text-white">5</p>
            <p>Access roles</p>
          </div>
        </div>
      </div>

      {/* Right: form */}
      <div className="flex w-full flex-col justify-center bg-slate2-50 px-6 py-12 lg:w-1/2 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo size={40} withText textVariant="dark" />
          </div>

          <h2 className="font-display text-2xl font-semibold text-slate2-800">Sign in</h2>
          <p className="mt-1 text-sm text-slate2-500">Access your meetings, decisions and action items.</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <Field label="Work email or Username" required>
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
            <Field label="Password" required>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
            </Field>

            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-danger">
                {error}
              </p>
            )}

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting && <Loader2 size={15} className="animate-spin" />}
              Sign in
            </Button>
          </form>

          <div className="mt-8 rounded-xl border border-slate2-200 bg-white p-4">
            <p className="mb-2 text-xs font-semibold text-slate2-600">Demo accounts (password: Ahununu@123)</p>
            <div className="flex flex-wrap gap-1.5">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => {
                    setEmail(acc.email);
                    setPassword("Ahununu@123");
                  }}
                  className="focus-ring rounded-full border border-slate2-200 px-2.5 py-1 text-[11px] text-slate2-600 hover:border-brand hover:text-brand"
                >
                  {acc.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
