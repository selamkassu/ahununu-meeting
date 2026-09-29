import React from "react";
import { Mail } from "lucide-react";
import { Card, CardHeader, Field, inputClass, Button } from "../components/ui/Primitives";
import { Logo } from "../components/ui/Logo";
import { useAuth } from "../context/AuthContext";

const BRAND_COLORS = [
  { name: "Primary Green", hex: "#0B7A6B" },
  { name: "Secondary Light Green", hex: "#AED580" },
  { name: "Success", hex: "#1F9D63" },
  { name: "Danger", hex: "#D64545" },
];

export default function SettingsPage() {
  const { user, hasPermission } = useAuth();
  const isAdmin = hasPermission("settings:manage") || hasPermission("ADMIN_OVERRIDE");

  return (
    <div className="space-y-4">
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

      <Card>
        <CardHeader title="Email Notification Template" subtitle="Preview of the branded email sent for meeting invites" />
        <div className="p-5">
          <div className="mx-auto max-w-md overflow-hidden rounded-xl border border-slate2-200">
            <div className="flex items-center gap-2 bg-brand-dark px-5 py-4 text-white">
              <Logo size={24} withText textVariant="light" subtitle="" />
            </div>
            <div className="space-y-3 bg-white px-5 py-5">
              <p className="flex items-center gap-1.5 text-xs text-slate2-400">
                <Mail size={12} /> You've been invited to a meeting
              </p>
              <p className="text-sm text-slate2-700">Hi Hana,</p>
              <p className="text-sm text-slate2-600">
                You're invited to <span className="font-medium text-slate2-800">Warehouse Capacity Planning — Kality Site</span>{" "}
                on Monday, September 7 at 9:30 AM, organized by Robel Kassa.
              </p>
              <button className="w-full rounded-lg bg-brand py-2 text-sm font-medium text-white">View meeting details</button>
              <p className="text-center text-[11px] text-slate2-400">
                Ahununu Logistics – Meeting Management Portal · This is an automated notification
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <p className="text-xs text-slate2-500">
          Signed in as <span className="font-medium text-slate2-700">{user?.name}</span> ({user?.email}). Integration settings for
          PAS, DMS, Finance, SMS and HR systems will appear here once those connections are configured.
        </p>
      </Card>
    </div>
  );
}
