import React, { useEffect, useState } from "react";
import {
  Mail,
  Send,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  Server,
  Globe,
} from "lucide-react";
import { Card, CardHeader, Field, inputClass, Button } from "../components/ui/Primitives";
import { Logo } from "../components/ui/Logo";
import { useAuth } from "../context/AuthContext";
import { api, ApiError } from "../api/client";

const BRAND_COLORS = [
  { name: "Primary Green", hex: "#0B7A6B" },
  { name: "Secondary Light Green", hex: "#AED580" },
  { name: "Success", hex: "#1F9D63" },
  { name: "Danger", hex: "#D64545" },
];

interface EmailStatus {
  configured: boolean;
  provider: "resend" | "brevo" | "sendgrid" | "smtp" | "gmail" | "none";
  providerName: string;
  senderEmail: string;
  appUrl: string;
  isCloudSafe: boolean;
  isRender: boolean;
  renderWarning: string | null;
}

export default function SettingsPage() {
  const { user, hasPermission } = useAuth();
  const isAdmin = hasPermission("settings:manage") || hasPermission("ADMIN_OVERRIDE") || hasPermission("settings:edit");

  // Email service state
  const [emailStatus, setEmailStatus] = useState<EmailStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [testEmail, setTestEmail] = useState("");
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const fetchEmailStatus = async () => {
    setLoadingStatus(true);
    try {
      const data = await api.get<EmailStatus>("/notifications/email-status");
      setEmailStatus(data);
    } catch {
      // Ignored if unauthenticated or endpoint failure
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchEmailStatus();
  }, []);

  useEffect(() => {
    if (user?.email && !testEmail) {
      setTestEmail(user.email);
    }
  }, [user?.email]);

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmail.trim()) return;

    setIsSendingTest(true);
    setTestResult(null);

    try {
      const res = await api.post<{ ok: boolean; message: string }>("/notifications/test-email", {
        toEmail: testEmail.trim(),
      });
      setTestResult({
        ok: true,
        message: res.message || `Test email dispatched to ${testEmail.trim()}`,
      });
      fetchEmailStatus();
    } catch (err: any) {
      setTestResult({
        ok: false,
        message:
          err instanceof ApiError
            ? err.message
            : err?.message || "Failed to send test email. Please check server logs.",
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ──────────────────────────────────────────────────────────── */}
      {/* EMAIL & NOTIFICATION DELIVERY SERVICE (RENDER & CLOUD READY) */}
      {/* ──────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title={
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-brand" />
              <span>Email & Notification Delivery Service</span>
            </div>
          }
          subtitle="Configure outbound notification emails for meeting invites, cancellations, and action item assignments"
          action={
            <button
              onClick={fetchEmailStatus}
              disabled={loadingStatus}
              title="Refresh status"
              className="inline-flex items-center gap-1 rounded-lg border border-slate2-200 px-2.5 py-1.5 text-xs font-medium text-slate2-600 hover:bg-slate2-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingStatus ? "animate-spin" : ""}`} />
              Refresh
            </button>
          }
        />

        <div className="space-y-5 p-5">
          {/* Active Provider Banner */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Status Card */}
            <div className="rounded-xl border border-slate2-200 bg-slate2-50/50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate2-500">Service Status</span>
                {emailStatus?.configured ? (
                  emailStatus.isCloudSafe ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                      <ShieldCheck className="h-3 w-3" /> Ready (Cloud-Safe)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                      <AlertTriangle className="h-3 w-3" /> SMTP (Render Alert)
                    </span>
                  )
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate2-200 px-2.5 py-0.5 text-xs font-semibold text-slate2-700">
                    Not Configured
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm font-semibold text-slate2-800">
                {emailStatus?.providerName || (loadingStatus ? "Detecting..." : "Unconfigured")}
              </p>
            </div>

            {/* Sender Address */}
            <div className="rounded-xl border border-slate2-200 bg-slate2-50/50 p-4">
              <span className="text-xs font-medium text-slate2-500">Sender Address</span>
              <p className="mt-2 truncate font-mono text-xs font-medium text-slate2-800">
                {emailStatus?.senderEmail || "—"}
              </p>
            </div>

            {/* Portal Base URL (APP_URL) */}
            <div className="rounded-xl border border-slate2-200 bg-slate2-50/50 p-4">
              <span className="text-xs font-medium text-slate2-500">Email RSVP Link URL</span>
              <p className="mt-2 truncate font-mono text-xs font-medium text-slate2-800" title={emailStatus?.appUrl}>
                {emailStatus?.appUrl || "http://localhost:5173"}
              </p>
            </div>

            {/* Platform / Environment */}
            <div className="rounded-xl border border-slate2-200 bg-slate2-50/50 p-4">
              <span className="text-xs font-medium text-slate2-500">Platform Environment</span>
              <p className="mt-2 text-sm font-semibold text-slate2-800">
                {emailStatus?.isRender ? "Render Cloud" : "Localhost / Standard"}
              </p>
            </div>
          </div>

          {/* Render Warning / Guidance Alert (Crucial for User's Render issue) */}
          {emailStatus?.renderWarning && (
            <div className="rounded-xl border border-amber-300 bg-amber-50/90 p-4 text-amber-900">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
                <div className="space-y-2 text-xs">
                  <h4 className="font-bold text-sm text-amber-950">
                    Render Deployment Notice: Outbound SMTP Ports Blocked
                  </h4>
                  <p className="leading-relaxed">
                    Render's Free Tier blocks outbound network traffic to SMTP ports <strong>25, 465, and 587</strong>.
                    Standard Gmail SMTP will hang and fail when deployed on Render.
                  </p>
                  <p className="leading-relaxed">
                    <strong>To fix this on Render:</strong> Use an HTTP-based email API (Port 443, never blocked).
                    Add either of these to your Render Dashboard Environment Variables:
                  </p>
                  <div className="rounded-lg bg-amber-100/80 p-2.5 font-mono text-[11px] space-y-1">
                    <p>
                      <strong>Option 1 (Recommended):</strong> <span className="text-emerald-800 font-bold">RESEND_API_KEY</span>="re_..."
                      <span className="text-amber-700 ml-2">(Free 3,000 emails/mo at <a href="https://resend.com" target="_blank" rel="noreferrer" className="underline font-bold">resend.com</a>)</span>
                    </p>
                    <p>
                      <strong>Option 2:</strong> <span className="text-emerald-800 font-bold">BREVO_API_KEY</span>="xkeysib-..."
                      <span className="text-amber-700 ml-2">(Free 300 emails/day forever at <a href="https://brevo.com" target="_blank" rel="noreferrer" className="underline font-bold">brevo.com</a>)</span>
                    </p>
                    <p>
                      <strong>Ensure Frontend Link:</strong> <span className="text-emerald-800 font-bold">APP_URL</span>="https://your-frontend.onrender.com"
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Interactive Live Email Tester */}
          <div className="rounded-xl border border-slate2-200 bg-slate2-50/40 p-4">
            <h4 className="font-semibold text-sm text-slate2-800 mb-1 flex items-center gap-1.5">
              <Send className="h-4 w-4 text-brand" /> Test Live Email Dispatch
            </h4>
            <p className="text-xs text-slate2-500 mb-4">
              Send a real test notification to verify your email connection and deliverability right now.
            </p>

            <form onSubmit={handleSendTest} className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="Enter recipient email (e.g. name@company.com)"
                className={`${inputClass} max-w-md`}
                required
              />
              <Button type="submit" disabled={isSendingTest || !testEmail.trim()}>
                {isSendingTest ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" /> Dispatching Test...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" /> Send Test Notification
                  </>
                )}
              </Button>
            </form>

            {testResult && (
              <div
                className={`mt-4 rounded-lg p-3 text-xs flex items-start gap-2.5 ${
                  testResult.ok
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border border-rose-200 bg-rose-50 text-rose-900"
                }`}
              >
                {testResult.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-semibold">{testResult.ok ? "Delivery Confirmed" : "Delivery Failed"}</p>
                  <p className="mt-0.5">{testResult.message}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* COMPANY PROFILE */}
      {/* ──────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader title="Company Profile" subtitle="Shown on the login page, sidebar, header, reports and notifications" />
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          <Field label="Company name">
            <input defaultValue="Ahununu Logistics" disabled={!isAdmin} className={inputClass} />
          </Field>
          <Field label="Application title">
            <input defaultValue="Ahununu Logistics – Meeting Management Portal" disabled={!isAdmin} className={inputClass} />
          </Field>
          <Field label="Support email">
            <input defaultValue="portal-support@ahununulogistics.com" disabled={!isAdmin} className={inputClass} />
          </Field>
          <Field label="Timezone">
            <input defaultValue="Africa/Addis_Ababa (EAT, UTC+3)" disabled={!isAdmin} className={inputClass} />
          </Field>
        </div>
        {isAdmin && (
          <div className="flex justify-end border-t border-slate2-100 p-4">
            <Button>Save changes</Button>
          </div>
        )}
      </Card>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* BRAND COLORS */}
      {/* ──────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader title="Brand Colors" subtitle="Reused across every component — update once here to rebrand the whole portal" />
        <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
          {BRAND_COLORS.map((c) => (
            <div key={c.hex} className="overflow-hidden rounded-lg border border-slate2-200">
              <div className="h-14" style={{ backgroundColor: c.hex }} />
              <div className="p-2">
                <p className="text-xs font-medium text-slate2-700">{c.name}</p>
                <p className="font-mono text-[11px] text-slate2-400">{c.hex}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* OFFICIAL LOGO */}
      {/* ──────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader title="Official Logo" subtitle="The official mark used across the sidebar, login page and reports" />
        <div className="flex items-center gap-4 p-5">
          <Logo size={56} />
          <div>
            <p className="font-semibold text-sm text-slate2-800">Ahununu Logistics Official Mark</p>
            <p className="text-sm text-slate2-600">
              Logo components are centralized — using the official circular Ahununu emblem across the sidebar, login screen, header and generated reports.
            </p>
          </div>
        </div>
      </Card>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* EMAIL NOTIFICATION TEMPLATE PREVIEW */}
      {/* ──────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader title="Email Notification Template" subtitle="Live preview of the responsive branded email template received by participants" />
        <div className="p-5">
          <div className="mx-auto max-w-md overflow-hidden rounded-xl border border-slate2-200 shadow-sm">
            <div className="flex items-center gap-2 bg-[#0b7a6b] px-5 py-4 text-white">
              <Logo size={24} withText textVariant="light" subtitle="" />
            </div>
            <div className="space-y-3 bg-white px-5 py-5">
              <p className="flex items-center gap-1.5 text-xs text-slate2-500 font-semibold uppercase tracking-wider">
                <Mail size={12} className="text-[#0b7a6b]" /> Meeting Invitation
              </p>
              <p className="text-sm font-semibold text-slate2-800">Hello Hana,</p>
              <p className="text-sm text-slate2-600 leading-relaxed">
                You have been invited by <span className="font-semibold text-slate2-800">Robel Kassa</span> to attend:
              </p>
              <div className="rounded-lg border border-slate2-200 border-l-4 border-l-[#0b7a6b] bg-slate2-50 p-3 text-xs space-y-1">
                <p className="font-bold text-slate2-900 text-sm">Warehouse Capacity Planning — Kality Site</p>
                <p className="text-slate2-600"><strong>When:</strong> Monday, September 7, 2026 (09:30 – 10:30)</p>
                <p className="text-slate2-600"><strong>Location:</strong> Main Logistics HQ</p>
              </div>
              <div className="flex gap-2 pt-2">
                <button className="flex-1 rounded-lg bg-[#0b7a6b] py-2 text-xs font-bold text-white shadow-sm">
                  ✓ Accept Invitation
                </button>
                <button className="flex-1 rounded-lg border border-rose-300 bg-white py-2 text-xs font-bold text-rose-700">
                  ✕ Decline
                </button>
              </div>
              <p className="text-center text-[11px] text-slate2-400 pt-2 border-t border-slate2-100">
                Ahununu Logistics – Meeting Management Portal · Automated notification
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <p className="text-xs text-slate2-500">
          Signed in as <span className="font-medium text-slate2-700">{user?.name}</span> ({user?.email}). Outbound email delivery
          is integrated with automated RSVP processing and task assignments.
        </p>
      </Card>
    </div>
  );
}
