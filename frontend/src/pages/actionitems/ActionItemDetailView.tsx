import React, { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Copy,
  Check,
  Building2,
  Users,
  User,
  Sliders,
  FileText,
  Layers,
  ChevronRight,
  ShieldCheck,
  Flag,
} from "lucide-react";
import { api } from "../../api/client";
import type { ActionItem, ActionItemStatus } from "../../types";
import { getActionItemAssignees } from "../../types";
import { Avatar, ProgressBar, CodeChip, Card, CardHeader } from "../../components/ui/Primitives";
import { PriorityBadge, StatusBadge } from "../../components/ui/Badge";
import { Toast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";

interface ActionItemDetailViewProps {
  id: string;
}

const STATUS_OPTIONS: { status: ActionItemStatus; label: string; description: string }[] = [
  { status: "PENDING", label: "Pending", description: "Not yet started; queued for work" },
  { status: "IN_PROGRESS", label: "In Progress", description: "Active execution underway" },
  { status: "COMPLETED", label: "Completed", description: "Deliverable fulfilled & verified" },
  { status: "CANCELLED", label: "Cancelled", description: "Deliverable superseded or dropped" },
];

function formatDate(dateStr?: string | Date | null) {
  if (!dateStr) return "Not specified";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "Invalid date";
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getRelativeUrgency(deadlineStr: string, isCompleted: boolean) {
  if (isCompleted) {
    return { text: "Completed", tone: "success" as const, days: 0 };
  }
  const d = new Date(deadlineStr);
  const now = new Date();
  const dMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((dMidnight.getTime() - nowMidnight.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const days = Math.abs(diffDays);
    return {
      text: `${days} day${days === 1 ? "" : "s"} overdue`,
      tone: "danger" as const,
      days: diffDays,
    };
  }
  if (diffDays === 0) {
    return { text: "Due today", tone: "warning" as const, days: 0 };
  }
  if (diffDays === 1) {
    return { text: "Due tomorrow", tone: "warning" as const, days: 1 };
  }
  return {
    text: `Due in ${diffDays} days`,
    tone: "neutral" as const,
    days: diffDays,
  };
}

export function ActionItemDetailView({ id }: ActionItemDetailViewProps) {
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const [item, setItem] = useState<ActionItem | null>(null);
  const [relatedItems, setRelatedItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingProgress, setSavingProgress] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [progressDraft, setProgressDraft] = useState<number>(0);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  const loadItem = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<ActionItem>(`/action-items/${id}`);
      setItem(data);
      setProgressDraft(data.progressPercent ?? 0);

      // Load sibling items from the same meeting for contextual navigation
      if (data.meetingId) {
        try {
          const siblings = await api.get<ActionItem[]>(`/action-items?meetingId=${data.meetingId}`);
          setRelatedItems(siblings.filter((s) => s.id !== data.id));
        } catch {
          // Non-critical; ignore sibling load error
        }
      }
    } catch (err: any) {
      console.error("Failed to load action item:", err);
      setError(err.message || "Failed to load action item details.");
      setItem(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadItem();
  }, [loadItem]);

  const canEdit = Boolean(
    hasPermission("ADMIN_OVERRIDE") ||
    hasPermission("action_items:edit:all") ||
    hasPermission("meetings:edit:all") ||
    (user && item?.department?.id && user.departmentId === item.department.id && hasPermission("action_items:edit:dept")) ||
    (user && (item?.assignedTo?.id === user.id || item?.assignees?.some((a: any) => (a.id || a.userId) === user.id)))
  );

  const handleStatusChange = async (newStatus: ActionItemStatus) => {
    if (!item || item.status === newStatus || savingStatus) return;
    setSavingStatus(true);
    try {
      const payload: { status: ActionItemStatus; progressPercent?: number } = { status: newStatus };
      if (newStatus === "COMPLETED" && (item.progressPercent ?? 0) < 100) {
        payload.progressPercent = 100;
        setProgressDraft(100);
      }
      const updated = await api.put<ActionItem>(`/action-items/${item.id}`, payload);
      setItem(updated);
      setToast({
        message: `Task status updated to ${newStatus.replace("_", " ")}.`,
        type: "success",
      });
    } catch (err: any) {
      setToast({
        message: err.message || "Failed to update action item status.",
        type: "error",
      });
    } finally {
      setSavingStatus(false);
    }
  };

  const handleProgressCommit = async (val: number) => {
    if (!item || savingProgress) return;
    setSavingProgress(true);
    try {
      const payload: { progressPercent: number; status?: ActionItemStatus } = { progressPercent: val };
      if (val === 100 && item.status !== "COMPLETED") {
        payload.status = "COMPLETED";
      } else if (val > 0 && val < 100 && item.status === "PENDING") {
        payload.status = "IN_PROGRESS";
      }
      const updated = await api.put<ActionItem>(`/action-items/${item.id}`, payload);
      setItem(updated);
      setToast({
        message: `Execution progress updated to ${val}%.`,
        type: "success",
      });
    } catch (err: any) {
      setToast({
        message: err.message || "Failed to update progress.",
        type: "error",
      });
    } finally {
      setSavingProgress(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setToast({ message: "Task link copied to clipboard.", type: "info" });
    setTimeout(() => setCopiedLink(false), 2200);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-5 w-48 animate-pulse rounded bg-slate2-200" />
        <div className="h-44 animate-pulse rounded-xl bg-slate2-100" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-72 animate-pulse rounded-xl bg-slate2-100" />
          <div className="h-72 animate-pulse rounded-xl bg-slate2-100" />
        </div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="space-y-6">
        <Link
          to="/action-items"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate2-500 hover:text-brand transition-colors"
        >
          <ArrowLeft size={14} /> Back to Action & Accountability Directory
        </Link>
        <Card className="p-8 text-center bg-white border border-slate2-200">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600 mb-3">
            <AlertTriangle size={24} />
          </div>
          <h2 className="text-base font-semibold text-slate2-800">Action Item Not Found</h2>
          <p className="mt-1 text-sm text-slate2-500 max-w-md mx-auto">
            {error || "The requested action item could not be found or you do not have permission to view it."}
          </p>
          <div className="mt-5">
            <Link
              to="/action-items"
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-brand-dark transition-all"
            >
              Return to Directory
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const assignees = getActionItemAssignees(item);
  const urgency = getRelativeUrgency(item.deadline, item.status === "COMPLETED");

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Navigation Breadcrumb */}
      <div className="flex items-center justify-between gap-4">
        <Link
          to="/action-items"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate2-500 hover:text-brand transition-colors"
        >
          <ArrowLeft size={14} /> Back to Action & Accountability Directory
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate2-600 bg-white hover:bg-slate2-50 border border-slate2-200 px-2.5 py-1.5 rounded-lg shadow-2xs transition-colors cursor-pointer"
            title="Copy shareable link to this action item"
          >
            {copiedLink ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
            <span>{copiedLink ? "Copied" : "Copy Link"}</span>
          </button>
          {item.meetingId && (
            <Link
              to={`/meetings/${item.meetingId}`}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-brand bg-brand/5 hover:bg-brand/10 border border-brand/20 px-2.5 py-1.5 rounded-lg transition-colors"
            >
              <span>View Meeting</span>
              <ExternalLink size={13} />
            </Link>
          )}
        </div>
      </div>

      {/* ── Executive Command Header Card ── */}
      <Card className="border border-slate2-200/90 shadow-sm bg-white">
        {/* Signature brand accent bar */}
        <div className="h-1 w-full bg-gradient-to-r from-brand via-brand-light to-accent rounded-t-xl" />

        <div className="p-5 sm:p-6 space-y-4">
          {/* Classification Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate2-100">
            <div className="flex flex-wrap items-center gap-2">
              <CodeChip>{item.code}</CodeChip>
              <PriorityBadge priority={item.priority} />
              <StatusBadge status={item.status} />
              {item.department?.name && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate2-100 text-slate2-700 font-medium text-xs">
                  {item.department.name}
                </span>
              )}
              {/* Urgency Pill */}
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  urgency.tone === "danger"
                    ? "bg-rose-50 text-rose-700 border border-rose-200"
                    : urgency.tone === "warning"
                    ? "bg-amber-50 text-amber-800 border border-amber-200"
                    : urgency.tone === "success"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-slate2-100 text-slate2-600"
                }`}
              >
                {urgency.tone === "danger" ? (
                  <AlertTriangle size={12} className="shrink-0" />
                ) : urgency.tone === "success" ? (
                  <CheckCircle2 size={12} className="shrink-0" />
                ) : (
                  <Clock size={12} className="shrink-0" />
                )}
                <span>{urgency.text}</span>
              </span>
            </div>

            {/* Target Deadline Tag */}
            <div className="flex items-center gap-1.5 text-xs text-slate2-500 font-medium">
              <Calendar size={13} className="text-slate2-400" />
              <span>Deadline: <strong className="text-slate2-700">{formatDate(item.deadline)}</strong></span>
            </div>
          </div>

          {/* Action Item Title */}
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate2-900 tracking-tight leading-snug">
              {item.title}
            </h1>
            {item.meeting && (
              <p className="text-xs text-slate2-500 mt-1 flex items-center gap-1.5 flex-wrap">
                <span>Originating decision mandated in</span>
                <Link
                  to={`/meetings/${item.meeting.id}`}
                  className="font-medium text-brand hover:underline inline-flex items-center gap-1"
                >
                  {item.meeting.title} ({item.meeting.code})
                </Link>
                {item.decision && (
                  <>
                    <span>· Resolution:</span>
                    <span className="font-mono text-slate2-600 bg-slate2-100 px-1.5 py-0.2 rounded text-[11px]">
                      {item.decision.code}
                    </span>
                  </>
                )}
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* ── Operational Status & Execution Control Bar ── */}
      {canEdit && (
        <Card className="border border-slate2-200 bg-white p-4 shadow-2xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Quick Status Setter */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-slate2-700">Update Task Status</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {STATUS_OPTIONS.map((opt) => {
                  const isActive = item.status === opt.status;
                  return (
                    <button
                      key={opt.status}
                      type="button"
                      disabled={savingStatus}
                      onClick={() => handleStatusChange(opt.status)}
                      className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                        isActive
                          ? "bg-brand text-white border-brand shadow-xs font-semibold"
                          : "bg-slate2-50 text-slate2-700 border-slate2-200 hover:bg-slate2-100 hover:border-slate2-300"
                      } disabled:opacity-50`}
                      title={opt.description}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick Progress Setter */}
            <div className="space-y-1.5 md:min-w-[280px]">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate2-700">Execution Progress</span>
                <span className="font-mono font-bold text-brand">{progressDraft}%</span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={progressDraft}
                  onChange={(e) => setProgressDraft(Number(e.target.value))}
                  onMouseUp={() => handleProgressCommit(progressDraft)}
                  onTouchEnd={() => handleProgressCommit(progressDraft)}
                  disabled={savingProgress}
                  className="w-full accent-brand cursor-pointer"
                />
                <div className="flex items-center gap-1 shrink-0">
                  {[25, 50, 75, 100].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => {
                        setProgressDraft(pct);
                        handleProgressCommit(pct);
                      }}
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate2-100 text-slate2-600 hover:bg-brand/10 hover:text-brand transition-colors cursor-pointer"
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ── Two-Column Structured Detail Content Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Deliverable Column (Left 2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card 1: Deliverable Requirements & Scope */}
          <Card className="border border-slate2-200 bg-white">
            <CardHeader
              title="Deliverable Scope & Instructions"
              subtitle="Detailed specifications and action criteria mandated for this task"
            />
            <div className="p-5 text-sm text-slate2-700 leading-relaxed">
              {item.description && item.description.trim() ? (
                <div className="whitespace-pre-line text-slate2-800 font-normal">
                  {item.description}
                </div>
              ) : (
                <div className="rounded-lg bg-slate2-50 border border-slate2-100 p-4 text-xs text-slate2-500">
                  <p className="font-medium text-slate2-700 mb-1">No detailed notes attached</p>
                  <p>
                    This action item follows the standard resolution directives recorded during meeting{" "}
                    <strong>{item.meeting?.title || "proceedings"}</strong>. Assignees are expected to coordinate with their department head to fulfill the deliverable before the target deadline.
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* Card 2: Progress & Execution Tracker */}
          <Card className="border border-slate2-200 bg-white">
            <CardHeader
              title="Execution & Milestone Status"
              subtitle="Real-time delivery progress against the targeted timeline"
            />
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-slate2-600">Completion Level</span>
                  <span className="font-mono font-bold text-slate2-800">{item.progressPercent}%</span>
                </div>
                <ProgressBar
                  percent={item.progressPercent}
                  tone={
                    item.status === "COMPLETED"
                      ? "success"
                      : item.overdue
                      ? "danger"
                      : "brand"
                  }
                />
              </div>

              {/* Lifecycle Step Indicators */}
              <div className="pt-3 border-t border-slate2-100 grid grid-cols-3 gap-2 text-center text-xs">
                <div className={`p-2.5 rounded-lg border ${
                  item.status !== "PENDING"
                    ? "bg-teal-50/60 border-teal-200 text-teal-900"
                    : "bg-slate2-50 border-slate2-200 text-slate2-700"
                }`}>
                  <p className="font-semibold">1. Assigned</p>
                  <p className="text-[10px] text-slate2-500 mt-0.5">Mandate established</p>
                </div>
                <div className={`p-2.5 rounded-lg border ${
                  item.status === "IN_PROGRESS"
                    ? "bg-teal-50 border-brand/40 text-brand-dark font-semibold shadow-2xs"
                    : item.status === "COMPLETED"
                    ? "bg-teal-50/60 border-teal-200 text-teal-900"
                    : "bg-slate2-50/60 border-slate2-100 text-slate2-400"
                }`}>
                  <p className="font-semibold">2. In Progress</p>
                  <p className="text-[10px] text-slate2-500 mt-0.5">Execution underway</p>
                </div>
                <div className={`p-2.5 rounded-lg border ${
                  item.status === "COMPLETED"
                    ? "bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold shadow-2xs"
                    : "bg-slate2-50/60 border-slate2-100 text-slate2-400"
                }`}>
                  <p className="font-semibold">3. Completed</p>
                  <p className="text-[10px] text-slate2-500 mt-0.5">
                    {item.completedAt ? formatDate(item.completedAt) : "Pending fulfillment"}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* Card 3: Governance & Lineage (Linked Meeting & Decision) */}
          <Card className="border border-slate2-200 bg-white">
            <CardHeader
              title="Governance & Decision Lineage"
              subtitle="The authorizing corporate meeting and committee resolution that originated this task"
            />
            <div className="p-5 space-y-4">
              {item.meeting && (
                <div className="flex items-start justify-between gap-3 p-3 rounded-lg border border-slate2-200 bg-slate2-50/70">
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-lg bg-teal-50 text-brand flex items-center justify-center shrink-0 border border-teal-100">
                      <FileText size={18} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate2-900 leading-snug">{item.meeting.title}</p>
                      <p className="text-[11px] font-mono text-slate2-500 mt-0.5">
                        Meeting Code: {item.meeting.code}
                      </p>
                    </div>
                  </div>
                  <Link
                    to={`/meetings/${item.meeting.id}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline shrink-0"
                  >
                    <span>Open</span>
                    <ExternalLink size={12} />
                  </Link>
                </div>
              )}

              {item.decision && (
                <div className="flex items-start justify-between gap-3 p-3 rounded-lg border border-teal-200 bg-teal-50/50">
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center shrink-0 border border-teal-200">
                      <ShieldCheck size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-semibold uppercase bg-teal-200/70 text-teal-900 px-1.5 py-0.2 rounded font-mono">
                          {item.decision.code}
                        </span>
                        <p className="text-xs font-bold text-teal-950">{item.decision.title}</p>
                      </div>
                      <p className="text-[11px] text-teal-800 mt-1">
                        Formally approved decision by meeting attendees. This action item was generated to ensure concrete execution.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Sibling Tasks from the same meeting */}
          {relatedItems.length > 0 && (
            <Card className="border border-slate2-200 bg-white">
              <CardHeader
                title="Other Action Items from this Meeting"
                subtitle={`${relatedItems.length} complementary task${relatedItems.length === 1 ? "" : "s"} generated during the same session`}
              />
              <div className="divide-y divide-slate2-100">
                {relatedItems.map((rel) => (
                  <Link
                    key={rel.id}
                    to={`/action-items/${rel.id}`}
                    className="flex items-center justify-between gap-3 p-4 hover:bg-slate2-50/80 transition-colors group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-medium text-slate2-500">{rel.code}</span>
                        <span className="text-xs font-semibold text-slate2-800 group-hover:text-brand transition-colors truncate">
                          {rel.title}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate2-400 mt-0.5">
                        Due: {formatDate(rel.deadline)} · Assigned to: {rel.assignedTo?.name || "Unassigned"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={rel.status} />
                      <ChevronRight size={14} className="text-slate2-400 group-hover:text-brand transition-colors" />
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar Column (Right 1 col): Accountability & Ownership */}
        <div className="space-y-6">
          {/* Card 1: Accountability & Assignment */}
          <Card className="border border-slate2-200 bg-white">
            <CardHeader
              title="Accountability & Ownership"
              subtitle="Individuals and department responsible for deliverable fulfillment"
            />
            <div className="p-5 space-y-4">
              {/* Primary Assignee */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate2-400 mb-2">
                  Primary Lead
                </p>
                {item.assignedTo && item.assignedTo.name !== "Unassigned" ? (
                  <div className="flex items-center gap-3 p-3 rounded-lg border border-slate2-100 bg-slate2-50/50">
                    <Avatar
                      name={item.assignedTo.name}
                      color={item.assignedTo.avatarColor}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate2-900 truncate">
                        {item.assignedTo.name}
                      </p>
                      {item.assignedTo.email && (
                        <p className="text-[11px] text-slate2-500 truncate">
                          {item.assignedTo.email}
                        </p>
                      )}
                      <span className="inline-block mt-1 text-[10px] font-medium text-brand bg-teal-50 px-1.5 py-0.2 rounded border border-teal-100">
                        Lead Assignee
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate2-400 italic">No primary assignee designated</p>
                )}
              </div>

              {/* Additional Assignees */}
              {assignees.length > 1 && (
                <div className="pt-3 border-t border-slate2-100">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate2-400 mb-2">
                    Co-Assignees ({assignees.length - 1})
                  </p>
                  <div className="space-y-2">
                    {assignees
                      .filter((a) => a.id !== item.assignedTo?.id)
                      .map((u) => (
                        <div key={u.id} className="flex items-center gap-2.5 text-xs text-slate2-700">
                          <Avatar name={u.name} color={u.avatarColor} />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-slate2-800 truncate">{u.name}</p>
                            {u.email && <p className="text-[10px] text-slate2-400 truncate">{u.email}</p>}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Department Ownership */}
              <div className="pt-3 border-t border-slate2-100">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate2-400 mb-2">
                  Department Custodian
                </p>
                <div className="flex items-center gap-2 text-xs font-medium text-slate2-800">
                  <div className="h-7 w-7 rounded-md bg-slate2-100 flex items-center justify-center text-slate2-600">
                    <Building2 size={14} />
                  </div>
                  <span>{item.department?.name || "General Corporate"}</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Card 2: Timeline & Milestones */}
          <Card className="border border-slate2-200 bg-white">
            <CardHeader
              title="Schedule & Deadlines"
              subtitle="Target completion dates and execution timeline"
            />
            <div className="p-5 space-y-3.5 text-xs">
              <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate2-100">
                <span className="text-slate2-500 font-medium">Target Deadline</span>
                <span className="font-semibold text-slate2-800 text-right">{formatDate(item.deadline)}</span>
              </div>

              <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate2-100">
                <span className="text-slate2-500 font-medium">Timeline Status</span>
                <span className={`font-semibold ${
                  urgency.tone === "danger"
                    ? "text-rose-600"
                    : urgency.tone === "warning"
                    ? "text-amber-600"
                    : urgency.tone === "success"
                    ? "text-emerald-600"
                    : "text-slate2-700"
                }`}>
                  {urgency.text}
                </span>
              </div>

              {item.completedAt && (
                <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate2-100">
                  <span className="text-slate2-500 font-medium">Fulfilled On</span>
                  <span className="font-semibold text-emerald-700">{formatDate(item.completedAt)}</span>
                </div>
              )}

              <div className="flex items-start justify-between gap-2">
                <span className="text-slate2-500 font-medium">Priority Rating</span>
                <PriorityBadge priority={item.priority} />
              </div>
            </div>
          </Card>

          {/* Card 3: Quick Navigation */}
          <Card className="border border-slate2-200 bg-white p-4">
            <div className="space-y-2">
              <Link
                to="/action-items"
                className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold py-2 px-3 rounded-lg border border-slate2-200 text-slate2-700 hover:bg-slate2-50 transition-colors"
              >
                <ArrowLeft size={13} />
                <span>All Action Items</span>
              </Link>
              {item.meetingId && (
                <Link
                  to={`/meetings/${item.meetingId}?tab=actions`}
                  className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold py-2 px-3 rounded-lg bg-teal-50 text-brand hover:bg-teal-100 transition-colors"
                >
                  <ExternalLink size={13} />
                  <span>View in Meeting Workspace</span>
                </Link>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
