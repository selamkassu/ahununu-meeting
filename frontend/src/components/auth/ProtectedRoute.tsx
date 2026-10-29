import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { AccessDenied } from "./AccessDenied";

interface ProtectedRouteProps {
  permission?: string;
  anyPermissions?: string[];
  allPermissions?: string[];
  resourceName?: string;
  children: React.ReactNode;
}

export function ProtectedRoute({
  permission,
  anyPermissions,
  allPermissions,
  resourceName,
  children,
}: ProtectedRouteProps) {
  const { user, loading, hasPermission, hasAnyPermission } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  let authorized = true;

  if (permission) {
    authorized = hasPermission(permission);
  } else if (anyPermissions && anyPermissions.length > 0) {
    authorized = hasAnyPermission(...anyPermissions);
  } else if (allPermissions && allPermissions.length > 0) {
    authorized = allPermissions.every((p) => hasPermission(p));
  }

  if (!authorized) {
    const permHint = permission || anyPermissions?.[0] || allPermissions?.[0];
    return <AccessDenied permission={permHint} resourceName={resourceName} />;
  }

  return <>{children}</>;
}

/**
 * Intelligent home redirector: If user has `dashboard:view`, renders Dashboard.
 * Otherwise, smoothly navigates them to their highest priority accessible section
 * (e.g. Meetings, Action Items, or Profile) rather than stranding them on a 403 page.
 */
export function DashboardGate({ children }: { children: React.ReactNode }) {
  const { user, loading, hasPermission } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (hasPermission("dashboard:view")) {
    return <>{children}</>;
  }

  // Graceful fallback to first permitted section
  if (hasPermission("meetings:view")) return <Navigate to="/meetings" replace />;
  if (hasPermission("action_items:view")) return <Navigate to="/action-items" replace />;
  if (hasPermission("agenda:view")) return <Navigate to="/agenda" replace />;
  if (hasPermission("minutes:view")) return <Navigate to="/minutes" replace />;
  if (hasPermission("decisions:view")) return <Navigate to="/decisions" replace />;
  if (hasPermission("documents:view")) return <Navigate to="/documents" replace />;
  if (hasPermission("departments:view")) return <Navigate to="/departments" replace />;
  if (hasPermission("users:view")) return <Navigate to="/users" replace />;
  if (hasPermission("users:approve")) return <Navigate to="/admin/user-approvals" replace />;
  if (hasPermission("roles:view")) return <Navigate to="/roles" replace />;
  if (hasPermission("reports:view")) return <Navigate to="/reports" replace />;
  if (hasPermission("settings:view")) return <Navigate to="/settings" replace />;

  return <Navigate to="/profile" replace />;
}
