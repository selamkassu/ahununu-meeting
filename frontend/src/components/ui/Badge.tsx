import React from "react";
import { ShieldAlert } from "lucide-react";

type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "brand";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-slate2-100 text-slate2-600",
  info: "bg-brand/10 text-brand",
  success: "bg-green-50 text-success",
  warning: "bg-amber-50 text-accent-dark",
  danger: "bg-red-50 text-danger",
  brand: "bg-brand/10 text-brand",
};

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${toneClasses[tone]}`}>
      {children}
    </span>
  );
}

export function statusTone(status: string): Tone {
  switch (status) {
    case "SCHEDULED":
      return "info";
    case "IN_PROGRESS":
      return "warning";
    case "PENDING_SIGNATURES":
      return "warning";
    case "READY_FOR_APPROVAL":
      return "info";
    case "APPROVED":
      return "brand";
    case "FORCE_APPROVED":
      return "warning";
    case "COMPLETED":
      return "success";
    case "CANCELLED":
      return "danger";
    case "PENDING":
      return "neutral";
    case "OPEN":
      return "warning";
    case "IMPLEMENTED":
      return "success";
    case "REVERSED":
      return "danger";
    default:
      return "neutral";
  }
}

export function priorityTone(priority: string): Tone {
  switch (priority) {
    case "CRITICAL":
      return "danger";
    case "HIGH":
      return "warning";
    case "MEDIUM":
      return "info";
    default:
      return "neutral";
  }
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone(status)}>{status.replace(/_/g, " ")}</Badge>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  return <Badge tone={priorityTone(priority)}>{priority}</Badge>;
}

export function ForceApprovedBadge({ reason }: { reason?: string | null }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 text-[11px] font-bold tracking-wide shadow-2xs"
      title={reason ? `Force Approved: ${reason}` : "Approved with administrative force override"}
    >
      <ShieldAlert size={12} className="text-amber-700 shrink-0" />
      <span>FORCE APPROVED</span>
    </span>
  );
}

