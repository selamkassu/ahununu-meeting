import React from "react";
import { useNavigate } from "react-router-dom";
import { ShieldAlert, ArrowLeft, LayoutDashboard, KeyRound } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { PERMISSION_LABELS } from "../../types";

interface AccessDeniedProps {
  permission?: string;
  resourceName?: string;
}

export function AccessDenied({ permission, resourceName }: AccessDeniedProps) {
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();

  const roleName = user?.role?.name || "Standard User";
  const requiredLabel = permission ? PERMISSION_LABELS[permission] || permission : undefined;
  const targetName = resourceName || (requiredLabel ? requiredLabel.replace(/^(View|Create|Edit|Delete|Manage)\s+/i, "") : "this area");

  const canViewDashboard = hasPermission("dashboard:view");
  const canViewMeetings = hasPermission("meetings:view");

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-12 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate2-100 text-slate2-700 shadow-2xs">
        <ShieldAlert size={28} className="text-slate2-600" />
      </div>

      <div className="mt-5 max-w-md space-y-2">
        <h2 className="font-display text-2xl font-bold tracking-tight text-slate2-900">
          Access restricted
        </h2>
        <p className="text-sm leading-relaxed text-slate2-500">
          Your account role does not have authorization to view {targetName}.
          Contact your workspace administrator if your responsibilities require access to this section.
        </p>
      </div>

      <div className="mt-6 w-full max-w-sm rounded-xl border border-slate2-200/90 bg-white p-4 text-left shadow-2xs">
        <div className="flex items-center gap-2 border-b border-slate2-100 pb-2.5 text-xs font-semibold text-slate2-700">
          <KeyRound size={14} className="text-brand" />
          <span>Authorization details</span>
        </div>
        <dl className="mt-3 space-y-2 text-xs">
          <div className="flex justify-between gap-3">
            <dt className="text-slate2-400">Assigned role</dt>
            <dd className="font-semibold text-slate2-800 text-right">{roleName}</dd>
          </div>
          {requiredLabel && (
            <div className="flex justify-between gap-3">
              <dt className="text-slate2-400">Required capability</dt>
              <dd className="font-mono text-[11px] font-medium text-brand text-right">{requiredLabel}</dd>
            </div>
          )}
          {permission && (
            <div className="flex justify-between gap-3">
              <dt className="text-slate2-400">Permission key</dt>
              <dd className="font-mono text-[11px] text-slate2-500 text-right">{permission}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate2-200 bg-white px-4 py-2 text-xs font-semibold text-slate2-700 shadow-2xs hover:bg-slate2-50 hover:border-slate2-300 transition-colors cursor-pointer"
        >
          <ArrowLeft size={14} />
          Go back
        </button>

        {canViewDashboard ? (
          <button
            type="button"
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-brand-dark transition-colors cursor-pointer"
          >
            <LayoutDashboard size={14} />
            Dashboard
          </button>
        ) : canViewMeetings ? (
          <button
            type="button"
            onClick={() => navigate("/meetings")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-brand-dark transition-colors cursor-pointer"
          >
            Go to Meetings
          </button>
        ) : (
          <button
            type="button"
            onClick={() => navigate("/profile")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-brand-dark transition-colors cursor-pointer"
          >
            My Profile
          </button>
        )}
      </div>
    </div>
  );
}
