import React, { useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { X, Truck } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useAuth } from "../../context/AuthContext";

const titles: Record<string, string> = {
  "/": "Dashboard",
  "/meetings": "Meetings",
  "/calendar": "Calendar",
  "/agenda": "Agenda",
  "/minutes": "Meeting Minutes",
  "/decisions": "Decisions",
  "/action-items": "Action & Accountability",
  "/departments": "Departments",
  "/users": "Users",
  "/documents": "Documents",
  "/notifications": "Notifications",
  "/reports": "Reports",
  "/settings": "Settings",
};

function pageTitle(pathname: string): string {
  if (titles[pathname]) return titles[pathname];
  const base = "/" + pathname.split("/")[1];
  return titles[base] || "Ahununu Logistics";
}

export function AppLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate2-50">
        <div className="flex items-center gap-2 text-slate2-400">
          <Truck size={18} className="animate-pulse" />
          <span className="text-sm">Loading Ahununu Logistics Meeting Portal…</span>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  return (
    <div className="min-h-screen bg-slate2-50">
      <Sidebar />

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate2-800/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute -right-9 top-3 rounded-md bg-white/10 p-1.5 text-white hover:bg-white/20"
            >
              <X size={16} />
            </button>
            <Sidebar variant="mobile" onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <Header title={pageTitle(location.pathname)} onMenuClick={() => setMobileOpen(true)} />
        <main className="px-4 py-6 lg:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
