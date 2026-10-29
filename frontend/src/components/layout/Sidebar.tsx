import React, { useState, useRef, useEffect } from "react";
import { NavLink, Link, useNavigate } from "react-router-dom";
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
  User,
  UserCheck,
  ChevronsUpDown,
  LogOut,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api/client";
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
  { to: "/admin/user-approvals", label: "User Approvals", icon: UserCheck, permission: "users:approve", badgeKey: "approvals" },
  { to: "/roles", label: "Roles", icon: ShieldCheck, permission: "roles:view" },
  { to: "/documents", label: "Documents", icon: Paperclip, permission: "documents:view" },
  { to: "/notifications", label: "Notifications", icon: Bell, permission: "notifications:view" },
  { to: "/reports", label: "Reports", icon: BarChart3, permission: "reports:view" },
  { to: "/settings", label: "Settings", icon: Settings, permission: "settings:view" },
];

export function Sidebar({ variant = "desktop", onNavigate }: { variant?: "desktop" | "mobile"; onNavigate?: () => void }) {
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasPermission("users:approve")) return;
    let mounted = true;
    const fetchCount = () => {
      api.get<{ count: number }>("/users/approvals/count")
        .then((res) => {
          if (mounted && typeof res?.count === "number") {
            setPendingApprovalsCount(res.count);
          }
        })
        .catch(() => {});
    };
    fetchCount();
    const interval = setInterval(fetchCount, 25000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [hasPermission]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
                  <span className="truncate">{item.label}</span>
                  {item.badgeKey === "approvals" && pendingApprovalsCount > 0 && (
                    <span
                      className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-black tracking-tight ${
                        isActive
                          ? "bg-white text-brand"
                          : "bg-amber-500 text-white shadow-sm"
                      }`}
                    >
                      {pendingApprovalsCount}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
      </nav>

      {/* User profile footer card with popover */}
      <div className="relative border-t border-slate2-100 p-3" ref={userMenuRef}>
        {userMenuOpen && (
          <div className="absolute bottom-full left-3 mb-2 w-64 rounded-2xl border border-slate2-200/90 bg-white p-2 shadow-2xl z-50">
            <Link
              to="/profile"
              onClick={() => {
                setUserMenuOpen(false);
                onNavigate?.();
              }}
              className="flex items-center gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-slate2-50 group"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate2-200 bg-white text-slate2-600 transition-colors group-hover:border-brand/40 group-hover:text-brand">
                <User size={18} strokeWidth={1.8} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate2-800 group-hover:text-brand">Profile</p>
                <p className="text-xs text-slate2-400">Personal details</p>
              </div>
            </Link>

            <Link
              to="/settings"
              onClick={() => {
                setUserMenuOpen(false);
                onNavigate?.();
              }}
              className="flex items-center gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-slate2-50 group"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate2-200 bg-white text-teal-600 transition-colors group-hover:border-brand/40 group-hover:text-brand">
                <Settings size={18} strokeWidth={1.8} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate2-800 group-hover:text-brand">Settings</p>
                <p className="text-xs text-slate2-400">Credentials & active sessions</p>
              </div>
            </Link>

            <div className="my-1.5 border-t border-slate2-100" />

            <button
              onClick={() => {
                setUserMenuOpen(false);
                logout();
                navigate("/login");
              }}
              className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-rose-50/70 group cursor-pointer"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-200/80 bg-rose-50 text-rose-600 transition-colors group-hover:bg-rose-100/80">
                <LogOut size={18} strokeWidth={1.8} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-rose-600">Sign out</p>
              </div>
            </button>
          </div>
        )}

        <button
          onClick={() => setUserMenuOpen((v) => !v)}
          className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-slate2-100 cursor-pointer focus:outline-none"
        >
          <div className="relative shrink-0">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold text-slate2-800"
              style={{ backgroundColor: user?.avatarColor || "#AED580" }}
            >
              {user?.name
                ? user.name
                    .split(" ")
                    .map((p) => p[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()
                : "U"}
            </div>
            <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-slate2-800 truncate">
              {user?.name}
            </p>
            <p className="text-[11px] text-slate2-400 truncate">
              {user?.email}
            </p>
          </div>
          <ChevronsUpDown size={15} className="text-slate2-400 shrink-0" />
        </button>
      </div>
    </aside>
  );
}
