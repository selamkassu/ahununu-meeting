import React from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  CalendarDays,
  Users2,
  ListChecks,
  Building2,
  Bell,
  BarChart3,
  Settings,
  ClipboardList,
  Gavel,
  NotebookText,
  Paperclip,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { Logo } from "../ui/Logo";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true, permission: "dashboard:view" },
  { to: "/meetings", label: "Meetings", icon: CalendarDays, permission: "meetings:view" },
  { to: "/calendar", label: "Calendar", icon: CalendarDays, permission: "meetings:view" },
  { to: "/agenda", label: "Agenda", icon: ClipboardList, permission: "agenda:view" },
  { to: "/minutes", label: "Meeting Minutes", icon: NotebookText, permission: "minutes:view" },
  { to: "/decisions", label: "Decisions", icon: Gavel, permission: "decisions:view" },
  { to: "/action-items", label: "Action Items", icon: ListChecks, permission: "action_items:view" },
  { to: "/departments", label: "Departments", icon: Building2, permission: "departments:view" },
  { to: "/users", label: "Users", icon: Users2, permission: "users:view" },
  { to: "/roles", label: "Roles", icon: ShieldCheck, permission: "roles:view" },
  { to: "/documents", label: "Documents", icon: Paperclip, permission: "documents:view" },
  { to: "/notifications", label: "Notifications", icon: Bell, permission: "notifications:view" },
  { to: "/reports", label: "Reports", icon: BarChart3, permission: "reports:view" },
  { to: "/settings", label: "Settings", icon: Settings, permission: "settings:view" },
];

export function Sidebar({ variant = "desktop", onNavigate }: { variant?: "desktop" | "mobile"; onNavigate?: () => void }) {
  const { hasPermission } = useAuth();

  const wrapperClass =
    variant === "desktop"
      ? "fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate2-200 bg-white text-slate2-700 lg:flex no-print"
      : "flex h-full w-64 flex-col border-r border-slate2-200 bg-white text-slate2-700 no-print";

  return (
    <aside className={wrapperClass}>
      {/* Brand logo header */}
      <div className="border-b border-slate2-100 px-5 py-4">
        <Logo size={40} withText />
      </div>

      {/* Nav items list */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {nav
          .filter((item) => !item.permission || hasPermission(item.permission))
          .map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                `focus-ring group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all ${
                  isActive
                    ? "bg-brand text-white shadow-sm"
                    : "text-slate2-600 hover:bg-slate2-50 hover:text-slate2-900"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon
                    size={18}
                    strokeWidth={isActive ? 2.2 : 1.8}
                    className={isActive ? "text-white" : "text-slate2-400 group-hover:text-slate2-600"}
                  />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
      </nav>

      {/* Need help? card */}
      <div className="border-t border-slate2-100 p-4">
        <div className="rounded-xl border border-accent/40 bg-accent/20 p-3.5">
          <p className="text-xs font-bold text-brand">Need help?</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate2-500">
            Contact the portal admin or meeting secretary for support.
          </p>
        </div>
      </div>
    </aside>
  );
}
