import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import {
  MapPin,
  Video,
  CalendarDays,
  Clock,
  ArrowLeft,
  Plus,
  CheckCircle2,
  FileText,
  Gavel,
  ListChecks,
  Users,
  LayoutList,
  Paperclip,
  Pencil,
  Trash2,
  X,
  Check,
  Lock,
  Unlock,
  XCircle,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  Loader2,
  AlertTriangle,
  UserCheck,
  UserX,
  ClipboardList,
  Save,
  ChevronDown,
  ChevronUp,
  Search,
  Printer,
  Download,
  FileSpreadsheet,
  Eye,
  ExternalLink,
  PenTool,
  Signature,
  Bell,
} from "lucide-react";
import { api, ApiError, getToken, buildUrl } from "../../api/client";
import { RichTextEditor } from "../../components/editor/RichTextEditor";
import { RichTextRenderer } from "../../components/editor/RichTextRenderer";
import { RecordHistoryPopover } from "../../components/ui/RecordHistoryPopover";
import { printMeetingMinutes } from "../../utils/printUtility";
import {
  exportMeetingMinutesToPdf,
  exportMeetingMinutesToDoc,
  exportMeetingMinutesToExcel,
  exportMeetingMinutesToText,
} from "../../utils/exportReport";
import type {
  MeetingDetail as MeetingDetailType,
  MeetingMinutes,
  MeetingParticipant,
  MeetingStatus,
  Department,
  User,
  AgendaItem,
  AgendaStatus,
  Decision,
  DecisionStatus,
  ActionItem,
  ActionItemStatus,
  Priority,
} from "../../types";
import { isLockedMeeting, getActionItemAssignees } from "../../types";
import {
  Card,
  CardHeader,
  Button,
  Avatar,
  inputClass,
  Field,
  ProgressBar,
  CodeChip,
  EmptyState,
} from "../../components/ui/Primitives";
import { StatusBadge, PriorityBadge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Toast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import { useNotifications } from "../../context/NotificationContext";
import { MeetingApprovalModal } from "../../components/meetings/MeetingApprovalModal";
import { ParticipantSigningModal } from "../../components/meetings/ParticipantSigningModal";
import { SearchableUserSelect } from "../../components/ui/SearchableUserSelect";
import { useAlert } from "../../components/ui/AlertDialog";

function hasMeetingEnded(meeting: MeetingDetailType): boolean {
  if (meeting.status === "COMPLETED") return true;
  if (meeting.status === "CANCELLED") return false;

  const dateStr =
    typeof meeting.date === "string"
      ? meeting.date.split("T")[0]
      : new Date(meeting.date).toISOString().split("T")[0];
  const [endHours, endMinutes] = (meeting.endTime || "00:00")
    .split(":")
    .map(Number);
  const [year, month, day] = dateStr.split("-").map(Number);
  const endDateTime = new Date(
    year,
    month - 1,
    day,
    endHours || 0,
    endMinutes || 0,
    0,
  );

  return Date.now() >= endDateTime.getTime();
}

const TABS = [
  { key: "overview", label: "Overview", icon: LayoutList },
  { key: "agenda", label: "Agenda", icon: FileText },
  { key: "minutes", label: "Minutes", icon: FileText },
  { key: "decisions", label: "Decisions", icon: Gavel },
  { key: "actions", label: "Action Items", icon: ListChecks },
  { key: "participants", label: "Participants", icon: Users },
  { key: "documents", label: "Documents", icon: Paperclip },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const MEETING_STATUSES: MeetingStatus[] = [
  "SCHEDULED",
  "IN_PROGRESS",
  "PENDING_SIGNATURES",
  "READY_FOR_APPROVAL",
  "APPROVED",
  "COMPLETED",
  "CANCELLED",
];

// Options allowed in the status dropdown: APPROVED is removed so approval can ONLY be performed
// using the formal "Approve Meeting" button with digital signature.
const STATUS_DROPDOWN_OPTIONS: MeetingStatus[] = [
  "SCHEDULED",
  "IN_PROGRESS",
  "PENDING_SIGNATURES",
  "READY_FOR_APPROVAL",
  "COMPLETED",
  "CANCELLED",
];

const STATUS_CONFIG: Record<
  MeetingStatus,
  { bg: string; border: string; dot: string }
> = {
  SCHEDULED: {
    bg: "bg-sky-50 text-sky-800",
    border: "border-sky-200 hover:border-sky-300",
    dot: "bg-sky-500",
  },
  IN_PROGRESS: {
    bg: "bg-amber-50 text-amber-800",
    border: "border-amber-200 hover:border-amber-300",
    dot: "bg-amber-500",
  },
  PENDING_SIGNATURES: {
    bg: "bg-orange-50 text-orange-800",
    border: "border-orange-200 hover:border-orange-300",
    dot: "bg-orange-500",
  },
  READY_FOR_APPROVAL: {
    bg: "bg-teal-50 text-teal-800",
    border: "border-teal-200 hover:border-teal-300",
    dot: "bg-teal-500",
  },
  APPROVED: {
    bg: "bg-brand/10 text-brand-dark",
    border: "border-brand/30 hover:border-brand/40",
    dot: "bg-brand",
  },
  COMPLETED: {
    bg: "bg-emerald-50 text-emerald-800",
    border: "border-emerald-200 hover:border-emerald-300",
    dot: "bg-emerald-500",
  },
  CANCELLED: {
    bg: "bg-rose-50 text-rose-800",
    border: "border-rose-200 hover:border-rose-300",
    dot: "bg-rose-500",
  },
};

export default function MeetingDetail() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab") as TabKey | null;
  const { user, hasPermission, hasAnyPermission } = useAuth();
  const { refresh: refreshNotifications } = useNotifications();
  const { alert, confirm } = useAlert();
  const [meeting, setMeeting] = useState<MeetingDetailType | null>(null);
  const [tab, setTab] = useState<TabKey>(tabParam || "overview");

  const handleTabChange = (newTab: TabKey) => {
    setTab(newTab);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", newTab);
        return next;
      },
      { replace: true }
    );
  };

  useEffect(() => {
    if (tabParam && tabParam !== tab) {
      setTab(tabParam);
    }
  }, [tabParam, tab]);
  const [loading, setLoading] = useState(true);

  const isLocked = isLockedMeeting(meeting?.status);
  const isApproved = meeting?.status === "APPROVED";
  const isCancelled = meeting?.status === "CANCELLED";
  const hasAdminOverride = hasPermission("ADMIN_OVERRIDE");

  // When a meeting is locked (APPROVED, COMPLETED, CANCELLED, PENDING_SIGNATURES, READY_FOR_APPROVAL),
  // it is strictly 100% READ-ONLY for everyone until unlocked with ADMIN_OVERRIDE and a recorded reason!
  const canEdit = !isLocked;
  const isOrganizer = !!(user && meeting && user.id === meeting.organizer?.id);

  const canManage = useMemo(() => {
    if (hasAdminOverride) return true;
    if (!meeting || !user) return false;
    if (hasPermission("meetings:edit:all")) return true;
    if (hasPermission("meetings:edit:dept") && user.department?.id === meeting.department?.id) return true;
    if (hasPermission("meetings:edit:own") && isOrganizer) return true;
    return false;
  }, [hasAdminOverride, meeting, user, isOrganizer, hasPermission]);

  const canApprove = !!(
    meeting &&
    !["APPROVED", "CANCELLED"].includes(meeting.status) &&
    (isOrganizer || hasAdminOverride || hasPermission("meetings:approve") || hasPermission("meetings:certify_lock"))
  );

  // Approval button is shown only when meeting is ready for approval, or if admin override during pre-signing/completed
  const canShowApproveButton = !!(
    meeting &&
    !["APPROVED", "CANCELLED"].includes(meeting.status) &&
    (
      meeting.status === "READY_FOR_APPROVAL"
        ? canApprove
        : (meeting.status === "PENDING_SIGNATURES" || meeting.status === "COMPLETED")
          ? (canApprove && hasAdminOverride)
          : false
    )
  );

  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const [isParticipantSignModalOpen, setIsParticipantSignModalOpen] = useState(false);
  const [requestingSignatures, setRequestingSignatures] = useState(false);

  // Participant RSVP State & Actions
  const [isDeclineModalOpen, setIsDeclineModalOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("Due to another meeting");
  const [isSubmittingRsvp, setIsSubmittingRsvp] = useState(false);
  const [pageToast, setPageToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const myParticipant = useMemo(() => {
    return meeting?.participants?.find((p) => p.user?.id === user?.id);
  }, [meeting?.participants, user?.id]);

  const handleRsvp = async (status: "ACCEPTED" | "REJECTED", reason?: string) => {
    if (!meeting) return;
    setIsSubmittingRsvp(true);
    try {
      await api.patch(`/meetings/${meeting.id}/rsvp`, {
        status,
        rejectionReason: status === "REJECTED" ? (reason || declineReason || "Due to another meeting") : null,
      });
      setIsDeclineModalOpen(false);
      await load();
      refreshNotifications();
      setPageToast({
        message: status === "ACCEPTED" ? "RSVP updated: Accepted invitation." : "RSVP updated: Declined invitation.",
        type: "success",
      });
    } catch (err: any) {
      setPageToast({
        message: err.message || "Failed to submit RSVP response.",
        type: "error",
      });
    } finally {
      setIsSubmittingRsvp(false);
    }
  };

  // Super Admin Exclusive Unlock State
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
  const [unlockReason, setUnlockReason] = useState("");
  const [unlockTargetStatus, setUnlockTargetStatus] = useState("IN_PROGRESS");
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  // Completion Validation: At least one of Meeting Summary, Decisions, or Action Items must contain content
  const hasSummaryContent = useMemo(() => {
    return Boolean(
      (meeting?.minutes || []).some((m) => {
        const plain = (m.content || "")
          .replace(/<[^>]*>/g, "")
          .replace(/&nbsp;/g, " ")
          .trim();
        return plain.length > 0;
      })
    );
  }, [meeting?.minutes]);

  const hasDecisionsContent = useMemo(() => {
    return Boolean(meeting?.decisions && meeting.decisions.length > 0);
  }, [meeting?.decisions]);

  const hasActionItemsContent = useMemo(() => {
    return Boolean(meeting?.actionItems && meeting.actionItems.length > 0);
  }, [meeting?.actionItems]);

  const canCompleteMeeting = hasSummaryContent || hasDecisionsContent || hasActionItemsContent;

  // Completion button is shown only when meeting is currently active (SCHEDULED / IN_PROGRESS) and has content
  const canShowCompleteButton = !!(
    meeting &&
    (meeting.status === "SCHEDULED" || meeting.status === "IN_PROGRESS") &&
    (canManage || hasAdminOverride) &&
    canCompleteMeeting
  );

  const handleUnlockMeeting = async () => {
    if (!meeting) return;
    if (!unlockReason.trim()) {
      setUnlockError("Please specify a reason for unlocking this meeting.");
      return;
    }
    if (unlockTargetStatus === "COMPLETED" && !canCompleteMeeting) {
      setUnlockError(
        "To complete the meeting, at least one of the three sections (Meeting Summary, Decision, or Action Item) must contain content. Completing the meeting is blocked only if all three are empty at the same time."
      );
      return;
    }
    setUnlocking(true);
    setUnlockError(null);
    try {
      const updated = await api.post<MeetingDetailType>(`/meetings/${meeting.id}/unlock`, {
        targetStatus: unlockTargetStatus,
        reason: unlockReason.trim(),
      });
      setMeeting(updated);
      setIsUnlockModalOpen(false);
      setUnlockReason("");
    } catch (err: any) {
      setUnlockError(err.message || "Failed to unlock meeting.");
    } finally {
      setUnlocking(false);
    }
  };

  // Roster of all required signers: all confirmed participants + organizer/admin
  const allRequiredSigners = useMemo(() => {
    if (!meeting) return [];
    const list: Array<{
      id: string;
      userId: string;
      user: {
        id: string;
        name: string;
        email?: string;
        avatarColor?: string | null;
        department?: { name: string } | null;
        role?: { name: string; code: string } | null;
      };
      roleLabel: string;
    }> = (meeting.participants || [])
      .filter((p) => Boolean(p && p.user))
      .map((p) => ({
        id: p.id,
        userId: p.user.id,
        user: p.user,
        roleLabel: "Participant",
      }));

    if (meeting.organizer && !list.some((item) => item.userId === meeting.organizer.id)) {
      list.unshift({
        id: `organizer-${meeting.organizer.id}`,
        userId: meeting.organizer.id,
        user: {
          id: meeting.organizer.id,
          name: meeting.organizer.name,
          email: meeting.organizer.email,
          avatarColor: (meeting.organizer as any).avatarColor,
          department: (meeting.organizer as any).department,
          role: (meeting.organizer as any).role,
        },
        roleLabel: "Organizer / Admin",
      });
    }
    return list;
  }, [meeting]);

  const totalSignersCount = allRequiredSigners.length;

  const signedUserIds = useMemo(() => {
    return new Set((meeting?.participantSignatures || []).map((s) => s.userId));
  }, [meeting?.participantSignatures]);

  const signedCount = useMemo(() => {
    return allRequiredSigners.filter((s) => signedUserIds.has(s.userId)).length;
  }, [allRequiredSigners, signedUserIds]);

  const allSignersCompleted = totalSignersCount > 0 && signedCount >= totalSignersCount;

  const isEligibleSigner = !!(
    user && allRequiredSigners.some((s) => s.userId === user.id)
  );
  const hasUserSigned = !!(user && signedUserIds.has(user.id));

  // Duration calculation in minutes
  const meetingDurationMinutes = useMemo(() => {
    if (!meeting?.startTime || !meeting?.endTime) return null;
    const [sh, sm] = meeting.startTime.split(":").map(Number);
    const [eh, em] = meeting.endTime.split(":").map(Number);
    if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return null;
    const startMins = sh * 60 + sm;
    const endMins = eh * 60 + em;
    const diff = endMins - startMins;
    return diff > 0 ? diff : null;
  }, [meeting?.startTime, meeting?.endTime]);

  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.get<MeetingDetailType>(`/meetings/${id}`);
      setMeeting(data);
      setLoadError(null);
    } catch (err: any) {
      console.error("Failed to load meeting details:", err);
      setLoadError(err.message || "Failed to load meeting details.");
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    api
      .get<MeetingDetailType>(`/meetings/${id}`)
      .then((data) => {
        setMeeting(data);
        setLoadError(null);
      })
      .catch((err: any) => {
        console.error("Failed to load meeting details:", err);
        setLoadError(err.message || "Failed to load meeting details.");
        setMeeting(null);
      })
      .finally(() => setLoading(false));
  }, [id]);

  // Handle RSVP action triggered from Email action buttons (?rsvp=ACCEPTED or ?rsvp=REJECTED)
  const rsvpHandledRef = useRef(false);
  useEffect(() => {
    if (!meeting || !user || rsvpHandledRef.current) return;
    const rsvpQuery = searchParams.get("rsvp");
    if (!rsvpQuery) return;

    const myPart = meeting.participants?.find((p) => p.user?.id === user.id);
    if (!myPart) return; // User is not an invited attendee for this meeting

    rsvpHandledRef.current = true;

    if (rsvpQuery === "ACCEPTED") {
      if (myPart.status !== "ACCEPTED") {
        handleRsvp("ACCEPTED");
      } else {
        setPageToast({
          message: "You have already accepted this meeting invitation.",
          type: "success",
        });
      }
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("rsvp");
      setSearchParams(nextParams, { replace: true });
    } else if (rsvpQuery === "REJECTED" || rsvpQuery === "DECLINE") {
      // Automatically pop open the Decline Modal to prompt user for required reason
      setIsDeclineModalOpen(true);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("rsvp");
      setSearchParams(nextParams, { replace: true });
    }
  }, [meeting, user, searchParams, setSearchParams]);

  const handleRequestSignatures = async () => {
    if (!id || requestingSignatures) return;
    setRequestingSignatures(true);
    try {
      const updated = await api.post<MeetingDetailType>(
        `/meetings/${id}/request-signatures`,
        {}
      );
      setMeeting(updated);
      setPageToast({
        message: "Digital signature collection initiated.",
        type: "success",
      });
      try {
        await refreshNotifications();
      } catch { }
    } catch (err: any) {
      // Re-fetch latest meeting state from server to guarantee sync
      try {
        const fresh = await api.get<MeetingDetailType>(`/meetings/${id}`);
        if (fresh) setMeeting(fresh);
      } catch { }
      await alert({
        title: "Signature Initiation Failed",
        message: err.message || "Failed to initiate participant signatures.",
        tone: "danger",
      });
    } finally {
      setRequestingSignatures(false);
    }
  };

  const updateStatus = async (status: MeetingStatus) => {
    if (!id || !meeting) return;
    if (isLocked && !hasAdminOverride) {
      await alert({
        title: "Meeting is Locked",
        message:
          "This meeting is strictly read-only. It must be unlocked first by an administrator with ADMIN_OVERRIDE permission providing a reason before any status changes can be made.",
        tone: "warning",
      });
      return;
    }
    if (status === "CANCELLED" && meeting.status !== "CANCELLED") {
      const confirmed = await confirm({
        title: "Cancel Meeting",
        message:
          "Are you sure you want to cancel this meeting? All participants and the organizer will receive a cancellation notification.",
        tone: "danger",
        confirmLabel: "Yes, Cancel Meeting",
        cancelLabel: "Keep Meeting",
      });
      if (!confirmed) {
        return;
      }
    }
    if (status === "COMPLETED") {
      if (!canCompleteMeeting) {
        await alert({
          title: "Completion Blocked",
          message:
            "To complete the meeting, at least one of the three sections (Meeting Summary, Decision, or Action Item) must contain content. Completing the meeting is blocked only if all three are empty at the same time.",
          tone: "warning",
          confirmLabel: "Understood",
        });
        return;
      }
    }
    try {
      const updated = await api.put<MeetingDetailType>(`/meetings/${id}`, {
        status,
      });
      setMeeting(updated);
      try {
        await refreshNotifications();
      } catch {
        // ignore
      }
    } catch (err: any) {
      await alert({
        title: "Status Update Error",
        message: err.message || "Failed to update status.",
        tone: "danger",
      });
    }
  };

  if (loading && !meeting) {
    return <div className="h-64 animate-pulse rounded-xl bg-slate2-100" />;
  }
  if (!meeting) {
    return (
      <Card className="p-8 text-center">
        {loadError ? (
          <div className="max-w-md mx-auto space-y-3">
            <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-2xl bg-amber-50 text-amber-600 border border-amber-200">
              <ShieldAlert size={24} />
            </div>
            <h3 className="font-display text-base font-bold text-slate2-900">
              Unable to Access Meeting
            </h3>
            <p className="text-xs text-slate2-600 leading-relaxed">
              {loadError}
            </p>
            <div className="pt-2 flex items-center justify-center gap-2">
              <Link
                to="/meetings"
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand hover:bg-brand-dark text-white text-xs font-semibold px-4 py-2 transition-colors shadow-2xs"
              >
                <ArrowLeft size={13} /> Back to Directory
              </Link>
              <Button variant="secondary" onClick={load} className="text-xs">
                Retry
              </Button>
            </div>
          </div>
        ) : (
          <EmptyState
            title="Meeting not found"
            description="It may have been deleted, or the link is incorrect."
          />
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Navigation Breadcrumb */}
      <Link
        to="/meetings"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate2-500 hover:text-brand transition-colors"
      >
        <ArrowLeft size={14} /> Back to Meeting Directory
      </Link>

      {/* Executive Command Header Card */}
      <Card className="border border-slate2-200/90 shadow-sm bg-white">
        {/* Signature brand accent bar */}
        <div className="h-1 w-full bg-gradient-to-r from-brand via-brand-light to-accent rounded-t-xl" />

        <div className="p-5 sm:p-6 space-y-4">
          {/* Top Classification Row: Code, Department, Priority, Status, Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate2-100">
            <div className="flex flex-wrap items-center gap-2">
              <CodeChip>{meeting.code}</CodeChip>
              <RecordHistoryPopover
                recordId={meeting.code}
                meeting={meeting}
              />
              {meeting.department?.name && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate2-100 text-slate2-700 font-medium text-xs">
                  {meeting.department.name}
                </span>
              )}
              <PriorityBadge priority={meeting.priority} />
              {meeting.forceApproved && (
                <span
                  className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900 border border-amber-300 shadow-2xs"
                  title={meeting.bypassReason || "Approved with administrative force override"}
                >
                  Force Approved
                </span>
              )}
            </div>

            {/* Status & Action Hub */}
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              {/* Print Minutes */}
              <Button
                variant="secondary"
                type="button"
                onClick={() => printMeetingMinutes({ meeting })}
                className="text-xs py-1.5 px-3 inline-flex items-center gap-1.5 bg-white hover:bg-slate2-50 border border-slate2-200 font-medium text-slate2-700 shadow-2xs"
                title="Print Meeting Minutes (Clean Corporate Letterhead)"
              >
                <Printer size={13} className="text-slate2-600" />
                <span>Print Minutes</span>
              </Button>

              {/* Unlock Meeting Button (Exclusive to ADMIN_OVERRIDE) */}
              {isLocked && hasAdminOverride && (
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => setIsUnlockModalOpen(true)}
                  className="text-xs py-1.5 px-3 inline-flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-300 font-semibold text-amber-900 shadow-2xs"
                  title="Unlock and reopen meeting for editing (requires ADMIN_OVERRIDE)"
                >
                  <Unlock size={13} className="text-amber-700" />
                  <span>Unlock Meeting</span>
                </Button>
              )}

              {/* Request Signatures Button (Prominent in Command Bar) */}
              {canManage && (meeting.status === "IN_PROGRESS" || meeting.status === "COMPLETED" || meeting.status === "PENDING_SIGNATURES") && (
                <Button
                  variant="secondary"
                  type="button"
                  onClick={handleRequestSignatures}
                  disabled={requestingSignatures}
                  className="text-xs py-1.5 px-3 inline-flex items-center gap-1.5 bg-brand/5 hover:bg-brand/10 border border-brand/30 font-semibold text-brand-dark shadow-2xs transition-all cursor-pointer"
                  title="Dispatch in-app signature requests to all unsigned participants"
                >
                  <Signature size={13} className="text-brand" />
                  <span>
                    {requestingSignatures
                      ? "Sending..."
                      : meeting.status === "PENDING_SIGNATURES"
                        ? "Resend Signatures"
                        : "Request Signatures"}
                  </span>
                </Button>
              )}

              {/* Complete Meeting Button */}
              {canShowCompleteButton && (
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => updateStatus("COMPLETED")}
                  className="text-xs py-1.5 px-3 inline-flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 font-semibold text-emerald-900 shadow-2xs transition-all cursor-pointer"
                  title="Complete meeting (Content verified in Summary, Decision, or Action Items)"
                >
                  <CheckCircle2 size={13} className="text-emerald-700" />
                  <span>Complete Meeting</span>
                </Button>
              )}

              {/* Approve Meeting Button */}
              {canShowApproveButton && (
                <Button
                  variant="primary"
                  onClick={() => setIsApprovalModalOpen(true)}
                  className="bg-brand hover:bg-brand-dark text-white text-xs py-1.5 px-3.5 shadow-sm inline-flex items-center gap-1.5 font-semibold transition-all cursor-pointer"
                >
                  <ShieldCheck size={14} />
                  <span>Approve Meeting</span>
                </Button>
              )}

              {/* Status Change Dropdown Hub */}
              <div className="flex items-center gap-2">
                {canManage ? (
                  <div
                    className={`group relative inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 transition-all shadow-2xs ${
                      isLocked && !hasAdminOverride
                        ? "bg-slate2-100 border-slate2-200 text-slate2-600"
                        : `${STATUS_CONFIG[meeting.status]?.bg || "bg-slate2-100 text-slate2-700"} ${STATUS_CONFIG[meeting.status]?.border || "border-slate2-200"}`
                    }`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full shrink-0 ${
                        STATUS_CONFIG[meeting.status]?.dot || "bg-slate2-400"
                      }`}
                    />
                    <select
                      value={meeting.status}
                      onChange={(e) => updateStatus(e.target.value as MeetingStatus)}
                      disabled={isLocked && !hasAdminOverride}
                      title={
                        isLocked && !hasAdminOverride
                          ? "Meeting is locked. Only administrators with ADMIN_OVERRIDE can alter status."
                          : "Click to change status"
                      }
                      className="bg-transparent text-inherit font-semibold text-xs border-0 outline-none p-0 pr-4 cursor-pointer disabled:cursor-not-allowed appearance-none focus:ring-0 select-none"
                    >
                      {STATUS_DROPDOWN_OPTIONS.map((s) => (
                        <option
                          key={s}
                          value={s}
                          className="bg-white text-slate2-800 font-medium py-1"
                        >
                          {s.replace("_", " ")}
                        </option>
                      ))}
                    </select>
                    {isLocked && !hasAdminOverride ? (
                      <Lock
                        size={11}
                        className="pointer-events-none absolute right-2 text-inherit opacity-70"
                      />
                    ) : (
                      <ChevronDown
                        size={12}
                        className="pointer-events-none absolute right-2 text-inherit opacity-70 group-hover:opacity-100 transition-opacity"
                      />
                    )}
                  </div>
                ) : (
                  <StatusBadge status={meeting.status} />
                )}
              </div>
            </div>
          </div>

          {/* Title & Description */}
          <div className="space-y-1.5">
            <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate2-900">
              {meeting.title}
            </h1>
            {meeting.description && (
              <p className="text-xs sm:text-sm text-slate2-600 max-w-4xl leading-relaxed">
                {meeting.description}
              </p>
            )}
          </div>

          {/* Proceedings Dossier Strip: Schedule, Location, Organizer, Attendance */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
            {/* 1. Date & Time */}
            <div className="rounded-xl border border-slate2-200/80 bg-slate2-50/60 p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate2-500">
                <CalendarDays size={13} className="text-brand" />
                <span>Schedule & Duration</span>
              </div>
              <p className="mt-1 text-xs font-bold text-slate2-800">
                {new Date(meeting.date).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
              <p className="text-[11px] font-mono text-slate2-600 mt-0.5">
                {meeting.startTime} – {meeting.endTime}
                {meetingDurationMinutes && (
                  <span className="ml-1 text-slate2-400 font-sans">({meetingDurationMinutes} min)</span>
                )}
              </p>
            </div>

            {/* 2. Venue / Room */}
            <div className="rounded-xl border border-slate2-200/80 bg-slate2-50/60 p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate2-500">
                <MapPin size={13} className="text-brand" />
                <span>Venue & Access</span>
              </div>
              <p className="mt-1 text-xs font-bold text-slate2-800 truncate">
                {meeting.location || "Office Boardroom"}
              </p>
              <div className="mt-0.5">
                {meeting.onlineLink ? (
                  <a
                    href={meeting.onlineLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand hover:underline"
                  >
                    <Video size={11} /> Join Video Room
                  </a>
                ) : (
                  <span className="text-[11px] text-slate2-400">In-person session</span>
                )}
              </div>
            </div>

            {/* 3. Convener / Organizer */}
            <div className="rounded-xl border border-slate2-200/80 bg-slate2-50/60 p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate2-500">
                <Users size={13} className="text-brand" />
                <span>Convener / Organizer</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <Avatar
                  name={meeting.organizer?.name || "Organizer"}
                  color={meeting.organizer?.avatarColor || "#0B7A6B"}
                />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate2-800 truncate">
                    {meeting.organizer?.name || "Unassigned"}
                  </p>
                  {meeting.department?.name && (
                    <p className="text-[11px] text-slate2-400 truncate">
                      {meeting.department.name}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* 4. Attendance & Signatures */}
            <div className="rounded-xl border border-slate2-200/80 bg-slate2-50/60 p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate2-500">
                <ShieldCheck size={13} className="text-brand" />
                <span>Roster & Attendance</span>
              </div>
              <p className="mt-1 text-xs font-bold text-slate2-800">
                {(meeting.participants || []).length} {(meeting.participants || []).length === 1 ? "Invited Attendee" : "Invited Attendees"}
              </p>
              <p className="text-[11px] text-slate2-600 mt-0.5">
                {meeting.status === "APPROVED"
                  ? "Formally certified & locked"
                  : totalSignersCount > 0
                    ? `${signedCount} of ${totalSignersCount} signatures verified`
                    : `${(meeting.participants || []).filter((p) => p.status === "ACCEPTED").length} accepted`}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Official Certified Proceedings Ribbon for Approved / Locked Sessions */}
      {isLocked && meeting.status !== "PENDING_SIGNATURES" && meeting.status !== "READY_FOR_APPROVAL" && (
        <div
          className={`rounded-xl border p-4 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${meeting.status === "APPROVED"
            ? "bg-brand/5 border-brand/25 text-brand-dark"
            : meeting.status === "CANCELLED"
              ? "bg-rose-50/80 border-rose-200 text-rose-950"
              : "bg-slate2-50 border-slate2-200 text-slate2-900"
            }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`mt-0.5 rounded-lg p-2 shrink-0 ${meeting.status === "APPROVED"
                ? "bg-brand/10 text-brand"
                : meeting.status === "CANCELLED"
                  ? "bg-rose-100 text-rose-700"
                  : "bg-slate2-200 text-slate2-700"
                }`}
            >
              {meeting.status === "APPROVED" ? (
                <ShieldCheck size={20} />
              ) : meeting.status === "CANCELLED" ? (
                <AlertCircle size={20} />
              ) : (
                <Lock size={20} />
              )}
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm">
                  {meeting.status === "APPROVED"
                    ? "Official Certified Corporate Record"
                    : meeting.status === "CANCELLED"
                      ? "Meeting Session Cancelled"
                      : "Meeting Completed & Certified"}
                </span>
                <span className="rounded bg-white/90 border border-current px-2 py-0.5 text-[10px] font-bold tracking-wider">
                  {meeting.status === "COMPLETED" ? "COMPLETED" : "LOCKED ARCHIVE"}
                </span>
                {hasAdminOverride && (
                  <span className="rounded bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                    Administrator Override Active
                  </span>
                )}
              </div>

              <p className="text-xs text-slate2-600 leading-relaxed max-w-3xl">
                {meeting.status === "APPROVED"
                  ? "This session and its recorded minutes have been formally approved and certified by authorized reviewer. All minutes, decisions, attendance records, tasks, and attached documents are preserved in Read-Only archive mode."
                  : meeting.status === "CANCELLED"
                    ? "This meeting was cancelled. Proceedings and minutes are permanently locked."
                    : "This meeting is completed and preserved in Read-Only archive mode."}
              </p>

              {meeting.status === "APPROVED" && meeting.approvedBy && meeting.approvedAt && (
                <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-brand/15 mt-2">
                  <p className="font-semibold text-xs text-brand flex items-center gap-1.5">
                    <CheckCircle2 size={13} className="text-brand shrink-0" />
                    Certified by {meeting.approvedBy.name} on {new Date(meeting.approvedAt).toLocaleString()}
                  </p>
                  {meeting.approvalSignature && (
                    <div className="flex items-center gap-2 rounded-lg bg-white/95 border border-brand/20 px-3 py-1 shadow-2xs">
                      <span className="text-[10px] font-semibold text-slate2-500 uppercase tracking-wider">
                        Reviewer Seal:
                      </span>
                      <img
                        src={meeting.approvalSignature}
                        alt="Reviewer Digital Signature"
                        className="h-7 max-w-[130px] object-contain"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {hasAdminOverride && (
            <div className="shrink-0 self-start sm:self-center">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setIsUnlockModalOpen(true)}
                className="text-xs py-1.5 px-3 bg-white hover:bg-amber-50 border-amber-300 text-amber-900 font-semibold shadow-2xs inline-flex items-center gap-1.5"
              >
                <Unlock size={13} className="text-amber-700" />
                <span>Unlock Meeting</span>
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Global Page Feedback Toast */}
      {pageToast && (
        <Toast
          message={pageToast.message}
          type={pageToast.type}
          onClose={() => setPageToast(null)}
        />
      )}

      {/* Participant RSVP Strip for Invited Users */}
      {myParticipant && meeting.status !== "CANCELLED" && (
        <div className="rounded-xl border border-slate2-200/90 bg-white p-4 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${myParticipant.status === "ACCEPTED"
                  ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                  : myParticipant.status === "REJECTED" || myParticipant.status === "DECLINED"
                    ? "bg-rose-50 text-rose-600 border-rose-200"
                    : "bg-amber-50 text-amber-600 border-amber-200"
                  }`}
              >
                {myParticipant.status === "ACCEPTED" ? (
                  <CheckCircle2 size={18} />
                ) : myParticipant.status === "REJECTED" || myParticipant.status === "DECLINED" ? (
                  <XCircle size={18} />
                ) : (
                  <Clock size={18} />
                )}
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-xs sm:text-sm text-slate2-900">
                    Your Attendance Response
                  </span>
                  {myParticipant.status === "ACCEPTED" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 text-xs font-semibold">
                      <CheckCircle2 size={11} className="text-emerald-600" />
                      <span>Confirmed (Will Attend)</span>
                    </span>
                  ) : myParticipant.status === "REJECTED" || myParticipant.status === "DECLINED" ? (
                    <div className="inline-flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 text-rose-800 border border-rose-200 px-2 py-0.5 text-xs font-semibold">
                        <XCircle size={11} className="text-rose-600" />
                        <span>Declined</span>
                      </span>
                      {myParticipant.rejectionReason && (
                        <span className="text-xs text-rose-700 font-medium">
                          ➜ &lsquo;{myParticipant.rejectionReason}&rsquo;
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 text-xs font-medium">
                      <Clock size={11} className="text-amber-600" />
                      <span>Awaiting Response</span>
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate2-500 mt-0.5">
                  {myParticipant.status === "ACCEPTED"
                    ? "Your seat is confirmed on the official roster."
                    : myParticipant.status === "REJECTED" || myParticipant.status === "DECLINED"
                      ? "You notified the organizer that you cannot attend."
                      : "Please respond to let the convener know if you will attend this session."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
              {myParticipant.status === "INVITED" || !myParticipant.status ? (
                <>
                  <button
                    type="button"
                    disabled={isSubmittingRsvp}
                    onClick={() => handleRsvp("ACCEPTED")}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-1.5 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                  >
                    {isSubmittingRsvp ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={13} />}
                    <span>Accept (Will Attend)</span>
                  </button>
                  <button
                    type="button"
                    disabled={isSubmittingRsvp}
                    onClick={() => setIsDeclineModalOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 text-rose-700 px-3 py-1.5 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                  >
                    <XCircle size={13} />
                    <span>Decline Invitation</span>
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  {myParticipant.status === "ACCEPTED" ? (
                    <button
                      type="button"
                      disabled={isSubmittingRsvp}
                      onClick={() => setIsDeclineModalOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate2-200 bg-white hover:bg-slate2-50 text-slate2-700 px-3 py-1.5 text-xs font-medium shadow-2xs transition-colors cursor-pointer"
                    >
                      <span>Change to Decline</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isSubmittingRsvp}
                      onClick={() => handleRsvp("ACCEPTED")}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 px-3 py-1.5 text-xs font-medium shadow-2xs transition-colors cursor-pointer"
                    >
                      <CheckCircle2 size={12} className="text-emerald-600" />
                      <span>Change to Accepted</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Participant Digital Signature Action Alert Banner */}
      {meeting.status === "PENDING_SIGNATURES" && isEligibleSigner && !hasUserSigned && (
        <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-amber-100 border border-amber-200 text-amber-800 flex items-center justify-center shrink-0">
              <Signature size={18} />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-bold text-amber-950">
                Digital Signature Requested
              </p>
              <p className="text-xs text-amber-800 mt-0.5">
                Your digital signature is requested to certify and attest to this meeting&apos;s proceedings and official minutes.
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            type="button"
            onClick={() => setIsParticipantSignModalOpen(true)}
            className="bg-brand hover:bg-brand-light text-white text-xs py-2 px-4 shrink-0 inline-flex items-center gap-1.5 font-semibold shadow-xs cursor-pointer"
          >
            <Signature size={14} /> Sign Meeting Minutes
          </Button>
        </div>
      )}

      {/* Structured Tab Bar with Live Counters */}
      <div className="flex gap-1 overflow-x-auto border-b border-slate2-200 pb-px">
        {TABS.map((t) => {
          const isActive = tab === t.key;
          let badgeContent: React.ReactNode = null;
          if (t.key === "agenda") {
            badgeContent = (meeting.agendaItems || []).length;
          } else if (t.key === "decisions") {
            badgeContent = (meeting.decisions || []).length;
          } else if (t.key === "actions") {
            badgeContent = (meeting.actionItems || []).length;
          } else if (t.key === "participants") {
            badgeContent = (meeting.participants || []).length;
          } else if (t.key === "documents") {
            badgeContent = (meeting.documents || []).length;
          } else if (t.key === "minutes") {
            if (meeting.status === "APPROVED") {
              badgeContent = "Certified";
            } else if (totalSignersCount > 0) {
              badgeContent = `${signedCount}/${totalSignersCount}`;
            }
          }

          return (
            <button
              key={t.key}
              onClick={() => handleTabChange(t.key)}
              className={`focus-ring flex items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-xs sm:text-sm font-semibold transition-all cursor-pointer ${isActive
                ? "border-brand text-brand bg-brand/[0.03]"
                : "border-transparent text-slate2-500 hover:text-slate2-800 hover:border-slate2-300"
                }`}
            >
              <t.icon size={15} />
              <span>{t.label}</span>
              {badgeContent !== null && badgeContent !== undefined && (
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${isActive
                    ? "bg-brand/15 text-brand"
                    : "bg-slate2-100 text-slate2-600"
                    }`}
                >
                  {badgeContent}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tab === "overview" && (
        <OverviewTab meeting={meeting} onNavigateTab={handleTabChange} />
      )}
      {tab === "agenda" && (
        <AgendaTab meeting={meeting} canManage={canManage && canEdit} onChange={load} />
      )}
      {tab === "minutes" && (
        <MinutesTab
          meeting={meeting}
          canManage={canManage && canEdit}
          onChange={load}
          canApprove={canApprove}
          onApproveClick={() => setIsApprovalModalOpen(true)}
          onRequestSignaturesClick={handleRequestSignatures}
          requestingSignatures={requestingSignatures}
          onParticipantSignClick={() => setIsParticipantSignModalOpen(true)}
          isEligibleSigner={isEligibleSigner}
          hasUserSigned={hasUserSigned}
          requiredSigners={allRequiredSigners}
          totalSignersCount={totalSignersCount}
          signedCount={signedCount}
        />
      )}
      {tab === "decisions" && (
        <DecisionsTab
          meeting={meeting}
          canManage={canManage && canEdit}
          onChange={load}
        />
      )}
      {tab === "actions" && (
        <ActionsTab
          meeting={meeting}
          canCreate={canManage && canEdit}
          onChange={load}
        />
      )}
      {tab === "participants" && (
        <ParticipantsTab
          meeting={meeting}
          canManage={canManage && canEdit}
          onChange={load}
          onSignSelf={() => setIsParticipantSignModalOpen(true)}
        />
      )}
      {tab === "documents" && (
        <DocumentsTab
          meeting={meeting}
          canManage={canManage && canEdit}
          onChange={load}
        />
      )}

      {/* Signature Capture Modal Dialog for Meeting Approval */}
      {isApprovalModalOpen && meeting && (
        <MeetingApprovalModal
          open={isApprovalModalOpen}
          onClose={() => setIsApprovalModalOpen(false)}
          meeting={meeting}
          onApproveSuccess={(updated) => {
            setMeeting(updated);
            setIsApprovalModalOpen(false);
          }}
          onApproveApi={async (signature, forceApprove, forceReason) => {
            return await api.post<MeetingDetailType>(`/meetings/${id}/approve`, {
              signature,
              forceApprove,
              forceReason,
            });
          }}
        />
      )}

      {/* Participant Pre-Signing Modal Dialog */}
      {isParticipantSignModalOpen && meeting && (
        <ParticipantSigningModal
          open={isParticipantSignModalOpen}
          onClose={() => setIsParticipantSignModalOpen(false)}
          meeting={meeting}
          onSignSuccess={(updated) => {
            setMeeting(updated);
            setIsParticipantSignModalOpen(false);
          }}
        />
      )}

      {/* Decline Meeting Invitation Modal Dialog */}
      {isDeclineModalOpen && (
        <Modal
          open={isDeclineModalOpen}
          onClose={() => {
            if (!isSubmittingRsvp) setIsDeclineModalOpen(false);
          }}
          title="Decline Meeting Invitation"
        >
          <div className="space-y-4 text-xs text-slate2-700">
            <p className="text-xs text-slate2-600">
              Please provide a reason so the meeting organizer knows why you cannot attend:
            </p>

            {/* Quick reason suggestions */}
            <div>
              <label className="text-[11px] font-semibold text-slate2-500 uppercase tracking-wider block mb-1.5">
                Common Reasons
              </label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "Due to another meeting",
                  "Schedule conflict",
                  "Out of office / Annual leave",
                  "Prior business commitment",
                  "Field visit / Traveling",
                ].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setDeclineReason(chip)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium border transition-colors cursor-pointer ${declineReason === chip
                      ? "bg-rose-100 border-rose-300 text-rose-800"
                      : "bg-slate2-50 border-slate2-200 text-slate2-700 hover:bg-slate2-100"
                      }`}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate2-700 block mb-1">
                Reason / Explanation
              </label>
              <input
                type="text"
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="e.g. Due to another meeting"
                className="w-full rounded-xl border border-slate2-200 bg-white px-3.5 py-2.5 text-xs text-slate2-800 placeholder:text-slate2-400 focus:outline-none focus:border-rose-400"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate2-100">
              <Button
                variant="secondary"
                type="button"
                disabled={isSubmittingRsvp}
                onClick={() => setIsDeclineModalOpen(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <button
                type="button"
                disabled={isSubmittingRsvp || !declineReason.trim()}
                onClick={() => handleRsvp("REJECTED", declineReason.trim())}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-semibold text-xs px-4 py-2 transition-colors cursor-pointer shadow-2xs"
              >
                {isSubmittingRsvp ? (
                  <>
                    <Loader2 size={13} className="animate-spin" /> Submitting...
                  </>
                ) : (
                  <>
                    <XCircle size={14} />
                    <span>Confirm Decline</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Administrator Unlock Meeting Modal Dialog */}
      {isUnlockModalOpen && meeting && (
        <Modal
          open={isUnlockModalOpen}
          onClose={unlocking ? () => { } : () => setIsUnlockModalOpen(false)}
          title="Administrator Override: Unlock Meeting"
        >
          <div className="space-y-4 text-xs text-slate2-700">
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5">
              <div className="flex items-start gap-2.5">
                <ShieldAlert size={20} className="text-amber-700 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-amber-950">
                    Exclusive Administrator Override Action
                  </p>
                  <p className="text-amber-900/90 leading-relaxed">
                    This meeting is officially certified and locked ({meeting.status}). Unlocking it will
                    reopen the proceedings (minutes, decisions, documents, and attendance) for
                    administrative modification.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate2-800 mb-1">
                Reopen As Status
              </label>
              <select
                value={unlockTargetStatus}
                onChange={(e) => setUnlockTargetStatus(e.target.value)}
                className="w-full rounded-lg border border-slate2-300 bg-white px-3 py-2 text-xs text-slate2-800 focus:border-brand focus:outline-none"
              >
                <option value="IN_PROGRESS">IN_PROGRESS (Recommended — Active & Editable)</option>
                <option value="COMPLETED">COMPLETED (Conclude & Complete Meeting)</option>
                <option value="DRAFT">DRAFT (Drafting Mode)</option>
                <option value="SCHEDULED">SCHEDULED (Scheduled Session)</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate2-800 mb-1">
                Reason for Administrator Override / Unlock <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                value={unlockReason}
                onChange={(e) => setUnlockReason(e.target.value)}
                placeholder="Please specify why this approved meeting is being unlocked (e.g. Correcting attendee roster error, adding omitted decision, board amendment)..."
                className="w-full rounded-lg border border-slate2-300 bg-white p-2.5 text-xs text-slate2-800 placeholder:text-slate2-400 focus:border-brand focus:outline-none"
              />
            </div>

            {unlockError && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{unlockError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate2-100">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsUnlockModalOpen(false)}
                disabled={unlocking}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleUnlockMeeting}
                disabled={unlocking || !unlockReason.trim()}
                className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                {unlocking ? (
                  <>
                    <Loader2 size={13} className="animate-spin" /> Unlocking...
                  </>
                ) : (
                  <>
                    <Unlock size={14} /> Confirm Unlock & Reopen
                  </>
                )}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function OverviewTab({
  meeting,
  onNavigateTab,
}: {
  meeting: MeetingDetailType;
  onNavigateTab?: (tab: TabKey) => void;
}) {
  const participants = meeting.participants || [];
  const agendaItems = meeting.agendaItems || [];
  const decisions = meeting.decisions || [];
  const actionItems = meeting.actionItems || [];
  const minutes = meeting.minutes || [];

  const totalParticipants = participants.length;
  const acceptedCount = participants.filter((p) => p.status === "ACCEPTED").length;
  const rejectedCount = participants.filter(
    (p) => p.status === "REJECTED" || p.status === "DECLINED"
  ).length;
  const awaitingCount = participants.filter(
    (p) => p.status !== "ACCEPTED" && p.status !== "REJECTED" && p.status !== "DECLINED"
  ).length;

  const attendancePercentage = totalParticipants > 0 ? Math.round((acceptedCount / totalParticipants) * 100) : 0;

  // Total scheduled duration of agenda items
  const totalAgendaMinutes = useMemo(() => {
    return agendaItems.reduce((acc, item) => acc + (item.durationMin || 0), 0);
  }, [agendaItems]);

  // Action items completed vs pending
  const completedActions = actionItems.filter((a) => a.status === "COMPLETED").length;
  const pendingActions = actionItems.length - completedActions;

  // Implemented decisions count
  const implementedDecisions = decisions.filter((d) => d.status === "IMPLEMENTED").length;

  // Meeting Summary preview
  const summaryMinute = useMemo(() => {
    return minutes.find((m) => m.type === "SUMMARY" || (!m.type && !m.attendeeId));
  }, [minutes]);

  // Determine active governance phase (1 to 4)
  const currentPhase = useMemo(() => {
    if (meeting.status === "APPROVED" || meeting.status === "COMPLETED") return 4;
    if (meeting.status === "PENDING_SIGNATURES" || meeting.status === "READY_FOR_APPROVAL") return 3;
    if (meeting.status === "IN_PROGRESS") return 2;
    return 1; // SCHEDULED / DRAFT
  }, [meeting.status]);

  const GOVERNANCE_STAGES = [
    { num: 1, label: "Scheduled", desc: "Agenda & Docs prepared" },
    { num: 2, label: "In Session", desc: "Proceedings & Discussion" },
    { num: 3, label: "Attestation", desc: "Attendee pre-signatures" },
    { num: 4, label: "Certified", desc: "Formal executive lock" },
  ];

  return (
    <div className="space-y-6">
      {/* 4 Executive Metric Ledger Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* 1. Agenda Scope */}
        <div
          onClick={() => onNavigateTab?.("agenda")}
          className="rounded-xl border border-slate2-200 bg-white p-4 shadow-2xs hover:border-brand/40 transition-colors cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate2-500">Agenda Topics</span>
            <FileText size={16} className="text-brand group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <p className="font-display text-2xl font-bold text-slate2-900">{agendaItems.length}</p>
            <span className="text-xs font-mono text-slate2-500">{totalAgendaMinutes} mins planned</span>
          </div>
          <p className="mt-1 text-[11px] text-slate2-400">
            {agendaItems.filter((a) => a.status === "DISCUSSED").length} covered ·{" "}
            {agendaItems.filter((a) => a.status === "PENDING").length} pending
          </p>
        </div>

        {/* 2. Formal Decisions */}
        <div
          onClick={() => onNavigateTab?.("decisions")}
          className="rounded-xl border border-slate2-200 bg-white p-4 shadow-2xs hover:border-brand/40 transition-colors cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate2-500">Formal Decisions</span>
            <Gavel size={16} className="text-brand group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <p className="font-display text-2xl font-bold text-slate2-900">{decisions.length}</p>
            <span className="text-xs text-emerald-700 font-semibold">{implementedDecisions} executed</span>
          </div>
          <p className="mt-1 text-[11px] text-slate2-400">
            {decisions.length - implementedDecisions} open decisions
          </p>
        </div>

        {/* 3. Action Items */}
        <div
          onClick={() => onNavigateTab?.("actions")}
          className="rounded-xl border border-slate2-200 bg-white p-4 shadow-2xs hover:border-brand/40 transition-colors cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate2-500">Action Items</span>
            <ListChecks size={16} className="text-brand group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <p className="font-display text-2xl font-bold text-slate2-900">{actionItems.length}</p>
            <span className="text-xs text-brand font-semibold">{completedActions} resolved</span>
          </div>
          <p className="mt-1 text-[11px] text-slate2-400">
            {pendingActions} pending operational tasks
          </p>
        </div>

        {/* 4. Attendance & Attendance */}
        <div
          onClick={() => onNavigateTab?.("participants")}
          className="rounded-xl border border-slate2-200 bg-white p-4 shadow-2xs hover:border-brand/40 transition-colors cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate2-500">Attendee Attendance</span>
            <Users size={16} className="text-brand group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <p className="font-display text-2xl font-bold text-slate2-900">{attendancePercentage}%</p>
            <span className="text-xs text-slate2-500">
              {acceptedCount} / {totalParticipants}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate2-400">
            {rejectedCount > 0 ? `${rejectedCount} declined · ` : ""}
            {awaitingCount} awaiting response
          </p>
        </div>
      </div>

      {/* Main 2-Column Executive Briefing Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Governance Timeline & Meeting Summary Preview */}
        <div className="lg:col-span-2 space-y-6">
          {/* Governance Lifecycle Stepper */}
          <Card className="p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate2-100">
              <h3 className="text-xs font-bold text-slate2-800 uppercase tracking-wider">
                Meeting Governance Progression
              </h3>
              <span className="text-xs font-semibold text-brand">
                Phase {currentPhase} of 4: {GOVERNANCE_STAGES[currentPhase - 1].label}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {GOVERNANCE_STAGES.map((s) => {
                const isPassed = s.num < currentPhase;
                const isCurrent = s.num === currentPhase;

                return (
                  <div
                    key={s.num}
                    className={`rounded-xl border p-3 transition-all ${isCurrent
                      ? "border-brand bg-brand/[0.04] shadow-2xs"
                      : isPassed
                        ? "border-emerald-200 bg-emerald-50/30"
                        : "border-slate2-200/70 bg-slate2-50/40 opacity-70"
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${isPassed
                          ? "bg-emerald-600 text-white"
                          : isCurrent
                            ? "bg-brand text-white"
                            : "bg-slate2-200 text-slate2-600"
                          }`}
                      >
                        {isPassed ? "✓" : s.num}
                      </span>
                      <span className="text-xs font-bold text-slate2-800 truncate">{s.label}</span>
                    </div>
                    <p className="text-[11px] text-slate2-500 mt-1 line-clamp-1">{s.desc}</p>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Meeting Protocol & Minutes Summary Snapshot */}
          <Card className="p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate2-100">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-brand" />
                <h3 className="text-sm font-bold text-slate2-900">Recorded Meeting Summary</h3>
              </div>
              {onNavigateTab && (
                <button
                  type="button"
                  onClick={() => onNavigateTab("minutes")}
                  className="text-xs font-semibold text-brand hover:underline cursor-pointer"
                >
                  Full Protocol & Minutes →
                </button>
              )}
            </div>

            {summaryMinute?.content ? (
              <div className="mt-3.5 space-y-3">
                <div className="rounded-xl border border-slate2-200/80 bg-slate2-50/30 p-4 max-h-48 overflow-y-auto text-xs leading-relaxed text-slate2-700">
                  <RichTextRenderer content={summaryMinute.content} />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate2-400 pt-1">
                  <span>
                    Recorded by{" "}
                    <strong className="text-slate2-700 font-medium">
                      {summaryMinute.recordedBy?.name || meeting.organizer?.name || "Meeting Secretary"}
                    </strong>
                  </span>
                  <span>{new Date(summaryMinute.updatedAt || summaryMinute.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-slate2-200 p-6 text-center">
                <FileText size={22} className="mx-auto text-slate2-300 mb-1.5" />
                <p className="text-xs font-medium text-slate2-700">No meeting summary recorded yet</p>
                <p className="text-[11px] text-slate2-400 mt-0.5">
                  Capture official minutes and discussion points in the Minutes tab.
                </p>
                {onNavigateTab && (
                  <Button
                    variant="secondary"
                    onClick={() => onNavigateTab("minutes")}
                    className="mt-3 text-xs py-1.5 px-3"
                  >
                    Open Minutes Tab
                  </Button>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* Right 1 Column: Attendance Attendance & Recent Outcomes */}
        <div className="space-y-6">
          {/* Attendance & Attendance Breakdown */}
          <Card className="p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate2-100">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-brand" />
                <h3 className="text-sm font-bold text-slate2-900">Attendance Breakdown</h3>
              </div>
              {onNavigateTab && (
                <button
                  type="button"
                  onClick={() => onNavigateTab("participants")}
                  className="text-xs font-semibold text-brand hover:underline cursor-pointer"
                >
                  Manage Roster →
                </button>
              )}
            </div>

            <div className="mt-3.5 space-y-3">
              {/* Progress bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate2-600">
                  <span className="font-medium">Attendance Attained</span>
                  <span className="font-bold text-slate2-800">{attendancePercentage}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate2-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${attendancePercentage}%`,
                      backgroundColor: attendancePercentage >= 60 ? "#0B7A6B" : "#D97706",
                    }}
                  />
                </div>
              </div>

              {/* Status pills */}
              <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-2">
                  <p className="text-base font-bold text-emerald-800">{acceptedCount}</p>
                  <p className="text-[10px] font-semibold text-emerald-700">Accepted</p>
                </div>
                <div className="rounded-lg bg-rose-50 border border-rose-100 p-2">
                  <p className="text-base font-bold text-rose-800">{rejectedCount}</p>
                  <p className="text-[10px] font-semibold text-rose-700">Declined</p>
                </div>
                <div className="rounded-lg bg-amber-50 border border-amber-100 p-2">
                  <p className="text-base font-bold text-amber-800">{awaitingCount}</p>
                  <p className="text-[10px] font-semibold text-amber-700">Awaiting</p>
                </div>
              </div>

              {/* Quick Attendee preview list */}
              <div className="divide-y divide-slate2-100 pt-1">
                {participants.slice(0, 4).map((p) => (
                  <div key={p.id} className="py-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="inline-block h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: p.user?.avatarColor || "#0B7A6B" }}
                      />
                      <span className="text-xs font-semibold text-slate2-800 truncate">
                        {p.user?.name || "Participant"}
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${p.status === "ACCEPTED"
                        ? "bg-emerald-50 text-emerald-700"
                        : p.status === "REJECTED" || p.status === "DECLINED"
                          ? "bg-rose-50 text-rose-700"
                          : "bg-slate2-100 text-slate2-600"
                        }`}
                    >
                      {p.status === "ACCEPTED"
                        ? "Accepted"
                        : p.status === "REJECTED" || p.status === "DECLINED"
                          ? "Declined"
                          : "Awaiting"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Key Decisions Snapshot */}
          <Card className="p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate2-100">
              <div className="flex items-center gap-2">
                <Gavel size={16} className="text-brand" />
                <h3 className="text-sm font-bold text-slate2-900">Decisions Registry</h3>
              </div>
              {onNavigateTab && (
                <button
                  type="button"
                  onClick={() => onNavigateTab("decisions")}
                  className="text-xs font-semibold text-brand hover:underline cursor-pointer"
                >
                  View All ({decisions.length}) →
                </button>
              )}
            </div>

            {decisions.length === 0 ? (
              <p className="py-4 text-xs text-slate2-400 text-center">No decisions recorded yet.</p>
            ) : (
              <div className="divide-y divide-slate2-100 mt-2">
                {decisions.slice(0, 3).map((d) => (
                  <div key={d.id} className="py-2.5 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-bold text-slate2-700">{d.code}</span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${d.status === "IMPLEMENTED"
                          ? "bg-emerald-50 text-emerald-800"
                          : "bg-amber-50 text-amber-800"
                          }`}
                      >
                        {d.status}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-slate2-900 line-clamp-1">{d.title}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function AgendaTab({
  meeting,
  canManage,
  onChange,
}: {
  meeting: MeetingDetailType;
  canManage: boolean;
  onChange: () => void;
}) {
  const { confirm } = useAlert();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [presenter, setPresenter] = useState("");
  const [duration, setDuration] = useState(15);
  const [submitting, setSubmitting] = useState(false);

  // Edit mode state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPresenter, setEditPresenter] = useState("");
  const [editDuration, setEditDuration] = useState(15);
  const [editStatus, setEditStatus] = useState<AgendaStatus>("PENDING");
  const [updating, setUpdating] = useState(false);

  // Participant names for presenter dropdown (meeting participants + organizer)
  const presenterOptions = useMemo(() => {
    const names = new Set<string>();
    if (meeting.participants) {
      meeting.participants.forEach((p) => {
        if (p.user?.name) names.add(p.user.name);
      });
    }
    if (meeting.organizer?.name) {
      names.add(meeting.organizer.name);
    }
    return Array.from(names);
  }, [meeting.participants, meeting.organizer]);

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      await api.post(`/meetings/${meeting.id}/agenda`, {
        title: title.trim(),
        description: description.trim() || undefined,
        presenter: presenter.trim() || undefined,
        durationMin: duration,
      });
      setTitle("");
      setDescription("");
      setPresenter("");
      setDuration(15);
      onChange();
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (a: AgendaItem) => {
    setEditingId(a.id);
    setEditTitle(a.title);
    setEditDescription(a.description || "");
    setEditPresenter(a.presenter || "");
    setEditDuration(a.durationMin);
    setEditStatus(a.status);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async (agendaId: string) => {
    if (!editTitle.trim()) return;
    setUpdating(true);
    try {
      await api.put(`/meetings/agenda/${agendaId}`, {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        presenter: editPresenter.trim() || null,
        durationMin: editDuration,
        status: editStatus,
      });
      setEditingId(null);
      onChange();
    } finally {
      setUpdating(false);
    }
  };

  const deleteItem = async (agendaId: string) => {
    const confirmed = await confirm({
      title: "Remove Agenda Item",
      message: "Are you sure you want to remove this agenda item?",
      tone: "danger",
      confirmLabel: "Remove",
      cancelLabel: "Cancel",
    });
    if (!confirmed) return;
    try {
      await api.delete(`/meetings/agenda/${agendaId}`);
      onChange();
    } catch {
      // ignore
    }
  };

  const totalAgendaMinutes = useMemo(() => {
    return (meeting.agendaItems || []).reduce((acc, item) => acc + (item.durationMin || 0), 0);
  }, [meeting.agendaItems]);

  return (
    <Card className="overflow-hidden border border-slate2-200/90 shadow-sm bg-white">
      {/* Timetable Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate2-100 bg-slate2-50/50 px-5 py-4">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-slate2-900">
            Agenda & Proceedings Timetable
          </h2>
          <p className="mt-0.5 text-xs text-slate2-500">
            {(meeting.agendaItems || []).length} topics scheduled · {totalAgendaMinutes} min planned duration
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-slate2-200 px-2.5 py-1 text-xs font-semibold text-slate2-700 shadow-2xs">
            <Clock size={13} className="text-brand" />
            <span>Total: {totalAgendaMinutes} mins</span>
          </span>
        </div>
      </div>

      {/* Agenda Items List */}
      <div className="divide-y divide-slate2-100">
        {(meeting.agendaItems || []).length === 0 ? (
          <div className="p-8">
            <EmptyState
              title="No agenda topics scheduled yet"
              description="Outline the discussion topics, assign presenters, and estimate durations below."
            />
          </div>
        ) : (
          (meeting.agendaItems || []).map((a, idx) => {
            const isEditing = editingId === a.id;
            const itemPresenterOptions =
              a.presenter && !presenterOptions.includes(a.presenter)
                ? [a.presenter, ...presenterOptions]
                : presenterOptions;

            if (isEditing) {
              return (
                <div key={a.id} className="bg-slate2-50/90 p-5 space-y-4 border-l-4 border-l-brand">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-brand">
                      Edit Topic #{idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="text-slate2-400 hover:text-slate2-600 transition-colors"
                      title="Cancel edit"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                    <div className="sm:col-span-6">
                      <label className="mb-1 block text-xs font-medium text-slate2-600">
                        Topic title <span className="text-danger">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder="Agenda topic title"
                        className={inputClass}
                      />
                    </div>

                    <div className="sm:col-span-4">
                      <label className="mb-1 block text-xs font-medium text-slate2-600">
                        Presenter
                      </label>
                      <select
                        value={editPresenter}
                        onChange={(e) => setEditPresenter(e.target.value)}
                        className={`${inputClass} bg-white cursor-pointer`}
                      >
                        <option value="">Select Presenter (Optional)</option>
                        {itemPresenterOptions.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-slate2-600">
                        Duration (min)
                      </label>
                      <input
                        type="number"
                        min={5}
                        step={5}
                        value={editDuration}
                        onChange={(e) => setEditDuration(Number(e.target.value))}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div className="w-full">
                    <label className="mb-1 block text-xs font-medium text-slate2-600">
                      Topic Details & Objectives
                    </label>
                    <textarea
                      rows={3}
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Outline discussion objectives, key data points, or background context..."
                      className={`${inputClass} min-h-[76px] w-full resize-y text-slate2-800 bg-white leading-relaxed placeholder:text-slate2-400`}
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-medium text-slate2-600">Discussion Status:</label>
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value as AgendaStatus)}
                        className="rounded-lg border border-slate2-200 bg-white px-2.5 py-1 text-xs text-slate2-700 focus-ring font-medium"
                      >
                        <option value="PENDING">PENDING</option>
                        <option value="DISCUSSED">DISCUSSED</option>
                        <option value="DEFERRED">DEFERRED</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={cancelEdit}
                        disabled={updating}
                        className="text-xs"
                      >
                        <X size={13} /> Cancel
                      </Button>
                      <Button
                        type="button"
                        onClick={() => saveEdit(a.id)}
                        disabled={updating || !editTitle.trim()}
                        className="text-xs"
                      >
                        <Check size={13} /> {updating ? "Saving..." : "Save changes"}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={a.id}
                className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 p-4 sm:p-5 hover:bg-slate2-50/40 transition-colors"
              >
                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                  {/* Sequence & Duration Badge */}
                  <div className="flex flex-col items-center justify-center h-12 w-12 rounded-xl border border-slate2-200 bg-slate2-50 shrink-0 text-center">
                    <span className="font-mono text-xs font-bold text-slate2-700">
                      #{String(idx + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[10px] font-semibold text-brand font-mono">
                      {a.durationMin}m
                    </span>
                  </div>

                  {/* Topic Details */}
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-xs sm:text-sm font-bold text-slate2-900">
                        {a.title}
                      </h4>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${a.status === "DISCUSSED"
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          : a.status === "DEFERRED"
                            ? "bg-amber-50 text-amber-800 border border-amber-200"
                            : "bg-slate2-100 text-slate2-600"
                          }`}
                      >
                        {a.status.replace("_", " ")}
                      </span>
                    </div>

                    {a.description && (
                      <p className="text-xs text-slate2-600 leading-relaxed rounded-lg bg-slate2-50/60 border border-slate2-200/60 p-2.5 whitespace-pre-wrap">
                        {a.description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate2-500 pt-0.5">
                      {a.presenter ? (
                        <span className="inline-flex items-center gap-1 rounded bg-slate2-100 px-2 py-0.5 text-[11px] font-medium text-slate2-700">
                          Presenter: <strong className="font-semibold text-slate2-800">{a.presenter}</strong>
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate2-400 italic">No presenter assigned</span>
                      )}
                      <span className="text-slate2-300">·</span>
                      <span className="text-[11px] font-mono text-slate2-500">{a.durationMin} minutes</span>
                    </div>
                  </div>
                </div>

                {canManage && (
                  <div className="flex items-center gap-1 self-end sm:self-start shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(a)}
                      className="rounded-lg p-1.5 text-slate2-400 hover:bg-slate2-100 hover:text-slate2-700 transition-colors"
                      title="Edit topic"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteItem(a.id)}
                      className="rounded-lg p-1.5 text-slate2-400 hover:bg-red-50 hover:text-danger transition-colors"
                      title="Delete topic"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Add Topic Form */}
      {canManage && (
        <form
          onSubmit={addItem}
          className="border-t border-slate2-200/80 bg-slate2-50/40 p-5 sm:p-6 space-y-4"
        >
          <div className="flex items-center gap-2">
            <Plus size={16} className="text-brand" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate2-700">
              Schedule New Agenda Topic
            </h3>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-12">
            <div className="sm:col-span-6">
              <label className="mb-1 block text-xs font-medium text-slate2-600">
                Topic Title <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Q3 Logistics Fleet Fuel Optimization"
                className={inputClass}
              />
            </div>

            <div className="sm:col-span-4">
              <label className="mb-1 block text-xs font-medium text-slate2-600">
                Presenter (Optional)
              </label>
              <select
                value={presenter}
                onChange={(e) => setPresenter(e.target.value)}
                className={`${inputClass} bg-white cursor-pointer`}
              >
                <option value="">Select Presenter (Optional)</option>
                {presenterOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate2-600">
                Duration (min)
              </label>
              <input
                type="number"
                min={5}
                step={5}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className={inputClass}
              />
            </div>
          </div>

          <div className="w-full">
            <label className="mb-1 block text-xs font-medium text-slate2-600">
              Topic Details & Objectives (Optional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Outline specific objectives, items for deliberation, or background notes..."
              className={`${inputClass} min-h-[64px] w-full resize-y text-slate2-800 bg-white leading-relaxed placeholder:text-slate2-400`}
            />
          </div>

          <div className="flex justify-end pt-1">
            <Button type="submit" disabled={submitting || !title.trim()} className="text-xs">
              <Plus size={14} /> Add Agenda Topic
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}



function MinutesTab({
  meeting,
  canManage,
  onChange,
  canApprove,
  onApproveClick,
  onRequestSignaturesClick,
  requestingSignatures,
  onParticipantSignClick,
  isEligibleSigner,
  hasUserSigned,
  requiredSigners,
  totalSignersCount,
  signedCount,
}: {
  meeting: MeetingDetailType;
  canManage: boolean;
  onChange: () => void;
  canApprove?: boolean;
  onApproveClick?: () => void;
  onRequestSignaturesClick?: () => void;
  requestingSignatures?: boolean;
  onParticipantSignClick?: () => void;
  isEligibleSigner?: boolean;
  hasUserSigned?: boolean;
  requiredSigners: Array<{
    id: string;
    userId: string;
    user: {
      id: string;
      name: string;
      email?: string;
      avatarColor?: string | null;
      department?: { name: string } | null;
      role?: { name: string; code: string } | null;
    };
    roleLabel: string;
  }>;
  totalSignersCount: number;
  signedCount: number;
}) {
  const { user, hasPermission } = useAuth();
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Meeting Summary State
  const summaryMinute = useMemo(() => {
    return (meeting.minutes || []).find(
      (m) => m.type === "SUMMARY" || (!m.type && !m.attendeeId)
    );
  }, [meeting.minutes]);

  const isApproved = meeting.status === "APPROVED";
  const isCompleted = meeting.status === "COMPLETED";
  const isCancelled = meeting.status === "CANCELLED";
  const isPendingSignatures = meeting.status === "PENDING_SIGNATURES";
  const isReadyForApproval = meeting.status === "READY_FOR_APPROVAL";
  const isReadOnly = isLockedMeeting(meeting.status) || !canManage;

  const [isEditing, setIsEditing] = useState(false);
  const [summaryContent, setSummaryContent] = useState("");
  const [savingSummary, setSavingSummary] = useState(false);

  // Export dropdown state
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setExportMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handlePrintMinutes = () => {
    printMeetingMinutes({
      meeting,
      minutesContent: summaryContent || summaryMinute?.content || "",
    });
  };

  const handleExportMinutes = (type: "pdf" | "doc" | "excel" | "text") => {
    setExportMenuOpen(false);
    const content = summaryContent || summaryMinute?.content || "";
    if (type === "pdf") {
      exportMeetingMinutesToPdf(meeting, content);
    } else if (type === "doc") {
      exportMeetingMinutesToDoc(meeting, content);
    } else if (type === "excel") {
      exportMeetingMinutesToExcel(meeting, content);
    } else if (type === "text") {
      exportMeetingMinutesToText(meeting, content);
    }
  };

  // Load existing saved summary into state
  useEffect(() => {
    if (!isEditing) {
      setSummaryContent(summaryMinute?.content || "");
    }
  }, [summaryMinute, isEditing]);

  const handleSaveSummary = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isReadOnly) return;
    if (!summaryContent.trim()) {
      setToast({ message: "Summary cannot be empty.", type: "error" });
      return;
    }
    setSavingSummary(true);
    try {
      await api.put(`/meetings/${meeting.id}/minutes/summary`, { content: summaryContent });
      setIsEditing(false);
      setToast({ message: "Meeting summary saved successfully.", type: "success" });
      onChange();
    } catch (err: any) {
      setToast({ message: err.message || "Failed to save meeting summary.", type: "error" });
    } finally {
      setSavingSummary(false);
    }
  };

  return (
    <div className="space-y-6">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Official Digital Signature & Attestation Certificate */}
      {meeting.status === "APPROVED" && (
        <Card className="overflow-hidden border border-brand/25 bg-gradient-to-br from-brand/[0.04] via-white to-slate2-50/50 p-5 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="flex items-start gap-3.5">
              <div className="rounded-xl bg-brand/10 p-3 text-brand shrink-0">
                <ShieldCheck size={26} />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-semibold text-slate2-900 text-sm">
                    Minutes Formally Approved & Certified
                  </h4>
                  <span className="rounded-full bg-brand/15 text-brand px-2.5 py-0.5 text-[10px] font-bold tracking-wide uppercase">
                    Locked & Verified
                  </span>
                  {meeting.forceApproved && (
                    <span className="rounded-full bg-amber-100 border border-amber-300 text-amber-800 px-2.5 py-0.5 text-[10px] font-bold tracking-wide uppercase">
                      Admin Force Approved (Override)
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate2-600 max-w-xl">
                  These proceedings and recorded minutes have been formally reviewed, signed, and locked by an authorized reviewer.
                  All minutes and action points are permanently archived as corporate record.
                </p>
                {meeting.approvedBy && meeting.approvedAt && (
                  <p className="text-xs font-medium text-slate2-700 pt-1">
                    Approved by <span className="text-brand font-semibold">{meeting.approvedBy.name}</span> on{" "}
                    {new Date(meeting.approvedAt).toLocaleString()}
                  </p>
                )}
                {meeting.forceApproved && (
                  <div className="text-xs text-amber-900 bg-amber-50/90 border border-amber-200/90 rounded-md p-2 mt-1 max-w-xl">
                    <p className="font-semibold text-amber-950">Administrative Override Notice:</p>
                    <p className="text-amber-800/90 mt-0.5">
                      This meeting was certified by the administrator before all participant pre-signatures were collected.
                    </p>
                    {meeting.bypassReason && (
                      <p className="mt-1 text-[11px] text-amber-900 font-medium">
                        <strong>Reason:</strong> {meeting.bypassReason}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {meeting.approvalSignature && (
              <div className="rounded-xl border border-brand/20 bg-white p-3.5 text-center shadow-xs shrink-0 self-start md:self-auto min-w-[200px]">
                <span className="block text-[10px] font-semibold text-slate2-400 uppercase tracking-wider mb-1">
                  Official Reviewer Signature
                </span>
                <div className="flex items-center justify-center min-h-[50px] bg-slate2-50/50 rounded-lg p-1">
                  <img
                    src={meeting.approvalSignature}
                    alt="Official Reviewer Signature"
                    className="max-h-12 max-w-[170px] object-contain"
                  />
                </div>
                <div className="mx-auto mt-2 h-0.5 w-28 bg-brand/30 rounded-full" />
                <span className="mt-1 block text-[9px] text-slate2-400 font-mono tracking-tight">
                  Ahununu Digital Seal
                </span>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Workflow Phase 1: Pre-Signing Gate Active (inside Minutes Tab) */}
      {meeting.status === "PENDING_SIGNATURES" && (
        <div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50/90 via-amber-50/40 to-white p-5 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="rounded-lg bg-amber-100 p-2.5 text-amber-700 shrink-0">
                <Clock size={22} className="text-amber-700" />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm sm:text-base text-amber-950">
                    Participant Pre-Signing Gate Active
                  </span>
                  <span className="rounded-full bg-amber-100 border border-amber-300 px-2.5 py-0.5 text-[10px] font-bold text-amber-900 tracking-wide uppercase">
                    {signedCount} of {totalSignersCount} SIGNED
                  </span>
                  <span className="rounded-full bg-slate2-100 border border-slate2-200 px-2 py-0.5 text-[10px] font-semibold text-slate2-600">
                    PROTECTED / READ-ONLY
                  </span>
                </div>
                <p className="text-xs text-amber-800/90 leading-relaxed max-w-2xl">
                  Meeting minutes are undergoing participant verification. All confirmed attendees and organizers can review and affix their digital signature below.
                  Authorized reviewers and administrators may certify and lock the proceedings at any time.
                </p>
                <div className="pt-1 flex items-center gap-3">
                  <div className="h-2 w-48 rounded-full bg-amber-200/80 overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all duration-300"
                      style={{
                        width: `${totalSignersCount > 0 ? (signedCount / totalSignersCount) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-amber-900">
                    {totalSignersCount > 0 ? Math.round((signedCount / totalSignersCount) * 100) : 0}% Collected ({signedCount}/{totalSignersCount})
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-start lg:self-center">
              {isEligibleSigner && !hasUserSigned && (
                <Button
                  variant="primary"
                  type="button"
                  onClick={() => onParticipantSignClick?.()}
                  className="bg-brand hover:bg-brand-light text-white text-xs py-2 px-3.5 shadow-sm inline-flex items-center gap-1.5 font-semibold"
                >
                  <Signature size={13} /> Review & Sign Minutes
                </Button>
              )}
              {isEligibleSigner && hasUserSigned && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-100/90 border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-800">
                  <Signature size={14} className="text-emerald-600" /> You Have Signed
                </span>
              )}
              {canApprove && hasPermission("ADMIN_OVERRIDE") && (
                <Button
                  variant="secondary"
                  type="button"
                  onClick={onApproveClick}
                  className="text-xs py-2 px-3.5 inline-flex items-center gap-1.5 bg-white hover:bg-slate2-50 font-semibold border-brand/30 text-brand shadow-xs cursor-pointer"
                  title="Certify, sign and lock meeting minutes (Administrator Override)"
                >
                  <ShieldCheck size={14} className="text-brand" />
                  <span>Sign & Approve Meeting</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Workflow Phase 2: All Participant Signatures Collected — Ready for Final Approval (inside Minutes Tab) */}
      {meeting.status === "READY_FOR_APPROVAL" && (
        <div className="rounded-xl border border-teal-200 bg-gradient-to-r from-teal-50 via-teal-50/40 to-white p-5 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="rounded-lg bg-teal-100 p-2.5 text-brand shrink-0">
                <CheckCircle2 size={22} className="text-brand" />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm sm:text-base text-teal-950">
                    All Required Signatures Collected
                  </span>
                  <span className="rounded-full bg-teal-100 border border-teal-300 px-2.5 py-0.5 text-[10px] font-bold text-teal-900 tracking-wide uppercase">
                    Ready for Approval ({signedCount}/{totalSignersCount})
                  </span>
                </div>
                <p className="text-xs text-teal-800/90 leading-relaxed max-w-2xl">
                  All {totalSignersCount} meeting attendees and organizers have submitted their digital signatures.
                  The Reviewer / Systems Administrator can now provide final formal certification.
                </p>
              </div>
            </div>

            <div className="shrink-0 self-start lg:self-center">
              {canApprove ? (
                <Button
                  variant="primary"
                  type="button"
                  onClick={onApproveClick}
                  className="bg-brand hover:bg-brand-light text-white text-xs py-2.5 px-4 shadow-sm inline-flex items-center gap-1.5 font-semibold"
                >
                  <ShieldCheck size={14} /> Approve Meeting & Minutes
                </Button>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate2-600 bg-white border border-slate2-200 rounded-lg px-3 py-1.5">
                  <Clock size={13} className="text-slate2-400" /> Awaiting Reviewer Signature
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {canManage && (meeting.status === "IN_PROGRESS" || meeting.status === "SCHEDULED" || meeting.status === "COMPLETED" || meeting.status === "PENDING_SIGNATURES") && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-brand/20 bg-brand/5 px-4 py-3 text-xs">
          <div className="flex items-center gap-2.5 text-brand-dark">
            <Signature size={18} className="text-brand shrink-0" />
            <span>
              {meeting.status === "PENDING_SIGNATURES" ? (
                <>
                  <strong>Signature Collection in Progress:</strong> {signedCount} of {totalSignersCount} signatures collected. You can resend in-app signature requests to notify unsigned signers.
                </>
              ) : (
                <>
                  <strong>Minutes Drafting:</strong> Meeting summary recorded. When finalized, request digital signatures from all participants.
                </>
              )}
            </span>
          </div>
          <Button
            variant="secondary"
            type="button"
            onClick={onRequestSignaturesClick}
            disabled={requestingSignatures}
            className="border-brand/30 text-brand hover:bg-brand/10 text-xs py-1.5 px-3 shrink-0 inline-flex items-center gap-1.5 font-medium bg-white disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            <Signature size={13} /> {requestingSignatures ? "Sending Notifications..." : meeting.status === "PENDING_SIGNATURES" ? "Resend Signature Requests" : "Request Participant Signatures"}
          </Button>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MEETING SUMMARY CARD
          ───────────────────────────────────────────────────────────── */}
      <Card className="border border-slate2-200/80 bg-white p-6 rounded-2xl shadow-xs">
        {/* Top Header Row */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#E6F4F1] text-[#0B7A6B]">
              <FileText size={20} className="text-[#0B7A6B]" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate2-900 leading-snug">Meeting Summary</h3>
              <p className="text-xs text-slate2-500 mt-0.5">
                General overview and key points discussed in this meeting
              </p>
            </div>
          </div>

          {/* Action Buttons on Top Right */}
          <div className="flex items-center gap-2">
            {summaryMinute?.content && !isEditing && (
              <>
                {/* Print Button */}
                <button
                  type="button"
                  onClick={handlePrintMinutes}
                  id="print-minutes-btn"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate2-200 bg-white text-slate2-700 hover:bg-slate2-50 hover:border-slate2-300 transition-colors shadow-2xs cursor-pointer"
                  title="Print Meeting Minutes (Clean Corporate Letterhead)"
                >
                  <Printer size={16} className="text-slate2-700" />
                </button>

                {/* Export Split Dropdown Button */}
                <div className="relative inline-flex items-center h-9 rounded-lg border border-slate2-200 bg-white text-slate2-700 shadow-2xs" ref={exportMenuRef}>
                  <button
                    type="button"
                    id="export-minutes-btn"
                    onClick={() => handleExportMinutes("pdf")}
                    className="flex h-full px-2.5 items-center justify-center hover:bg-slate2-50 hover:text-slate2-900 rounded-l-lg transition-colors border-r border-slate2-200 cursor-pointer"
                    title="Export Meeting Minutes to PDF (.pdf)"
                  >
                    <Download size={16} className="text-slate2-700" />
                  </button>
                  <button
                    type="button"
                    id="export-minutes-options-btn"
                    onClick={() => setExportMenuOpen(!exportMenuOpen)}
                    className="flex h-full px-2 items-center justify-center hover:bg-slate2-50 hover:text-slate2-900 rounded-r-lg transition-colors cursor-pointer"
                    title="Export format options"
                    aria-label="Export format options"
                  >
                    <ChevronDown size={14} className="text-slate2-700" />
                  </button>

                  {exportMenuOpen && (
                    <div className="absolute right-0 top-full z-30 mt-1.5 w-52 rounded-xl border border-slate2-200 bg-white py-1.5 shadow-lg text-xs font-medium text-slate2-700">
                      <button
                        type="button"
                        onClick={() => handleExportMinutes("pdf")}
                        className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left hover:bg-slate2-50 text-slate2-700 transition-colors"
                      >
                        <FileText size={15} className="text-rose-600" />
                        <span>PDF Document (.pdf)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportMinutes("doc")}
                        className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left hover:bg-slate2-50 text-slate2-700 transition-colors"
                      >
                        <FileText size={15} className="text-blue-600" />
                        <span>Word Document (.doc)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportMinutes("excel")}
                        className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left hover:bg-slate2-50 text-slate2-700 transition-colors"
                      >
                        <FileSpreadsheet size={15} className="text-emerald-600" />
                        <span>Excel Summary (.xlsx)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportMinutes("text")}
                        className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left hover:bg-slate2-50 text-slate2-700 transition-colors"
                      >
                        <FileText size={15} className="text-slate2-500" />
                        <span>Plain Text (.txt)</span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}

            {isApproved && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate2-100 px-2.5 py-1 text-xs font-medium text-slate2-600">
                <Lock size={12} /> Certified & Locked (Read-only)
              </span>
            )}
            {isCompleted && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate2-100 px-2.5 py-1 text-xs font-medium text-slate2-600">
                <Lock size={12} /> Meeting Completed (Read-only)
              </span>
            )}
            {isCancelled && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700">
                <Lock size={12} /> Meeting Cancelled (Read-only)
              </span>
            )}
            {isPendingSignatures && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 border border-amber-200">
                <Lock size={12} /> Signing In Progress (Read-only)
              </span>
            )}
            {isReadyForApproval && (
              <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-800 border border-teal-200">
                <Lock size={12} /> Ready for Approval (Read-only)
              </span>
            )}
            {!isApproved && !isCompleted && !isCancelled && !isPendingSignatures && !isReadyForApproval && !canManage && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate2-100 px-2.5 py-1 text-xs font-medium text-slate2-600">
                <Lock size={12} /> Read-only View
              </span>
            )}
          </div>
        </div>

        {/* Meeting Summary Content & Footer */}
        {isEditing ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-slate2-200 overflow-hidden bg-white p-2">
              <RichTextEditor
                value={summaryContent}
                onChange={setSummaryContent}
                placeholder="Write a general summary of the meeting..."
                minHeight="260px"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <p className="text-xs text-slate2-400">
                Use headings (H1, H2, H3), bold, lists, quotes, links, tables, images, and attachments as needed.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  type="button"
                  disabled={savingSummary}
                  onClick={() => {
                    setIsEditing(false);
                    setSummaryContent(summaryMinute?.content || "");
                  }}
                  className="text-xs sm:text-sm py-2 px-4 rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  type="button"
                  disabled={savingSummary || !summaryContent.trim()}
                  onClick={handleSaveSummary}
                  className="bg-brand hover:bg-brand-dark text-white text-xs sm:text-sm py-2 px-5 shadow-sm inline-flex items-center gap-1.5 rounded-xl font-semibold"
                >
                  {savingSummary ? (
                    <>
                      <Loader2 size={15} className="animate-spin" /> Saving...
                    </>
                  ) : (
                    <>
                      <Save size={15} /> Save Meeting Summary
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        ) : summaryMinute?.content ? (
          <div className="mt-5 space-y-4">
            {/* The Main Content Box */}
            <div className="rounded-2xl border border-slate2-200 bg-white p-5 min-h-[90px] shadow-2xs">
              <RichTextRenderer content={summaryMinute.content} />
            </div>

            {/* Bottom Row: Last recorded by ... & Edit Summary button */}
            <div className="flex flex-wrap items-center justify-end gap-3.5 text-xs pt-0.5">
              <span className="text-slate2-500">
                Last recorded by{" "}
                <strong className="font-semibold text-slate2-800">
                  {summaryMinute.recordedBy?.name || meeting.organizer?.name || "Dawit Bekele"}
                </strong>
                {" · "}
                {new Date(summaryMinute.updatedAt || summaryMinute.createdAt).toLocaleDateString("en-US")}
              </span>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(true);
                    setSummaryContent(summaryMinute.content);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate2-200 bg-white px-4 py-2 text-xs font-semibold text-slate2-800 hover:bg-slate2-50 hover:border-slate2-300 transition-colors shadow-2xs cursor-pointer"
                >
                  <Pencil size={14} className="text-slate2-600" />
                  <span>Edit Summary</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-slate2-200 bg-slate2-50/40 p-8 text-center">
            <FileText size={28} className="mx-auto text-slate2-300 mb-2" />
            <p className="text-sm font-medium text-slate2-700">No meeting summary recorded yet</p>
            <p className="mt-1 text-xs text-slate2-400 max-w-sm mx-auto">
              Capture the general overview and key discussion points so nothing gets lost.
            </p>
            {!isReadOnly && (
              <div className="mt-4">
                <Button
                  variant="primary"
                  onClick={() => {
                    setIsEditing(true);
                    setSummaryContent("");
                  }}
                  className="text-xs py-2 px-4 bg-brand hover:bg-brand-dark text-white inline-flex items-center gap-1.5 rounded-xl font-semibold"
                >
                  <Plus size={14} /> Write Meeting Summary
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ─────────────────────────────────────────────────────────────
          PARTICIPANT & ORGANIZER PRE-SIGNATURES & ATTESTATIONS ROSTER
          ───────────────────────────────────────────────────────────── */}
      {(meeting.status === "PENDING_SIGNATURES" ||
        meeting.status === "READY_FOR_APPROVAL" ||
        meeting.status === "APPROVED" ||
        (meeting.participantSignatures && meeting.participantSignatures.length > 0)) && (
          <Card className="overflow-hidden border border-slate2-200/80 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate2-100 bg-slate2-50/50 px-5 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/10 text-brand font-semibold text-xs">
                    <UserCheck size={15} />
                  </span>
                  <h3 className="text-base font-semibold text-slate2-900">
                    Attendee & Organizer Pre-Signatures
                  </h3>
                </div>
                <p className="mt-0.5 text-xs text-slate2-500">
                  Digital verification submitted by confirmed attendees and organizers before formal approval ({signedCount} of {totalSignersCount} signed)
                </p>
              </div>

              <div className="flex items-center gap-2">
                {canManage && signedCount < totalSignersCount && meeting.status === "PENDING_SIGNATURES" && (
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={onRequestSignaturesClick}
                    disabled={requestingSignatures}
                    className="border-slate2-200 bg-white hover:bg-slate2-50 text-slate2-700 text-xs py-1.5 px-3 inline-flex items-center gap-1.5 font-medium shadow-2xs cursor-pointer disabled:opacity-60"
                  >
                    <Bell size={13} className="text-amber-600" />
                    <span>{requestingSignatures ? "Sending..." : "Resend Request"}</span>
                  </Button>
                )}
                {isEligibleSigner && !hasUserSigned && meeting.status === "PENDING_SIGNATURES" && (
                  <Button
                    variant="primary"
                    type="button"
                    onClick={() => onParticipantSignClick?.()}
                    className="bg-brand hover:bg-brand-light text-white text-xs py-1.5 px-3.5 inline-flex items-center gap-1.5 font-semibold shadow-xs"
                  >
                    <Signature size={13} /> Sign Minutes
                  </Button>
                )}
              </div>
            </div>

            <div className="p-5 space-y-4">
              {/* Progress bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-slate2-600">
                  <span className="font-medium">Signature Collection Progress</span>
                  <span className={`font-semibold ${signedCount >= totalSignersCount && totalSignersCount > 0 ? "text-emerald-600" : "text-amber-600"}`}>
                    {signedCount} / {totalSignersCount} Signed ({totalSignersCount > 0 ? Math.round((signedCount / totalSignersCount) * 100) : 0}%)
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate2-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${totalSignersCount > 0 ? (signedCount / totalSignersCount) * 100 : 0}%`,
                      background: signedCount >= totalSignersCount && totalSignersCount > 0 ? "#10b981" : "#0B7A6B",
                    }}
                  />
                </div>
              </div>

              {/* Attendee & organizer signature cards grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {requiredSigners.map((signer) => {
                  const sig = meeting.participantSignatures?.find((s) => s.userId === signer.userId);
                  const isMe = signer.userId === user?.id;
                  return (
                    <div
                      key={signer.userId}
                      className={`rounded-xl border p-3.5 transition-all flex flex-col justify-between ${sig
                        ? "border-emerald-200/90 bg-emerald-50/20"
                        : "border-slate2-200 bg-white"
                        }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-2xs"
                              style={{ background: (signer.user as any).avatarColor || "#0B7A6B" }}
                            >
                              {signer.user.name.charAt(0).toUpperCase()}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-xs font-semibold text-slate2-900 truncate">
                                  {signer.user.name}
                                </p>
                                {isMe && (
                                  <span className="rounded bg-brand/10 text-brand px-1 py-0.2 text-[9px] font-bold">
                                    You
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-slate2-500 truncate">
                                {signer.roleLabel} · {signer.user.email}
                              </p>
                            </div>
                          </div>

                          {sig ? (
                            <span
                              className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-600 shadow-2xs shrink-0"
                              title={`Signed on ${new Date(sig.signedAt).toLocaleDateString()}`}
                            >
                              <Signature size={14} />
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-amber-50 border border-amber-200 text-amber-600 shadow-2xs shrink-0"
                              title="Signature pending"
                            >
                              <Signature size={14} className="opacity-70" />
                            </span>
                          )}
                        </div>

                        {sig ? (
                          <div className="mt-2 rounded-lg border border-emerald-100 bg-white p-2 text-center">
                            <img
                              src={sig.signatureDataUrl}
                              alt={`${signer.user.name}'s signature`}
                              className="h-10 max-w-[140px] mx-auto object-contain"
                            />
                            <div className="mt-1 pt-1 border-t border-slate2-100 flex items-center justify-between text-[9px] text-slate2-400">
                              <span>Attested</span>
                              <span>{new Date(sig.signedAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-2 rounded-lg border border-dashed border-slate2-200 bg-slate2-50/50 p-3 text-center">
                            <p className="text-[11px] text-slate2-400 italic">Signature pending</p>
                            {meeting.status === "PENDING_SIGNATURES" && isMe && (
                              <button
                                type="button"
                                onClick={() => onParticipantSignClick?.()}
                                className="mt-1.5 text-[11px] text-brand hover:underline font-semibold inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Signature size={11} /> Sign Now →
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        )}
    </div>
  );
}

function DecisionsTab({
  meeting,
  canManage,
  onChange,
}: {
  meeting: MeetingDetailType;
  canManage: boolean;
  onChange: () => void;
}) {
  const { alert, confirm } = useAlert();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState<DecisionStatus>("OPEN");
  const [updating, setUpdating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      await api.post(`/meetings/${meeting.id}/decisions`, {
        title: title.trim(),
        description: description.trim() || undefined,
      });
      setTitle("");
      setDescription("");
      onChange();
    } catch (err: any) {
      await alert({
        title: "Creation Failed",
        message: err.message || "Failed to create decision.",
        tone: "danger",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (d: Decision) => {
    setEditingId(d.id);
    setEditTitle(d.title);
    setEditDescription(d.description || "");
    setEditStatus(d.status);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setError(null);
  };

  const saveEdit = async (decisionId: string) => {
    if (!editTitle.trim()) {
      setError("Please provide a decision title.");
      return;
    }
    setUpdating(true);
    setError(null);
    try {
      await api.put(`/meetings/decisions/${decisionId}`, {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        status: editStatus,
      });
      setEditingId(null);
      onChange();
    } catch (err: any) {
      setError(err.message || "Failed to update decision.");
    } finally {
      setUpdating(false);
    }
  };

  const quickUpdateStatus = async (decisionId: string, newStatus: DecisionStatus) => {
    try {
      await api.put(`/meetings/decisions/${decisionId}`, { status: newStatus });
      onChange();
    } catch (err: any) {
      await alert({
        title: "Status Update Failed",
        message: err.message || "Failed to update status.",
        tone: "danger",
      });
    }
  };

  const deleteDecision = async (decisionId: string, code: string) => {
    const confirmed = await confirm({
      title: "Delete Decision",
      message: `Are you sure you want to delete decision "${code}"? Any linked action items will be unlinked.`,
      tone: "danger",
      confirmLabel: "Delete Decision",
      cancelLabel: "Cancel",
    });
    if (!confirmed) {
      return;
    }
    setDeletingId(decisionId);
    try {
      await api.delete(`/meetings/decisions/${decisionId}`);
      if (editingId === decisionId) {
        setEditingId(null);
      }
      onChange();
    } catch (err: any) {
      await alert({
        title: "Delete Failed",
        message: err.message || "Failed to delete decision.",
        tone: "danger",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const implementedCount = useMemo(() => {
    return (meeting.decisions || []).filter((d) => d.status === "IMPLEMENTED").length;
  }, [meeting.decisions]);

  return (
    <Card className="overflow-hidden border border-slate2-200/90 shadow-sm bg-white">
      {/* Decisions Registry Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate2-100 bg-slate2-50/50 px-5 py-4">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-slate2-900">
            Decisions
          </h2>
          <p className="mt-0.5 text-xs text-slate2-500">
            {(meeting.decisions || []).length} official outcomes logged · {implementedCount} implemented
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-slate2-200 px-2.5 py-1 text-xs font-semibold text-slate2-700 shadow-2xs">
            <Gavel size={13} className="text-brand" />
            <span>{(meeting.decisions || []).length} Decisions</span>
          </span>
        </div>
      </div>

      {isLockedMeeting(meeting.status) && (
        <div className="mx-5 my-4 rounded-xl border border-slate2-200 bg-slate2-50/90 p-3.5 shadow-2xs">
          <div className="flex items-start gap-2.5">
            <Lock size={16} className="text-slate2-500 mt-0.5 shrink-0" />
            <div>
              <h4 className="text-xs font-bold text-slate2-800 uppercase tracking-wider">
                Decisions Officially Certified & Locked (Read-Only)
              </h4>
              <p className="mt-0.5 text-xs text-slate2-600 leading-relaxed">
                This meeting is locked. In accordance with compliance and governance rules, all decisions are permanently preserved in Read-Only archive mode.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Decisions List */}
      <div className="divide-y divide-slate2-100">
        {(meeting.decisions || []).length === 0 ? (
          <div className="p-8">
            <EmptyState
              title="No formal decisions logged yet"
              description="Record official decisions and outcomes reached during this meeting session."
            />
          </div>
        ) : (
          (meeting.decisions || []).map((d) => {
            const isEditing = editingId === d.id;

            if (isEditing) {
              return (
                <div key={d.id} className="bg-slate2-50/90 p-5 space-y-4 border-l-4 border-l-brand">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-brand">
                        Edit Decision
                      </span>
                      <CodeChip>{d.code}</CodeChip>
                    </div>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="text-slate2-400 hover:text-slate2-600 transition-colors"
                      title="Cancel editing"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {error && (
                    <div className="rounded-lg bg-red-50 p-2.5 text-xs text-danger flex items-center gap-1.5">
                      <AlertCircle size={14} className="shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                    <div className="sm:col-span-8">
                      <label className="mb-1 block text-xs font-medium text-slate2-600">
                        Decision Title <span className="text-danger">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder="Decision title"
                        className={inputClass}
                      />
                    </div>

                    <div className="sm:col-span-4">
                      <label className="mb-1 block text-xs font-medium text-slate2-600">
                        Status
                      </label>
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value as DecisionStatus)}
                        className={`${inputClass} bg-white cursor-pointer font-medium`}
                      >
                        <option value="OPEN">OPEN</option>
                        <option value="IMPLEMENTED">IMPLEMENTED</option>
                        <option value="REVERSED">REVERSED</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate2-600">
                      Rationale & Deliberation Notes (Optional)
                    </label>
                    <textarea
                      rows={3}
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Enter decision details, agreed parameters, or governance justification..."
                      className={`${inputClass} min-h-[76px] w-full resize-y text-slate2-800 bg-white leading-relaxed`}
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={cancelEdit}
                      disabled={updating}
                      className="text-xs"
                    >
                      <X size={13} /> Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={() => saveEdit(d.id)}
                      disabled={updating || !editTitle.trim()}
                      className="text-xs"
                    >
                      <Check size={13} /> {updating ? "Saving..." : "Save changes"}
                    </Button>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={d.id}
                className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 p-4 sm:p-5 hover:bg-slate2-50/40 transition-colors"
              >
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <CodeChip>{d.code}</CodeChip>
                    <h4 className="text-xs sm:text-sm font-bold text-slate2-900">
                      {d.title}
                    </h4>
                  </div>
                  {d.description && (
                    <p className="text-xs leading-relaxed text-slate2-600 whitespace-pre-wrap rounded-lg bg-slate2-50/60 border border-slate2-200/60 p-2.5">
                      {d.description}
                    </p>
                  )}
                  {d.decisionDate && (
                    <p className="text-[11px] text-slate2-400 pt-0.5 font-mono">
                      Recorded on {new Date(d.decisionDate).toLocaleDateString()}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 self-end sm:self-start shrink-0">
                  <StatusBadge status={d.status} />

                  {canManage && (
                    <div className="flex items-center gap-1 ml-1">
                      <button
                        type="button"
                        onClick={() => startEdit(d)}
                        className="rounded-lg p-1.5 text-slate2-400 hover:bg-slate2-100 hover:text-slate2-700 transition-colors"
                        title="Edit decision"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteDecision(d.id, d.code)}
                        disabled={deletingId === d.id}
                        className="rounded-lg p-1.5 text-slate2-400 hover:bg-red-50 hover:text-danger transition-colors disabled:opacity-50"
                        title="Delete decision"
                      >
                        {deletingId === d.id ? (
                          <Loader2 size={14} className="animate-spin text-danger" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Log Decision Form */}
      {canManage && (
        <form
          onSubmit={submit}
          className="border-t border-slate2-200/80 bg-slate2-50/40 p-5 sm:p-6 space-y-3"
        >
          <div className="flex items-center gap-2">
            <Gavel size={16} className="text-brand" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate2-700">
              Record Decision
            </h3>
          </div>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate2-600">
                Decision Title <span className="text-danger">*</span>
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Approve 15% budget reallocation to regional depot expansion"
                className={inputClass}
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate2-600">
                Decision Details / Parameters (Optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Specify voting consensus, agreed conditions, or implementation parameters..."
                className={`${inputClass} min-h-[64px] resize-y`}
              />
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <Button type="submit" disabled={submitting || !title.trim()} className="text-xs">
              <Gavel size={14} /> Log Decision
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}


function ActionsTab({
  meeting,
  canCreate,
  onChange,
}: {
  meeting: MeetingDetailType;
  canCreate: boolean;
  onChange: () => void;
}) {
  const { user, hasPermission } = useAuth();
  const { alert, confirm } = useAlert();
  const [users, setUsers] = useState<User[]>([]);
  const [editingItem, setEditingItem] = useState<ActionItem | null>(null);

  // Filter by Assignee state: "ALL" | "MINE" | userId
  const [assigneeFilter, setAssigneeFilter] = useState<string>("ALL");

  // Creation form state
  const [creationMode, setCreationMode] = useState<"SINGLE" | "BATCH">("SINGLE");
  const [title, setTitle] = useState("");
  const [assignedUserIds, setAssignedUserIds] = useState<string[]>([]);
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [decisionId, setDecisionId] = useState("");
  const [assignmentMode, setAssignmentMode] = useState<"SHARED" | "INDIVIDUAL">("SHARED");
  const [keepAssignees, setKeepAssignees] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Default deadline: 7 days from today
  const defaultDeadlineStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const [deadline, setDeadline] = useState(defaultDeadlineStr);

  // Batch task rows state
  const [batchTasks, setBatchTasks] = useState<
    Array<{ id: string; title: string; deadline: string; priority: Priority }>
  >([
    { id: "1", title: "", deadline: defaultDeadlineStr, priority: "MEDIUM" },
    { id: "2", title: "", deadline: defaultDeadlineStr, priority: "MEDIUM" },
  ]);

  // Today's date string in YYYY-MM-DD format to lock past dates in calendar picker
  const todayDateStr = useMemo(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  useEffect(() => {
    api.get<User[]>("/users").then(setUsers);
  }, []);

  const isMeetingCancelled = meeting.status === "CANCELLED";
  const isLocked = isLockedMeeting(meeting.status);
  // Meeting lock freezes creation and structural changes, but action item status updates remain independent and allowed post-meeting
  const isActionItemsLocked = isLocked;

  // Action items are post-meeting deliverables: assignees & permitted users can update status even when meeting is locked
  const canUpdateItemStatus = (item: (typeof meeting.actionItems)[number]) => {
    const assignees = getActionItemAssignees(item);
    if (user && assignees.some((u) => u.id === user.id)) return true;
    if (user && item.assignedTo && user.id === item.assignedTo.id) return true;
    if (user && user.id === meeting.organizer?.id) return true;
    if (hasPermission("ADMIN_OVERRIDE")) return true;
    if (hasPermission("action_items:edit:all") || hasPermission("meetings:edit:all")) return true;
    if (
      (hasPermission("action_items:edit:dept") || hasPermission("meetings:edit:dept")) &&
      user?.department?.id === meeting.department?.id
    ) {
      return true;
    }
    return false;
  };

  // Structural edits (title, deadline, assignees) are not allowed when meeting is completed or locked.
  // Action item details are not editable; ONLY their status can be updated.
  const canEditItemDetails = (_item: (typeof meeting.actionItems)[number]) => {
    if (isActionItemsLocked || meeting.status === "COMPLETED") return false;
    return canUpdateItemStatus(_item);
  };

  const canDeleteItem = (item: (typeof meeting.actionItems)[number]) => {
    if (isActionItemsLocked || meeting.status === "COMPLETED") return false;
    if (user && user.id === meeting.organizer?.id) return true;
    if (hasPermission("ADMIN_OVERRIDE")) return true;
    if (hasPermission("action_items:delete:all") || hasPermission("meetings:edit:all")) return true;
    if (
      (hasPermission("action_items:delete:dept") || hasPermission("meetings:edit:dept")) &&
      user?.department?.id === meeting.department?.id
    ) {
      return true;
    }
    return false;
  };

  // Grouped assignee stats for the filter bar
  const assigneeStats = useMemo(() => {
    const map = new Map<string, { user: { id: string; name: string; avatarColor?: string }; count: number }>();
    (meeting.actionItems || []).forEach((item) => {
      const assignees = getActionItemAssignees(item);
      assignees.forEach((u) => {
        if (!map.has(u.id)) {
          map.set(u.id, { user: u, count: 0 });
        }
        map.get(u.id)!.count++;
      });
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [meeting.actionItems]);

  const myTasksCount = useMemo(() => {
    if (!user) return 0;
    return (meeting.actionItems || []).filter((i) => {
      const assignees = getActionItemAssignees(i);
      return assignees.some((u) => u.id === user.id);
    }).length;
  }, [meeting.actionItems, user]);

  // Filtered action items based on active assignee tab
  const displayedActionItems = useMemo(() => {
    const items = meeting.actionItems || [];
    if (assigneeFilter === "ALL") return items;
    if (assigneeFilter === "MINE") {
      if (!user) return items;
      return items.filter((i) =>
        getActionItemAssignees(i).some((u) => u.id === user.id)
      );
    }
    return items.filter((i) =>
      getActionItemAssignees(i).some((u) => u.id === assigneeFilter)
    );
  }, [meeting.actionItems, assigneeFilter, user]);

  // Single task submit
  const submitSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      await alert({
        title: "Task Description Required",
        message: "Please enter a description for the action item.",
        tone: "warning",
      });
      return;
    }
    if (assignedUserIds.length === 0) {
      await alert({
        title: "Assignee Required",
        message: "Please select at least one team member to assign this action item to.",
        tone: "warning",
      });
      return;
    }
    if (!deadline) {
      await alert({
        title: "Due Date Required",
        message: "Please select a due date for this action item.",
        tone: "warning",
      });
      return;
    }
    if (deadline < todayDateStr) {
      await alert({
        title: "Invalid Deadline",
        message: "Action item deadline cannot be in the past. Please select today or a future date.",
        tone: "warning",
      });
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/action-items", {
        meetingId: meeting.id,
        decisionId: decisionId || undefined,
        title: title.trim(),
        assigneeIds: assignedUserIds,
        assignedToId: assignedUserIds[0],
        departmentId: meeting.department?.id,
        priority,
        deadline,
        assignmentMode: assignedUserIds.length > 1 ? assignmentMode : "SHARED",
      });

      setTitle("");
      setDeadline(defaultDeadlineStr);
      setDecisionId("");
      if (!keepAssignees) {
        setAssignedUserIds([]);
      }
      onChange();
    } catch (err: any) {
      await alert({
        title: "Action Item Error",
        message: err.message || "Failed to create action item.",
        tone: "danger",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Batch tasks submit
  const submitBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (assignedUserIds.length === 0) {
      await alert({
        title: "Assignee Required",
        message: "Please select at least one assignee for these action items.",
        tone: "warning",
      });
      return;
    }

    const validTasks = batchTasks.filter((t) => t.title.trim().length > 0);
    if (validTasks.length === 0) {
      await alert({
        title: "Tasks Required",
        message: "Please enter at least one task title to assign.",
        tone: "warning",
      });
      return;
    }

    for (const t of validTasks) {
      if (t.deadline < todayDateStr) {
        await alert({
          title: "Invalid Deadline",
          message: `The deadline for task "${t.title}" cannot be in the past.`,
          tone: "warning",
        });
        return;
      }
    }

    setSubmitting(true);
    try {
      await api.post("/action-items/batch", {
        meetingId: meeting.id,
        items: validTasks.map((t) => ({
          title: t.title.trim(),
          assigneeIds: assignedUserIds,
          deadline: t.deadline || defaultDeadlineStr,
          priority: t.priority,
          decisionId: decisionId || undefined,
          assignmentMode: assignedUserIds.length > 1 ? assignmentMode : "SHARED",
        })),
      });

      setBatchTasks([
        { id: "1", title: "", deadline: defaultDeadlineStr, priority: "MEDIUM" },
        { id: "2", title: "", deadline: defaultDeadlineStr, priority: "MEDIUM" },
      ]);
      setDecisionId("");
      if (!keepAssignees) {
        setAssignedUserIds([]);
      }
      setCreationMode("SINGLE");
      onChange();
    } catch (err: any) {
      await alert({
        title: "Batch Action Items Error",
        message: err.message || "Failed to create batch action items.",
        tone: "danger",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await api.put(`/action-items/${id}`, { status });
      onChange();
    } catch (err: any) {
      await alert({
        title: "Status Update Error",
        message: err.message || "Failed to update action item status.",
        tone: "danger",
      });
    }
  };

  const handleDeleteItem = async (item: ActionItem) => {
    const ok = await confirm({
      title: "Delete Action Item?",
      message: `Are you sure you want to permanently delete "${item.title}" (${item.code})? This action cannot be undone.`,
      tone: "danger",
      confirmLabel: "Delete Action Item",
    });
    if (!ok) return;

    try {
      await api.delete(`/action-items/${item.id}`);
      onChange();
    } catch (err: any) {
      await alert({
        title: "Delete Error",
        message: err.message || "Failed to delete action item.",
        tone: "danger",
      });
    }
  };

  const selectedUsers = users.filter((u) => assignedUserIds.includes(u.id));

  // Executive summary metrics
  const totalTasks = (meeting.actionItems || []).length;
  const completedTasks = (meeting.actionItems || []).filter((i) => i.status === "COMPLETED").length;
  const inProgressTasks = (meeting.actionItems || []).filter((i) => i.status === "IN_PROGRESS").length;
  const overdueTasks = (meeting.actionItems || []).filter(
    (i) => i.overdue || (i.status !== "COMPLETED" && i.deadline && i.deadline.split("T")[0] < todayDateStr)
  ).length;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <Card className="border border-slate2-200/90 bg-white rounded-2xl shadow-xs overflow-hidden">
      <CardHeader
        title={
          <span className="flex items-center gap-2.5">
            <span className="font-bold text-slate2-900">Action Items & Deliverables</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 text-brand border border-teal-200/80 px-2.5 py-0.5 text-xs font-semibold">
              <ListChecks size={11} />
              {totalTasks} {totalTasks === 1 ? "Task" : "Tasks"}
            </span>
            {isActionItemsLocked && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-slate2-100 text-slate2-600 border border-slate2-200 px-2 py-0.5 text-[11px] font-medium"
                title="Meeting is finalized; action item statuses remain active for follow-through execution"
              >
                Post-Meeting Execution
              </span>
            )}
          </span>
        }
        subtitle="Track commitments, assign accountability, and ensure follow-through on meeting decisions"
        action={
          canCreate && !isActionItemsLocked && (
            <div className="flex items-center gap-1 bg-slate2-100 p-1 rounded-xl text-xs border border-slate2-200/70">
              <button
                type="button"
                onClick={() => setCreationMode("SINGLE")}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${creationMode === "SINGLE"
                  ? "bg-white text-brand shadow-2xs"
                  : "text-slate2-600 hover:text-slate2-900"
                  }`}
              >
                Standard Task
              </button>
              <button
                type="button"
                onClick={() => setCreationMode("BATCH")}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${creationMode === "BATCH"
                  ? "bg-white text-brand shadow-2xs"
                  : "text-slate2-600 hover:text-slate2-900"
                  }`}
              >
                Batch Multiple Tasks
              </button>
            </div>
          )
        }
      />

      {/* Operational Task Metrics Pulse Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate2-100 border-y border-slate2-200/80">
        <div className="bg-white p-4">
          <p className="text-[11px] font-semibold text-slate2-500 uppercase tracking-wider">Total Commitments</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-slate2-900">{totalTasks}</span>
            <span className="text-xs text-slate2-500">logged</span>
          </div>
        </div>

        <div className="bg-white p-4">
          <p className="text-[11px] font-semibold text-slate2-500 uppercase tracking-wider">Completed</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-emerald-700">{completedTasks}</span>
            <span className="text-xs font-semibold text-emerald-600">({completionRate}%)</span>
          </div>
        </div>

        <div className="bg-white p-4">
          <p className="text-[11px] font-semibold text-slate2-500 uppercase tracking-wider">In Progress</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-brand">{inProgressTasks}</span>
            <span className="text-xs text-slate2-500">active</span>
          </div>
        </div>

        <div className="bg-white p-4">
          <p className="text-[11px] font-semibold text-slate2-500 uppercase tracking-wider">Overdue</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className={`text-xl font-bold font-mono ${overdueTasks > 0 ? "text-rose-600" : "text-slate2-700"}`}>
              {overdueTasks}
            </span>
            <span className={`text-xs ${overdueTasks > 0 ? "text-rose-600 font-semibold" : "text-slate2-400"}`}>
              {overdueTasks > 0 ? "needs attention" : "on track"}
            </span>
          </div>
        </div>
      </div>

      {/* Assignee Filter Tabs Bar */}
      {(meeting.actionItems || []).length > 0 && (
        <div className="flex items-center gap-1.5 px-5 py-3 bg-slate2-50/70 border-b border-slate2-100 overflow-x-auto text-xs">
          <span className="font-semibold text-slate2-500 text-[11px] uppercase tracking-wider mr-1.5 shrink-0">
            Filter:
          </span>
          <button
            type="button"
            onClick={() => setAssigneeFilter("ALL")}
            className={`px-3 py-1 rounded-full font-medium transition-all shrink-0 cursor-pointer ${assigneeFilter === "ALL"
              ? "bg-[#0B7A6B] text-white shadow-2xs font-semibold"
              : "bg-white text-slate2-700 hover:bg-slate2-100 border border-slate2-200"
              }`}
          >
            All Tasks ({(meeting.actionItems || []).length})
          </button>

          {user && myTasksCount > 0 && (
            <button
              type="button"
              onClick={() => setAssigneeFilter("MINE")}
              className={`px-3 py-1 rounded-full font-medium transition-all shrink-0 cursor-pointer ${assigneeFilter === "MINE"
                ? "bg-[#0B7A6B] text-white shadow-2xs font-semibold"
                : "bg-white text-slate2-700 hover:bg-slate2-100 border border-slate2-200"
                }`}
            >
              My Tasks ({myTasksCount})
            </button>
          )}

          {assigneeStats.map(({ user: u, count }) => (
            <button
              key={u.id}
              type="button"
              onClick={() => setAssigneeFilter(u.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-medium transition-all shrink-0 cursor-pointer ${assigneeFilter === u.id
                ? "bg-[#0B7A6B] text-white shadow-2xs font-semibold"
                : "bg-white text-slate2-700 hover:bg-slate2-100 border border-slate2-200"
                }`}
            >
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: u.avatarColor || "#0B7A6B" }}
              />
              <span>{u.name.split(" ")[0]}</span>
              <span
                className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${assigneeFilter === u.id ? "bg-white/20 text-white" : "bg-slate2-100 text-slate2-600"
                  }`}
              >
                {count}
              </span>
            </button>
          ))}

          {assigneeFilter !== "ALL" && (
            <button
              type="button"
              onClick={() => setAssigneeFilter("ALL")}
              className="text-xs font-semibold text-brand hover:underline shrink-0 ml-2 cursor-pointer"
            >
              Reset filter
            </button>
          )}
        </div>
      )}

      {/* Action Items List */}
      <div className="divide-y divide-slate2-100">
        {displayedActionItems.length === 0 ? (
          <EmptyState
            title={assigneeFilter !== "ALL" ? "No matching action items" : "No action items recorded yet"}
            description={
              assigneeFilter !== "ALL"
                ? "No tasks assigned to the selected assignee filter."
                : "Assign accountability and follow through on decisions made during the session."
            }
          />
        ) : (
          displayedActionItems.map((a) => {
            const assignees = getActionItemAssignees(a);
            const userCanUpdateStatus = canUpdateItemStatus(a);
            const userCanEditDetails = canEditItemDetails(a);
            const userCanDelete = canDeleteItem(a);
            const isCompleted = a.status === "COMPLETED";

            return (
              <div
                key={a.id}
                className="flex flex-col gap-3.5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between hover:bg-slate2-50/50 transition-colors"
              >
                <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
                  {/* Quick toggle checkmark */}
                  <button
                    type="button"
                    disabled={!userCanUpdateStatus}
                    onClick={() => updateStatus(a.id, isCompleted ? "IN_PROGRESS" : "COMPLETED")}
                    title={
                      !userCanUpdateStatus
                        ? "You do not have permission to update status"
                        : isCompleted
                          ? "Mark as In Progress"
                          : "Mark as Completed"
                    }
                    className={`h-6 w-6 mt-0.5 sm:mt-0 rounded-full flex items-center justify-center border transition-all shrink-0 ${isCompleted
                      ? "bg-emerald-600 border-emerald-600 text-white shadow-2xs"
                      : "border-slate2-300 hover:border-brand text-transparent hover:text-slate2-300"
                      } ${!userCanUpdateStatus ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                  >
                    <Check size={13} strokeWidth={3} className={isCompleted ? "opacity-100" : "opacity-0 hover:opacity-100"} />
                  </button>

                  {/* Assignee Avatar Stack */}
                  <div className="shrink-0 mt-0.5 sm:mt-0">
                    {assignees.length <= 1 ? (
                      <Avatar
                        name={assignees[0]?.name || a.assignedTo?.name || "Unassigned"}
                        color={assignees[0]?.avatarColor || a.assignedTo?.avatarColor}
                      />
                    ) : (
                      <div className="flex -space-x-2 overflow-hidden shrink-0">
                        {assignees.slice(0, 3).map((u) => (
                          <div key={u.id} className="ring-2 ring-white rounded-full">
                            <Avatar name={u.name} color={u.avatarColor} />
                          </div>
                        ))}
                        {assignees.length > 3 && (
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate2-100 text-[10px] font-bold text-slate2-600 ring-2 ring-white">
                            +{assignees.length - 3}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`text-sm font-semibold ${isCompleted ? "text-slate2-800" : "text-slate2-900"}`}>
                        {a.title}
                      </p>
                      <CodeChip>{a.code}</CodeChip>
                      <PriorityBadge priority={a.priority} />
                      {a.decisionId && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 border border-teal-200/90 px-2 py-0.5 text-[10px] font-semibold text-brand">
                          <Gavel size={10} />
                          Linked Decision
                        </span>
                      )}
                    </div>

                    {a.description && (
                      <p className="text-xs text-slate2-600 mt-1 line-clamp-2 leading-relaxed">
                        {a.description}
                      </p>
                    )}

                    <div className="flex items-center gap-2 flex-wrap text-xs text-slate2-500 mt-1.5">
                      <span className="text-slate2-400">Assigned:</span>
                      <strong className="text-slate2-800 font-semibold">
                        {assignees.length > 0
                          ? assignees.map((u) => u.name).join(", ")
                          : a.assignedTo?.name || "Unassigned"}
                      </strong>
                      {assignees.length > 1 && (
                        <span className="text-[10px] font-semibold text-brand bg-teal-50 border border-teal-200/80 px-1.5 py-0.2 rounded-full">
                          {assignees.length} assignees
                        </span>
                      )}
                      <span className="text-slate2-300">·</span>
                      <span className="inline-flex items-center gap-1 font-mono text-slate2-600">
                        <Clock size={11} className="text-slate2-400" />
                        Due {new Date(a.deadline).toLocaleDateString()}
                      </span>
                      {a.overdue && !isCompleted && (
                        <span className="font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full text-[10px]">
                          Overdue
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status & Actions Hub */}
                <div className="flex items-center gap-3 sm:w-auto shrink-0 justify-between sm:justify-end pl-9 sm:pl-0">
                  <div className="w-24 sm:w-28 hidden md:block">
                    <div className="flex items-center justify-between text-[10px] text-slate2-500 mb-1">
                      <span>Progress</span>
                      <span className="font-mono font-semibold">{a.progressPercent}%</span>
                    </div>
                    <ProgressBar
                      percent={a.progressPercent}
                      tone={
                        a.overdue && !isCompleted
                          ? "danger"
                          : isCompleted
                            ? "success"
                            : "brand"
                      }
                    />
                  </div>

                  <select
                    value={a.status}
                    onChange={(e) => updateStatus(a.id, e.target.value)}
                    disabled={!userCanUpdateStatus}
                    title={
                      !userCanUpdateStatus
                        ? "You do not have permission to update status."
                        : "Update task status"
                    }
                    className={`${inputClass} w-auto text-xs py-1.5 px-2.5 rounded-lg font-medium ${!userCanUpdateStatus
                      ? "opacity-60 cursor-not-allowed bg-slate2-100"
                      : "cursor-pointer"
                      }`}
                  >
                    {["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"].map((s) => (
                      <option key={s} value={s}>
                        {s.replace("_", " ")}
                      </option>
                    ))}
                  </select>

                  {/* Edit button */}
                  {userCanEditDetails && (
                    <button
                      type="button"
                      onClick={() => setEditingItem(a)}
                      className="p-1.5 text-slate2-500 hover:text-brand hover:bg-slate2-100 rounded-lg transition-colors cursor-pointer"
                      title="Edit action item, assignees & progress"
                    >
                      <Pencil size={15} />
                    </button>
                  )}

                  {/* Delete button */}
                  {userCanDelete && (
                    <button
                      type="button"
                      onClick={() => handleDeleteItem(a)}
                      className="p-1.5 text-slate2-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="Delete action item"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Creation Form: Single Mode */}
      {canCreate && !isActionItemsLocked && creationMode === "SINGLE" && (
        <form
          onSubmit={submitSingle}
          className="space-y-4 border-t border-slate2-100 p-5 bg-slate2-50/50"
        >
          <div className="flex items-center gap-2 pb-1 border-b border-slate2-200/60">
            <Plus size={15} className="text-brand" />
            <h4 className="text-xs font-bold text-slate2-900 uppercase tracking-wider">
              Add Action Item
            </h4>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
            <div className="sm:col-span-5">
              <label className="block text-xs font-semibold text-slate2-700 mb-1">
                Task Description <span className="text-rose-500">*</span>
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What needs to be accomplished?"
                className={`${inputClass} w-full`}
              />
            </div>
            <div className="sm:col-span-4">
              <label className="block text-xs font-semibold text-slate2-700 mb-1">
                Assign Accountability <span className="text-rose-500">*</span>
              </label>
              <SearchableUserSelect
                users={users}
                isMulti
                selectedUserIds={assignedUserIds}
                onSelectMultiple={setAssignedUserIds}
                meetingParticipants={meeting.participants}
                organizerId={meeting.organizer?.id}
                placeholder="Select one or multiple users…"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-xs font-semibold text-slate2-700 mb-1">
                Due Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                min={todayDateStr}
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className={`${inputClass} w-full font-mono text-xs`}
              />
            </div>
          </div>

          {/* Multi-User Assignment Mode Choice */}
          {assignedUserIds.length > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 bg-teal-50/60 border border-teal-200/80 px-4 py-2.5 rounded-xl text-xs">
              <div className="flex items-center gap-2 text-brand font-semibold">
                <Users size={15} />
                <span>Multi-Assignee Distribution:</span>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 cursor-pointer font-medium text-slate2-800">
                  <input
                    type="radio"
                    name="assignmentModeSingle"
                    checked={assignmentMode === "SHARED"}
                    onChange={() => setAssignmentMode("SHARED")}
                    className="text-brand focus:ring-brand"
                  />
                  <span>Joint Shared Task ({assignedUserIds.length} assignees)</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer font-medium text-slate2-800">
                  <input
                    type="radio"
                    name="assignmentModeSingle"
                    checked={assignmentMode === "INDIVIDUAL"}
                    onChange={() => setAssignmentMode("INDIVIDUAL")}
                    className="text-brand focus:ring-brand"
                  />
                  <span>Individual Copy for Each Assignee</span>
                </label>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-4">
              <label className="block text-xs font-semibold text-slate2-700 mb-1">
                Priority Level
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className={`${inputClass} w-full text-xs`}
              >
                <option value="LOW">Low Priority</option>
                <option value="MEDIUM">Medium Priority</option>
                <option value="HIGH">High Priority</option>
                <option value="CRITICAL">Critical Priority</option>
              </select>
            </div>
            {meeting.decisions.length > 0 && (
              <div className="sm:col-span-8">
                <label className="block text-xs font-semibold text-slate2-700 mb-1">
                  Link to Decision (Optional)
                </label>
                <select
                  value={decisionId}
                  onChange={(e) => setDecisionId(e.target.value)}
                  className={`${inputClass} w-full text-xs`}
                >
                  <option value="">No decision linked</option>
                  {meeting.decisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code} — {d.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate2-200/70">
            <label className="flex items-center gap-2 text-xs text-slate2-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={keepAssignees}
                onChange={(e) => setKeepAssignees(e.target.checked)}
                className="rounded border-slate2-300 text-brand focus:ring-brand"
              />
              <span>Keep assignee(s) selected for next task</span>
            </label>

            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Assigning…
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} />
                  <span>
                    Assign Action Item{" "}
                    {assignedUserIds.length > 1
                      ? assignmentMode === "INDIVIDUAL"
                        ? `(${assignedUserIds.length} tasks)`
                        : `(${assignedUserIds.length} users)`
                      : ""}
                  </span>
                </>
              )}
            </Button>
          </div>
        </form>
      )}

      {/* Creation Form: Batch Mode */}
      {canCreate && !isActionItemsLocked && creationMode === "BATCH" && (
        <form
          onSubmit={submitBatch}
          className="space-y-4 border-t border-slate2-100 p-5 bg-teal-50/20"
        >
          <div className="flex items-center justify-between pb-2 border-b border-teal-100">
            <div>
              <h4 className="text-xs font-bold text-slate2-800 uppercase tracking-wide">
                Batch Action Items Assignment
              </h4>
              <p className="text-xs text-slate2-500 mt-0.5">
                Rapidly create multiple tasks and distribute them across responsible team members.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCreationMode("SINGLE")}
              className="text-xs font-semibold text-brand hover:underline cursor-pointer"
            >
              Switch to single task
            </button>
          </div>

          {/* Select Assignee(s) for the batch */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-8">
              <label className="block text-xs font-semibold text-slate2-700 mb-1">
                Assign All Tasks To <span className="text-rose-500">*</span>
              </label>
              <SearchableUserSelect
                users={users}
                isMulti
                selectedUserIds={assignedUserIds}
                onSelectMultiple={setAssignedUserIds}
                meetingParticipants={meeting.participants}
                organizerId={meeting.organizer?.id}
                placeholder="Select team member(s) to receive these tasks…"
              />
            </div>
            {meeting.decisions.length > 0 && (
              <div className="sm:col-span-4">
                <label className="block text-xs font-semibold text-slate2-700 mb-1">
                  Link to Decision (Optional)
                </label>
                <select
                  value={decisionId}
                  onChange={(e) => setDecisionId(e.target.value)}
                  className={`${inputClass} w-full text-xs`}
                >
                  <option value="">No decision linked</option>
                  {meeting.decisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code} — {d.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Multi-User choice in Batch */}
          {assignedUserIds.length > 1 && (
            <div className="flex items-center gap-4 bg-teal-50/80 border border-teal-200/80 px-4 py-2 rounded-xl text-xs">
              <span className="font-semibold text-brand">Mode:</span>
              <label className="flex items-center gap-1.5 cursor-pointer text-slate2-800">
                <input
                  type="radio"
                  name="assignmentModeBatch"
                  checked={assignmentMode === "SHARED"}
                  onChange={() => setAssignmentMode("SHARED")}
                  className="text-brand focus:ring-brand"
                />
                <span>Joint Shared Tasks (Team collaborates on each task)</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-slate2-800">
                <input
                  type="radio"
                  name="assignmentModeBatch"
                  checked={assignmentMode === "INDIVIDUAL"}
                  onChange={() => setAssignmentMode("INDIVIDUAL")}
                  className="text-brand focus:ring-brand"
                />
                <span>Separate Individual Tasks (One copy per member)</span>
              </label>
            </div>
          )}

          {/* Task rows */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate2-700">
              Task Ledger Rows ({batchTasks.length})
            </label>
            {batchTasks.map((task, idx) => (
              <div
                key={task.id}
                className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2.5 bg-white rounded-xl border border-slate2-200 shadow-2xs"
              >
                <span className="text-xs font-bold font-mono text-slate2-400 w-7 shrink-0 text-center">
                  #{String(idx + 1).padStart(2, "0")}
                </span>
                <input
                  value={task.title}
                  onChange={(e) => {
                    const next = [...batchTasks];
                    next[idx].title = e.target.value;
                    setBatchTasks(next);
                  }}
                  placeholder={`Task #${idx + 1} deliverable description…`}
                  className={`${inputClass} flex-1 text-xs`}
                />
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="date"
                    min={todayDateStr}
                    value={task.deadline}
                    onChange={(e) => {
                      const next = [...batchTasks];
                      next[idx].deadline = e.target.value;
                      setBatchTasks(next);
                    }}
                    className={`${inputClass} w-36 text-xs font-mono`}
                  />
                  <select
                    value={task.priority}
                    onChange={(e) => {
                      const next = [...batchTasks];
                      next[idx].priority = e.target.value as Priority;
                      setBatchTasks(next);
                    }}
                    className={`${inputClass} w-28 text-xs`}
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                  {batchTasks.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        setBatchTasks(batchTasks.filter((_, i) => i !== idx));
                      }}
                      className="p-1.5 text-slate2-400 hover:text-rose-600 rounded-lg cursor-pointer transition-colors"
                      title="Remove task row"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() => {
                setBatchTasks([
                  ...batchTasks,
                  {
                    id: String(Date.now()),
                    title: "",
                    deadline: defaultDeadlineStr,
                    priority: "MEDIUM",
                  },
                ]);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:text-brand-dark py-1.5 px-3 rounded-lg hover:bg-brand/5 cursor-pointer transition-colors"
            >
              <Plus size={13} /> Add another deliverable row
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate2-200">
            <span className="text-xs text-slate2-500">
              {assignedUserIds.length > 0 ? (
                <span>
                  Ready to assign to{" "}
                  <strong className="text-brand">
                    {selectedUsers.map((u) => u.name).join(", ")}
                  </strong>
                </span>
              ) : (
                <span className="text-slate2-400">Select assignee(s) above</span>
              )}
            </span>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setCreationMode("SINGLE")}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Assigning all…
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} /> Assign All Tasks ({batchTasks.filter((t) => t.title.trim()).length || batchTasks.length})
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      )}

      {/* Edit Action Item Modal Dialog */}
      {editingItem && (
        <ActionItemEditModal
          item={editingItem}
          users={users}
          meeting={meeting}
          todayDateStr={todayDateStr}
          canDelete={canDeleteItem(editingItem)}
          onClose={() => setEditingItem(null)}
          onSuccess={() => {
            setEditingItem(null);
            onChange();
          }}
        />
      )}
    </Card>
  );
}

// ---------- Action Item Edit Modal Component ----------
function ActionItemEditModal({
  item,
  users,
  meeting,
  todayDateStr,
  canDelete = false,
  onClose,
  onSuccess,
}: {
  item: ActionItem;
  users: User[];
  meeting: MeetingDetailType;
  todayDateStr: string;
  canDelete?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { alert, confirm } = useAlert();
  const { hasPermission } = useAuth();
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description || "");
  const [priority, setPriority] = useState<Priority>(item.priority);
  const [status, setStatus] = useState<ActionItemStatus>(item.status);
  const [progressPercent, setProgressPercent] = useState<number>(item.progressPercent || 0);

  // Initial assignees
  const initialAssigneeIds = useMemo(() => {
    const list = getActionItemAssignees(item);
    return list.map((u) => u.id);
  }, [item]);

  const [assignedUserIds, setAssignedUserIds] = useState<string[]>(initialAssigneeIds);

  const initialDeadlineStr = useMemo(() => {
    if (!item.deadline) return "";
    const d = new Date(item.deadline);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, [item.deadline]);

  const [deadline, setDeadline] = useState(initialDeadlineStr);
  const [decisionId, setDecisionId] = useState(item.decisionId || "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      await alert({
        title: "Title Required",
        message: "Action item title cannot be empty.",
        tone: "warning",
      });
      return;
    }
    if (assignedUserIds.length === 0) {
      await alert({
        title: "Assignee Required",
        message: "Please keep at least one team member assigned to this action item.",
        tone: "warning",
      });
      return;
    }
    if (!deadline) {
      await alert({
        title: "Deadline Required",
        message: "Please choose a valid deadline date.",
        tone: "warning",
      });
      return;
    }

    if (isLockedMeeting(meeting.status) || meeting.status === "COMPLETED") {
      await alert({
        title: "Meeting is Completed",
        message: "This meeting is finalized. Action item details cannot be edited. Only the status can be changed directly from the action items list.",
        tone: "warning",
      });
      return;
    }
    setSaving(true);
    try {
      await api.put(`/action-items/${item.id}`, {
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        status,
        progressPercent: Number(progressPercent),
        deadline,
        decisionId: decisionId || undefined,
        assigneeIds: assignedUserIds,
      });
      onSuccess();
    } catch (err: any) {
      await alert({
        title: "Save Failed",
        message: err.message || "Failed to update action item.",
        tone: "danger",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: "Delete Action Item?",
      message: `Are you sure you want to delete "${item.title}" (${item.code})?`,
      tone: "danger",
      confirmLabel: "Delete Permanently",
    });
    if (!ok) return;

    setDeleting(true);
    try {
      await api.delete(`/action-items/${item.id}`);
      onSuccess();
    } catch (err: any) {
      await alert({
        title: "Delete Failed",
        message: err.message || "Failed to delete action item.",
        tone: "danger",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Edit Action Item — ${item.code}`} wide>
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate2-700 mb-1">
            Task Title <span className="text-red-500">*</span>
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={`${inputClass} w-full`}
            placeholder="Action item title"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate2-700 mb-1">
            Task Description / Deliverable Details (Optional)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className={`${inputClass} w-full resize-none`}
            placeholder="Add relevant notes, links, or expectations…"
          />
        </div>

        {/* Multi-User Assignees */}
        <div>
          <label className="block text-xs font-semibold text-slate2-700 mb-1">
            Assigned Team Members (Single or Multiple) <span className="text-red-500">*</span>
          </label>
          <SearchableUserSelect
            users={users}
            isMulti
            selectedUserIds={assignedUserIds}
            onSelectMultiple={setAssignedUserIds}
            meetingParticipants={meeting.participants}
            organizerId={meeting.organizer?.id}
            placeholder="Select assignees…"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate2-700 mb-1">
              Due Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              min={todayDateStr}
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className={`${inputClass} w-full`}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate2-700 mb-1">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className={`${inputClass} w-full`}
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate2-700 mb-1">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => {
                const s = e.target.value as ActionItemStatus;
                setStatus(s);
                if (s === "COMPLETED") setProgressPercent(100);
              }}
              className={`${inputClass} w-full`}
            >
              <option value="PENDING">Pending</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate2-700">
                Progress: {progressPercent}%
              </label>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={progressPercent}
                onChange={(e) => setProgressPercent(Number(e.target.value))}
                className="w-full accent-brand cursor-pointer"
              />
              <span className="text-xs font-mono font-semibold text-slate2-700 w-10 text-right">
                {progressPercent}%
              </span>
            </div>
          </div>
        </div>

        {meeting.decisions.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-slate2-700 mb-1">
              Linked Decision (Optional)
            </label>
            <select
              value={decisionId}
              onChange={(e) => setDecisionId(e.target.value)}
              className={`${inputClass} w-full`}
            >
              <option value="">No decision linked</option>
              {meeting.decisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} — {d.title}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center justify-between pt-4 border-t border-slate2-100">
          {canDelete ? (
            <Button
              type="button"
              variant="secondary"
              onClick={handleDelete}
              disabled={saving || deleting}
              className="text-red-600 hover:bg-red-50 border-red-200 cursor-pointer"
            >
              {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              <span>Delete Task</span>
            </Button>
          ) : <div />}

          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Save size={14} /> Save Changes
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
// Types the browser can render inline in an iframe
const INLINE_VIEWABLE_EXTS = ["pdf", "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "txt", "csv"];

function buildMeetingDocViewUrl(meetingId: string, docId: string) {
  const token = getToken();
  const base = buildUrl(`/meetings/${meetingId}/documents/${docId}/view`);
  return token
    ? `${base}?token=${encodeURIComponent(token)}`
    : base;
}

function getDocTypeInfo(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (ext === "pdf") {
    return {
      type: "PDF Document",
      badge: "PDF",
      badgeColor: "bg-rose-50 text-rose-700 border-rose-200",
      iconColor: "text-rose-600",
      bgColor: "bg-rose-50",
    };
  }
  if (["xls", "xlsx", "csv"].includes(ext)) {
    return {
      type: "Spreadsheet",
      badge: "EXCEL",
      badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
      iconColor: "text-emerald-600",
      bgColor: "bg-emerald-50",
    };
  }
  if (["doc", "docx"].includes(ext)) {
    return {
      type: "Word Document",
      badge: "WORD",
      badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
      iconColor: "text-blue-600",
      bgColor: "bg-blue-50",
    };
  }
  if (["png", "jpg", "jpeg", "webp", "svg", "bmp", "gif"].includes(ext)) {
    return {
      type: "Image Asset",
      badge: "IMAGE",
      badgeColor: "bg-purple-50 text-purple-700 border-purple-200",
      iconColor: "text-purple-600",
      bgColor: "bg-purple-50",
    };
  }
  return {
    type: "Document",
    badge: ext.toUpperCase() || "FILE",
    badgeColor: "bg-teal-50 text-brand border-teal-200",
    iconColor: "text-brand",
    bgColor: "bg-teal-50",
  };
}

function InlineDocViewer({
  meetingId,
  doc,
  onClose,
  onDownload,
}: {
  meetingId: string;
  doc: { id: string; fileName: string; fileSize: number };
  onClose: () => void;
  onDownload: () => void;
}) {
  const viewUrl = buildMeetingDocViewUrl(meetingId, doc.id);
  const sizeMB = (doc.fileSize / 1024 / 1024).toFixed(2);
  const meta = getDocTypeInfo(doc.fileName);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate2-900/80 backdrop-blur-xs p-4 sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex flex-col w-full max-w-5xl h-[88vh] bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate2-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate2-200 bg-slate2-50/90 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${meta.bgColor} ${meta.iconColor} shrink-0`}>
              <FileText size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate2-900 truncate">
                  {doc.fileName}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${meta.badgeColor}`}>
                  {meta.badge}
                </span>
              </div>
              <span className="text-xs font-mono text-slate2-500">{sizeMB} MB</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href={viewUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open document in new browser tab"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate2-200 bg-white text-slate2-700 hover:bg-slate2-50 hover:border-slate2-300 transition-colors shadow-2xs"
            >
              <ExternalLink size={15} />
            </a>
            <button
              type="button"
              onClick={onDownload}
              title="Download file"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand hover:bg-brand-dark text-white transition-colors shadow-2xs cursor-pointer"
            >
              <Download size={15} />
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Close viewer (Esc)"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Content Viewer iframe */}
        <div className="flex-1 overflow-hidden bg-slate2-100">
          <iframe
            src={viewUrl}
            title={doc.fileName}
            className="w-full h-full border-0"
          />
        </div>
      </div>
    </div>
  );
}

function DocumentsTab({
  meeting,
  canManage,
  onChange,
}: {
  meeting: MeetingDetailType;
  canManage: boolean;
  onChange: () => void;
}) {
  const { confirm } = useAlert();
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState<{ id: string; fileName: string; fileSize: number } | null>(null);

  // Total document metrics
  const totalDocs = (meeting.documents || []).length;
  const totalBytes = (meeting.documents || []).reduce((acc, d) => acc + (d.fileSize || 0), 0);
  const totalSizeFormatted = (totalBytes / (1024 * 1024)).toFixed(2);

  // Smart view: previewable files open in modal; Office files download directly
  const handleView = (d: { id: string; fileName: string; fileSize: number }) => {
    const ext = d.fileName.split(".").pop()?.toLowerCase() ?? "";
    if (INLINE_VIEWABLE_EXTS.includes(ext)) {
      setViewing(d);
    } else {
      download(d.id, d.fileName);
    }
  };

  const attach = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setSubmitting(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      await api.post(`/meetings/${meeting.id}/documents`, form);
      setFile(null);
      const input = document.getElementById(
        "meeting-document-file",
      ) as HTMLInputElement | null;
      if (input) input.value = "";
      onChange();
    } catch (err: any) {
      setError(err?.message || "Upload failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const download = async (documentId: string, fileName: string) => {
    try {
      const token = getToken();
      const downloadUrl = buildUrl(`/meetings/${meeting.id}/documents/${documentId}/download`);
      const response = await fetch(
        downloadUrl,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!response.ok) {
        const errJson = await response.json().catch(() => null);
        throw new Error(errJson?.error || "Download failed");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("Download error:", err);
      setError(err.message || "Failed to download file");
    }
  };

  const remove = async (documentId: string) => {
    const confirmed = await confirm({
      title: "Delete Document",
      message: "Are you sure you want to delete this document? This record will be permanently removed.",
      tone: "danger",
      confirmLabel: "Delete Document",
      cancelLabel: "Cancel",
    });
    if (!confirmed) return;
    await api.delete(`/meetings/${meeting.id}/documents/${documentId}`);
    onChange();
  };

  const isMeetingLocked = isLockedMeeting(meeting.status);

  return (
    <>
      {viewing && (
        <InlineDocViewer
          meetingId={meeting.id}
          doc={viewing}
          onClose={() => setViewing(null)}
          onDownload={() => download(viewing.id, viewing.fileName)}
        />
      )}
      <Card className="border border-slate2-200/90 bg-white rounded-2xl shadow-xs overflow-hidden">
        <CardHeader
          title={
            <span className="flex items-center gap-2.5">
              <span className="font-bold text-slate2-900">Document Repository & Exhibits</span>
              {isMeetingLocked ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate2-100 text-slate2-600 border border-slate2-200 px-2.5 py-0.5 text-xs font-semibold">
                  <Lock size={11} />
                  Certified & Locked
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 text-brand border border-teal-200/80 px-2.5 py-0.5 text-xs font-semibold">
                  <Paperclip size={11} />
                  {totalDocs} {totalDocs === 1 ? "File" : "Files"}
                </span>
              )}
            </span>
          }
          subtitle="Official presentation decks, committee materials, and supporting documentation"
        />

        {/* Locked Session Banner */}
        {isMeetingLocked && (
          <div className="mx-5 mb-4 rounded-xl border border-slate2-200 bg-slate2-50/90 p-4 shadow-2xs">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-slate2-200/80 p-2 text-slate2-700 shrink-0 mt-0.5">
                <Lock size={16} />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-slate2-900 uppercase tracking-wider">
                  Documents Certified & Archived
                </h4>
                <p className="text-xs text-slate2-600 leading-relaxed max-w-2xl">
                  This session has been formally approved and sealed. Attached files are archived as permanent corporate governance records.
                  Modifications require administrative override.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Metrics Pulse Bar */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-px bg-slate2-100 border-y border-slate2-200/80">
          <div className="bg-white p-4">
            <p className="text-[11px] font-semibold text-slate2-500 uppercase tracking-wider">Attached Exhibits</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-bold font-mono text-slate2-900">{totalDocs}</span>
              <span className="text-xs text-slate2-500">{totalDocs === 1 ? "document" : "documents"}</span>
            </div>
          </div>

          <div className="bg-white p-4">
            <p className="text-[11px] font-semibold text-slate2-500 uppercase tracking-wider">Archive Volume</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-bold font-mono text-brand">{totalSizeFormatted}</span>
              <span className="text-xs text-slate2-500">MB stored</span>
            </div>
          </div>

          <div className="bg-white p-4 col-span-2 md:col-span-1">
            <p className="text-[11px] font-semibold text-slate2-500 uppercase tracking-wider">Access Protocol</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-md">
                Verified Participants
              </span>
            </div>
          </div>
        </div>

        {/* Documents Ledger List */}
        <div className="divide-y divide-slate2-100">
          {(meeting.documents || []).length === 0 ? (
            <EmptyState
              title="No documents attached yet"
              description="Upload presentations, briefing packets, or supplementary files for this session."
            />
          ) : (
            (meeting.documents || []).map((d) => {
              const meta = getDocTypeInfo(d.fileName);
              const ext = d.fileName.split(".").pop()?.toLowerCase() ?? "";
              const isInlineViewable = INLINE_VIEWABLE_EXTS.includes(ext);

              return (
                <div
                  key={d.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 px-5 py-3.5 hover:bg-slate2-50/50 transition-colors"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${meta.bgColor} ${meta.iconColor} shrink-0`}>
                      {meta.badge === "EXCEL" ? (
                        <FileSpreadsheet size={20} />
                      ) : (
                        <FileText size={20} />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => handleView(d)}
                          className="text-sm font-semibold text-slate2-900 hover:text-brand hover:underline transition-colors text-left truncate cursor-pointer"
                          title={isInlineViewable ? `Preview ${d.fileName} inline` : `Download ${d.fileName}`}
                        >
                          {d.fileName}
                        </button>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${meta.badgeColor}`}>
                          {meta.badge}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-slate2-500 mt-1 flex-wrap">
                        <span>Uploaded by <strong className="text-slate2-700 font-semibold">{d.uploadedBy.name}</strong></span>
                        <span className="text-slate2-300">·</span>
                        <span className="font-mono text-slate2-600">{(d.fileSize / 1024 / 1024).toFixed(2)} MB</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    {/* View inline button */}
                    <button
                      type="button"
                      onClick={() => handleView(d)}
                      title={isInlineViewable ? "Preview document inline" : "Download document"}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate2-200 bg-white text-slate2-700 hover:border-brand hover:text-brand hover:bg-teal-50/50 transition-all shadow-2xs cursor-pointer"
                    >
                      <Eye size={16} />
                    </button>

                    {/* Download button */}
                    <button
                      type="button"
                      onClick={() => download(d.id, d.fileName)}
                      title="Download file to device"
                      className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand hover:bg-brand-dark text-white transition-all shadow-2xs cursor-pointer"
                    >
                      <Download size={16} />
                    </button>

                    {/* Delete button */}
                    {canManage && !isMeetingLocked && (
                      <button
                        type="button"
                        onClick={() => remove(d.id)}
                        title="Delete document"
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate2-200 bg-white text-slate2-400 hover:border-rose-200 hover:text-rose-600 hover:bg-rose-50 transition-all shadow-2xs cursor-pointer"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Corporate Upload Section */}
        {canManage && !isMeetingLocked && (
          <form onSubmit={attach} className="border-t border-slate2-100 p-5 bg-slate2-50/40">
            <div className="rounded-xl border border-dashed border-slate2-300 bg-white p-5 text-center transition-colors hover:border-brand">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-brand mb-2">
                <Paperclip size={20} />
              </div>
              <p className="text-xs font-bold text-slate2-800">
                Upload New Document or Exhibit
              </p>
              <p className="text-[11px] text-slate2-500 mt-0.5">
                PDF, Word, Excel spreadsheets, presentations, and image records up to 25MB
              </p>

              <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                <label
                  htmlFor="meeting-document-file"
                  className="cursor-pointer rounded-xl border border-slate2-300 bg-white hover:bg-slate2-50 px-4 py-2 text-xs font-semibold text-slate2-700 shadow-2xs transition-all hover:border-slate2-400"
                >
                  Choose Document File
                </label>
                <input
                  id="meeting-document-file"
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="hidden"
                />

                {file && (
                  <div className="flex items-center gap-2 bg-teal-50 border border-teal-200 px-3 py-1.5 rounded-xl text-xs text-brand font-medium">
                    <FileText size={14} />
                    <span className="truncate max-w-[200px]">{file.name}</span>
                    <span className="text-slate2-400 font-mono text-[11px]">
                      ({(file.size / 1024 / 1024).toFixed(2)} MB)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        const input = document.getElementById("meeting-document-file") as HTMLInputElement | null;
                        if (input) input.value = "";
                      }}
                      className="text-slate2-400 hover:text-rose-600 ml-1 cursor-pointer"
                    >
                      <X size={13} />
                    </button>
                  </div>
                )}

                <Button type="submit" disabled={!file || submitting}>
                  {submitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Uploading…
                    </>
                  ) : (
                    <>
                      <Plus size={14} /> Upload to Repository
                    </>
                  )}
                </Button>
              </div>

              {error && (
                <p className="mt-3 text-xs font-medium text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2 max-w-md mx-auto">
                  {error}
                </p>
              )}
            </div>
          </form>
        )}
      </Card>
    </>
  );
}

function ParticipantsTab({
  meeting,
  canManage: propCanManage,
  onChange,
  onSignSelf,
}: {
  meeting: MeetingDetailType;
  canManage?: boolean;
  onChange: () => void;
  onSignSelf?: () => void;
}) {
  const { user, hasPermission, hasAnyPermission } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [selected, setSelected] = useState("");
  const [addingParticipant, setAddingParticipant] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Participant removal dialog state
  const [participantToDelete, setParticipantToDelete] =
    useState<MeetingParticipant | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Attendance finalization state & modal
  const [finalizeModalOpen, setFinalizeModalOpen] = useState(false);
  const [stagedAttendance, setStagedAttendance] = useState<
    Record<string, "ATTENDED" | "NOT ATTENDED">
  >({});
  const [isFinalizing, setIsFinalizing] = useState(false);

  // Toast feedback
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  // Participant RSVP update dialog state (for organizer/admin)
  const [rsvpTarget, setRsvpTarget] = useState<MeetingParticipant | null>(null);
  const [targetStatus, setTargetStatus] = useState<"ACCEPTED" | "REJECTED" | "INVITED">("ACCEPTED");
  const [targetReason, setTargetReason] = useState("Due to another meeting");
  const [savingRsvp, setSavingRsvp] = useState(false);

  // RSVP Filter
  const [rsvpFilter, setRsvpFilter] = useState<"ALL" | "ACCEPTED" | "REJECTED" | "AWAITING">("ALL");

  const handleOpenRsvpModal = (p: MeetingParticipant) => {
    setRsvpTarget(p);
    const curr = p.status === "ACCEPTED" ? "ACCEPTED" : (p.status === "REJECTED" || p.status === "DECLINED") ? "REJECTED" : "INVITED";
    setTargetStatus(curr);
    setTargetReason(p.rejectionReason || "Due to another meeting");
  };

  const handleSaveParticipantRsvp = async () => {
    if (!rsvpTarget) return;
    setSavingRsvp(true);
    try {
      await api.patch(`/meetings/${meeting.id}/participants/${rsvpTarget.id}/rsvp`, {
        status: targetStatus,
        rejectionReason: targetStatus === "REJECTED" ? (targetReason.trim() || "Due to another meeting") : null,
      });
      setRsvpTarget(null);
      onChange();
      setToast({
        message: `Updated RSVP for ${rsvpTarget.user.name}.`,
        type: "success",
      });
    } catch (err: any) {
      setToast({
        message: err.message || "Failed to update participant RSVP.",
        type: "error",
      });
    } finally {
      setSavingRsvp(false);
    }
  };

  // Authorization & Meeting State
  const hasAdminOverride = hasPermission("ADMIN_OVERRIDE");
  const isOrganizer = !!(user && meeting && user.id === meeting.organizer.id);
  const isLocked = isLockedMeeting(meeting.status);
  const isApproved = meeting.status === "APPROVED";
  const isCancelled = meeting.status === "CANCELLED";

  // Modifications to participants roster and attendance are strictly locked when meeting is locked,
  // until unlocked via the Unlock button with an administrator reason.
  const canEdit = !isLocked;
  const canManage = canEdit && (
    hasAdminOverride ||
    isOrganizer ||
    hasPermission("meetings:manage_participants") ||
    hasPermission("meetings:edit:all") ||
    (hasPermission("meetings:edit:dept") && user?.department?.id === meeting.department?.id) ||
    !!propCanManage
  );

  const meetingEnded = hasMeetingEnded(meeting);
  const isAttendanceFinalized = !!meeting.attendanceFinalized;
  const canEditAttendance = !isLocked && !isAttendanceFinalized && meetingEnded && canManage;

  // If meeting is locked, participants roster and editing are locked
  const isParticipantsLocked = isLocked;

  useEffect(() => {
    api
      .get<User[]>("/users")
      .then(setUsers)
      .catch(() => { });
  }, []);

  // Add participant
  const add = async () => {
    if (!selected || !canManage || addingParticipant) return;
    setAddingParticipant(true);
    try {
      await api.post(`/meetings/${meeting.id}/participants`, {
        userIds: [selected],
      });
      setSelected("");
      onChange();
      setToast({
        message: "Participant invited successfully.",
        type: "success",
      });
    } catch (err: any) {
      setToast({
        message: err.message || "Failed to add participant.",
        type: "error",
      });
    } finally {
      setAddingParticipant(false);
    }
  };

  // Remove participant with confirmation modal
  const handleConfirmDelete = async () => {
    if (!participantToDelete || isDeleting || !canManage) return;
    setIsDeleting(true);
    try {
      await api.delete(
        `/meetings/${meeting.id}/participants/${participantToDelete.id}`,
      );
      setParticipantToDelete(null);
      onChange();
      setToast({
        message: "Participant removed successfully.",
        type: "success",
      });
    } catch (err: any) {
      setToast({
        message: "Failed to remove participant. Please try again.",
        type: "error",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Update single participant attendance status
  const updateSingleAttendance = async (
    participantId: string,
    participated: boolean,
  ) => {
    if (!canEditAttendance || togglingId) return;
    setTogglingId(participantId);
    try {
      await api.patch(
        `/meetings/${meeting.id}/participants/${participantId}/attendance`,
        {
          participated,
        },
      );
      onChange();
    } catch (err: any) {
      setToast({
        message: err.message || "Failed to update attendance.",
        type: "error",
      });
    } finally {
      setTogglingId(null);
    }
  };

  // Open finalize attendance modal
  const openFinalizeModal = () => {
    // Populate initial staged attendance from current participants
    const initialMap: Record<string, "ATTENDED" | "NOT ATTENDED"> = {};
    for (const p of (meeting.participants || [])) {
      initialMap[p.id] =
        p.participated || p.status === "ATTENDED" ? "ATTENDED" : "NOT ATTENDED";
    }
    setStagedAttendance(initialMap);
    setFinalizeModalOpen(true);
  };

  // Confirm finalize attendance
  const handleConfirmFinalize = async () => {
    if (isFinalizing) return;
    setIsFinalizing(true);
    try {
      const records = (meeting.participants || []).map((p) => ({
        participantId: p.id,
        status:
          stagedAttendance[p.id] ||
          (p.participated || p.status === "ATTENDED"
            ? "ATTENDED"
            : "NOT ATTENDED"),
      }));

      await api.post(`/meetings/${meeting.id}/attendance/finalize`, {
        records,
      });

      setFinalizeModalOpen(false);
      onChange();
      setToast({
        message: "Attendance finalized successfully.",
        type: "success",
      });
    } catch (err: any) {
      setToast({
        message:
          err.message || "Failed to finalize attendance. Please try again.",
        type: "error",
      });
    } finally {
      setIsFinalizing(false);
    }
  };

  // Stats calculation
  const totalParticipants = (meeting.participants || []).length;
  const acceptedCount = (meeting.participants || []).filter(
    (p) => p.status === "ACCEPTED",
  ).length;
  const rejectedCount = (meeting.participants || []).filter(
    (p) => p.status === "REJECTED" || p.status === "DECLINED",
  ).length;
  const awaitingCount = (meeting.participants || []).filter(
    (p) =>
      p.status !== "ACCEPTED" &&
      p.status !== "REJECTED" &&
      p.status !== "DECLINED",
  ).length;
  const attendedCount = (meeting.participants || []).filter(
    (p) => p.participated || p.status === "ATTENDED",
  ).length;
  const attendancePct =
    totalParticipants > 0
      ? Math.round((attendedCount / totalParticipants) * 100)
      : 0;

  const displayedParticipants = useMemo(() => {
    const list = meeting.participants || [];
    if (rsvpFilter === "ACCEPTED")
      return list.filter((p) => p.status === "ACCEPTED");
    if (rsvpFilter === "REJECTED")
      return list.filter(
        (p) => p.status === "REJECTED" || p.status === "DECLINED",
      );
    if (rsvpFilter === "AWAITING")
      return list.filter(
        (p) =>
          p.status !== "ACCEPTED" &&
          p.status !== "REJECTED" &&
          p.status !== "DECLINED",
      );
    return list;
  }, [meeting.participants, rsvpFilter]);

  const invitedIds = new Set((meeting.participants || []).map((p) => p.user?.id).filter(Boolean));
  const available = users.filter((u) => !invitedIds.has(u.id));

  // Modal stats calculation
  const modalAttendedCount = (meeting.participants || []).filter(
    (p) => stagedAttendance[p.id] === "ATTENDED",
  ).length;
  const modalPct =
    totalParticipants > 0
      ? Math.round((modalAttendedCount / totalParticipants) * 100)
      : 0;

  return (
    <Card className="border border-slate2-200/90 bg-white rounded-2xl shadow-xs overflow-hidden">
      <Toast
        message={toast?.message || null}
        type={toast?.type}
        onClose={() => setToast(null)}
      />

      {/* Header: Title, Subtitle, Progress, Finalized Pill, Edit Button */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate2-100 bg-white">
        <div>
          <div className="flex items-center gap-2.5">
            <h3 className="text-base sm:text-lg font-bold text-slate2-900 leading-tight">
              Participants & Attendance
            </h3>
            {isParticipantsLocked ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate2-100 text-slate2-500 border border-slate2-200 px-2.5 py-0.5 text-xs font-semibold">
                <Lock size={11} />
                View Only
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 text-brand border border-teal-200/80 px-2.5 py-0.5 text-xs font-semibold">
                <Users size={11} />
                {totalParticipants} {totalParticipants === 1 ? "Member" : "Members"}
              </span>
            )}
          </div>
          <p className="text-xs text-slate2-500 mt-0.5">
            Confirmed attendance, official RSVP declarations, and attestation pre-signatures
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate2-600 font-medium">
              Attendance {attendedCount}/{totalParticipants}
            </span>
            <div className="h-2 w-20 rounded-full bg-slate2-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-brand transition-all duration-300"
                style={{ width: `${attendancePct}%` }}
              />
            </div>
          </div>

          {isAttendanceFinalized ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200/80 px-2.5 py-0.5 text-xs font-semibold">
              <CheckCircle2 size={13} className="text-emerald-600" /> Finalized
            </span>
          ) : !isCancelled && meetingEnded && (canManage || hasAdminOverride) ? (
            <button
              type="button"
              onClick={openFinalizeModal}
              disabled={isFinalizing}
              className="inline-flex items-center gap-1 rounded-full bg-brand/10 text-brand border border-brand/20 px-3 py-1 text-xs font-semibold hover:bg-brand/20 transition-colors cursor-pointer"
            >
              <CheckCircle2 size={13} /> Finalize Roster
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate2-100 text-slate2-600 px-2.5 py-0.5 text-xs font-medium">
              <Clock size={12} /> {isCancelled ? "Cancelled" : "In Session"}
            </span>
          )}

          {canEditAttendance && (
            <button
              type="button"
              onClick={openFinalizeModal}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate2-200 bg-white px-3 py-1 text-xs font-semibold text-slate2-700 hover:bg-slate2-50 transition-colors shadow-2xs cursor-pointer"
              title="Edit attendance"
            >
              <Pencil size={12} className="text-slate2-600" />
              <span>Edit</span>
            </button>
          )}
        </div>
      </div>

      {/* Governance Metrics Pulse Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate2-100 border-b border-slate2-200/80">
        <div className="bg-white p-4">
          <p className="text-[11px] font-semibold text-slate2-500 uppercase tracking-wider">Total Invited</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-slate2-900">{totalParticipants}</span>
            <span className="text-xs text-slate2-500">participants</span>
          </div>
        </div>

        <div className="bg-white p-4">
          <p className="text-[11px] font-semibold text-slate2-500 uppercase tracking-wider">Attendance Confirmed</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-emerald-700">{acceptedCount}</span>
            <span className="text-xs font-semibold text-emerald-600">
              ({totalParticipants > 0 ? Math.round((acceptedCount / totalParticipants) * 100) : 0}%)
            </span>
          </div>
        </div>

        <div className="bg-white p-4">
          <p className="text-[11px] font-semibold text-slate2-500 uppercase tracking-wider">Checked In</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-brand">{attendedCount}</span>
            <span className="text-xs text-slate2-500">({attendancePct}%)</span>
          </div>
        </div>

        <div className="bg-white p-4">
          <p className="text-[11px] font-semibold text-slate2-500 uppercase tracking-wider">Pending RSVP</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className={`text-xl font-bold font-mono ${awaitingCount > 0 ? "text-amber-600" : "text-slate2-700"}`}>
              {awaitingCount}
            </span>
            <span className="text-xs text-slate2-400">awaiting</span>
          </div>
        </div>
      </div>

      {/* RSVP Filter Strip */}
      <div className="flex items-center gap-1.5 px-5 py-3 bg-slate2-50/70 border-b border-slate2-100 overflow-x-auto text-xs">
        <span className="font-semibold text-slate2-500 text-[11px] uppercase tracking-wider mr-1.5 shrink-0">
          Filter RSVP:
        </span>
        <button
          type="button"
          onClick={() => setRsvpFilter("ALL")}
          className={`px-3 py-1 rounded-full font-medium transition-all shrink-0 cursor-pointer ${rsvpFilter === "ALL"
            ? "bg-[#0B7A6B] text-white shadow-2xs font-semibold"
            : "bg-white text-slate2-700 hover:bg-slate2-100 border border-slate2-200"
            }`}
        >
          All ({totalParticipants})
        </button>

        <button
          type="button"
          onClick={() => setRsvpFilter(rsvpFilter === "ACCEPTED" ? "ALL" : "ACCEPTED")}
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-medium transition-all shrink-0 cursor-pointer ${rsvpFilter === "ACCEPTED"
            ? "bg-emerald-600 text-white shadow-2xs font-semibold"
            : "bg-white text-emerald-800 border border-emerald-200 hover:bg-emerald-50"
            }`}
        >
          <CheckCircle2 size={12} className={rsvpFilter === "ACCEPTED" ? "text-white" : "text-emerald-600"} />
          <span>Accepted ({acceptedCount})</span>
        </button>

        <button
          type="button"
          onClick={() => setRsvpFilter(rsvpFilter === "REJECTED" ? "ALL" : "REJECTED")}
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-medium transition-all shrink-0 cursor-pointer ${rsvpFilter === "REJECTED"
            ? "bg-rose-600 text-white shadow-2xs font-semibold"
            : "bg-white text-rose-800 border border-rose-200 hover:bg-rose-50"
            }`}
        >
          <XCircle size={12} className={rsvpFilter === "REJECTED" ? "text-white" : "text-rose-600"} />
          <span>Rejected ({rejectedCount})</span>
        </button>

        {awaitingCount > 0 && (
          <button
            type="button"
            onClick={() => setRsvpFilter(rsvpFilter === "AWAITING" ? "ALL" : "AWAITING")}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-medium transition-all shrink-0 cursor-pointer ${rsvpFilter === "AWAITING"
              ? "bg-amber-600 text-white shadow-2xs font-semibold"
              : "bg-white text-amber-800 border border-amber-200 hover:bg-amber-50"
              }`}
          >
            <Clock size={12} className={rsvpFilter === "AWAITING" ? "text-white" : "text-amber-600"} />
            <span>Awaiting ({awaitingCount})</span>
          </button>
        )}

        {rsvpFilter !== "ALL" && (
          <button
            type="button"
            onClick={() => setRsvpFilter("ALL")}
            className="text-xs font-semibold text-brand hover:underline shrink-0 ml-2 cursor-pointer"
          >
            Reset filter
          </button>
        )}
      </div>

      {/* Participants List */}
      <div className="divide-y divide-slate2-100">
        {displayedParticipants.length === 0 ? (
          <EmptyState
            title={
              rsvpFilter !== "ALL"
                ? `No participants with status '${rsvpFilter}'`
                : "No participants invited yet"
            }
            description={
              rsvpFilter !== "ALL"
                ? "Try resetting the filter to see all participants."
                : "Invite committee members and stakeholders to track attendance and attestations."
            }
          />
        ) : (
          displayedParticipants.map((p) => {
            const isAttended = p.participated || p.status === "ATTENDED";
            const initials = p.user.name
              ? p.user.name
                .split(" ")
                .filter(Boolean)
                .map((n) => n[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()
              : "U";

            return (
              <div
                key={p.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 px-5 py-3.5 hover:bg-slate2-50/50 transition-colors"
              >
                {/* Left: Avatar + Name + RSVP Badge + Email + Rejection Reason */}
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white text-xs font-bold tracking-tight shadow-2xs"
                    style={{ backgroundColor: p.user.avatarColor || "#0B7A6B" }}
                  >
                    {initials}
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate2-900">
                        {p.user.name}
                      </span>

                      {/* RSVP Badges */}
                      {p.status === "ACCEPTED" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold">
                          <CheckCircle2 size={12} className="text-emerald-600" />
                          <span>Accepted</span>
                        </span>
                      ) : p.status === "REJECTED" || p.status === "DECLINED" ? (
                        <div className="inline-flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 text-rose-800 border border-rose-200 px-2.5 py-0.5 text-xs font-semibold">
                            <XCircle size={12} className="text-rose-600" />
                            <span>Declined</span>
                          </span>
                          {p.rejectionReason && (
                            <span className="inline-flex items-center text-xs text-rose-700 bg-rose-50/80 border border-rose-200/70 px-2 py-0.5 rounded-md font-medium">
                              Reason: &ldquo;{p.rejectionReason}&rdquo;
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200/80 px-2.5 py-0.5 text-xs font-medium">
                          <Clock size={11} className="text-amber-600" />
                          <span>Awaiting Response</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-1 text-xs text-slate2-500 flex-wrap">
                      <span className="truncate">{p.user.email}</span>
                      {p.user.department && (
                        <>
                          <span className="text-slate2-300">·</span>
                          <span className="text-slate2-600 font-medium">{p.user.department.name}</span>
                        </>
                      )}
                      {p.respondedAt && (
                        <>
                          <span className="text-slate2-300">·</span>
                          <span className="text-slate2-400 font-mono text-[11px]">
                            Responded {new Date(p.respondedAt).toLocaleDateString()}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Organizer RSVP Button + Attended/Absent Toggle + Signature Badge + Delete Action */}
                <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
                  {canManage && !isParticipantsLocked && (
                    <button
                      type="button"
                      onClick={() => handleOpenRsvpModal(p)}
                      title="Update participant invitation status"
                      className="inline-flex items-center gap-1 rounded-xl border border-slate2-200 bg-white hover:bg-slate2-50 px-3 py-1.5 text-xs font-semibold text-slate2-700 transition-colors shadow-2xs cursor-pointer"
                    >
                      <ClipboardList size={13} className="text-slate2-500" />
                      <span>RSVP Status</span>
                    </button>
                  )}

                  {/* Attendance status toggle [ Attended | Absent ] */}
                  <div className="inline-flex items-center rounded-xl bg-slate2-100 p-0.5 border border-slate2-200/80">
                    <button
                      type="button"
                      onClick={() => updateSingleAttendance(p.id, true)}
                      disabled={!canEditAttendance || togglingId === p.id}
                      title={
                        canEditAttendance
                          ? "Mark as Attended"
                          : isAttendanceFinalized
                            ? "Attendance finalized"
                            : `Available after meeting ends at ${meeting.endTime}`
                      }
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-all ${isAttended
                        ? "bg-brand text-white shadow-2xs"
                        : "text-slate2-600 hover:text-slate2-900 cursor-pointer"
                        } ${!canEditAttendance ? "opacity-80 cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      <CheckCircle2
                        size={13}
                        className={isAttended ? "text-white" : "text-slate2-400"}
                      />
                      <span>Attended</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSingleAttendance(p.id, false)}
                      disabled={!canEditAttendance || togglingId === p.id}
                      title={
                        canEditAttendance
                          ? "Mark as Absent"
                          : isAttendanceFinalized
                            ? "Attendance finalized"
                            : `Available after meeting ends at ${meeting.endTime}`
                      }
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${!isAttended
                        ? "bg-slate2-700 text-white shadow-2xs"
                        : "text-slate2-500 hover:text-slate2-800 cursor-pointer"
                        } ${!canEditAttendance ? "opacity-80 cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      <XCircle
                        size={13}
                        className={!isAttended ? "text-white" : "text-slate2-400"}
                      />
                      <span>Absent</span>
                    </button>
                  </div>

                  {/* Digital Signature Status */}
                  {(() => {
                    const sig = meeting.participantSignatures?.find((s) => s.userId === p.user.id);
                    if (sig) {
                      return (
                        <span
                          className="inline-flex items-center justify-center h-8 w-8 rounded-xl bg-emerald-50 border border-emerald-200/90 text-emerald-600 shadow-2xs shrink-0"
                          title={`Digitally signed on ${new Date(sig.signedAt).toLocaleDateString()}`}
                        >
                          <Signature size={15} />
                        </span>
                      );
                    }
                    if (
                      p.user.id === user?.id &&
                      (!!meeting.signaturesRequestedAt || meeting.status === "PENDING_SIGNATURES") &&
                      meeting.status !== "APPROVED" &&
                      meeting.status !== "CANCELLED" &&
                      onSignSelf
                    ) {
                      return (
                        <button
                          type="button"
                          onClick={onSignSelf}
                          title="Affix your digital signature to the minutes"
                          className="inline-flex items-center justify-center h-8 w-8 rounded-xl bg-brand/10 hover:bg-brand text-brand hover:text-white border border-brand/20 transition-all cursor-pointer shadow-2xs shrink-0"
                        >
                          <Signature size={15} />
                        </button>
                      );
                    }
                    return (
                      <span
                        className="inline-flex items-center justify-center h-8 w-8 rounded-xl bg-amber-50/80 border border-amber-200/80 text-amber-600 shadow-2xs shrink-0"
                        title="Attestation signature pending"
                      >
                        <Signature size={15} className="opacity-70" />
                      </span>
                    );
                  })()}

                  {/* Remove Participant Action */}
                  {canManage && !isParticipantsLocked && (
                    <button
                      type="button"
                      onClick={() => setParticipantToDelete(p)}
                      title="Remove participant"
                      className="p-1.5 text-slate2-400 hover:text-rose-600 transition-colors cursor-pointer"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Participant Section */}
      {canManage && !isParticipantsLocked && (
        <div className="flex items-center gap-3 border-t border-slate2-100 p-4 bg-slate2-50/40">
          <div className="relative flex-1">
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={addingParticipant}
              className="w-full appearance-none rounded-xl border border-slate2-200 bg-white px-4 py-2.5 text-xs text-slate2-700 placeholder:text-slate2-400 focus:outline-none focus:border-brand pr-8 cursor-pointer shadow-2xs"
            >
              <option value="">Select a user to invite...</option>
              {available.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} — {u.department?.name || u.email}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate2-500"
            />
          </div>
          <button
            type="button"
            onClick={add}
            disabled={!selected || addingParticipant}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0B7A6B] hover:bg-brand-dark disabled:opacity-50 text-white font-semibold text-xs px-5 py-2.5 transition-colors shadow-2xs shrink-0 cursor-pointer"
          >
            {addingParticipant ? (
              <>
                <Loader2 size={13} className="animate-spin" /> Inviting…
              </>
            ) : (
              <>
                <Plus size={14} /> Invite Participant
              </>
            )}
          </button>
        </div>
      )}

      {/* Remove Participant Confirmation Modal */}
      {participantToDelete && (
        <Modal
          open
          onClose={() => {
            if (!isDeleting) setParticipantToDelete(null);
          }}
          title="Remove Participant?"
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-rose-100 bg-rose-50/70 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle
                  className="shrink-0 text-rose-600 mt-0.5"
                  size={20}
                />
                <div className="space-y-1 text-xs">
                  <p className="text-sm font-semibold text-slate2-800">
                    Are you sure you want to remove{" "}
                    {participantToDelete.user.name} from this meeting?
                  </p>
                  <p className="text-slate2-500">
                    This will remove the participant from attendance tracking
                    and meeting records. You can re-invite them at any time.
                  </p>
                </div>
              </div>
            </div>

            {/* Participant Details Card */}
            <div className="flex items-center gap-3 rounded-lg border border-slate2-200 bg-slate2-50/50 p-3.5">
              <Avatar
                name={participantToDelete.user.name}
                color={participantToDelete.user.avatarColor || "#0B7A6B"}
              />
              <div>
                <p className="text-sm font-semibold text-slate2-800">
                  {participantToDelete.user.name}
                </p>
                <p className="text-xs text-slate2-500">
                  {participantToDelete.user.email}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate2-100 pt-3">
              <Button
                variant="secondary"
                onClick={() => setParticipantToDelete(null)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Removing
                    Participant...
                  </>
                ) : (
                  "Remove Participant"
                )}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Finalize Meeting Attendance Confirmation Modal */}
      {finalizeModalOpen && (
        <Modal
          open
          onClose={() => {
            if (!isFinalizing) setFinalizeModalOpen(false);
          }}
          title="Finalize Meeting Attendance"
          wide
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-brand/20 bg-brand/5 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2
                  className="shrink-0 text-brand mt-0.5"
                  size={20}
                />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate2-800">
                    The meeting has ended. Please confirm the attendance of all
                    participants.
                  </p>
                  <p className="text-xs text-slate2-500">
                    Ensure each participant is accurately recorded as Attended
                    or Not Attended. Finalizing will lock the attendance
                    record.
                  </p>
                </div>
              </div>
            </div>

            {/* Participant list in modal */}
            <div className="max-h-[50vh] overflow-y-auto divide-y divide-slate2-100 rounded-lg border border-slate2-200">
              {(meeting.participants || []).map((p) => {
                const currentStatus =
                  stagedAttendance[p.id] || "NOT ATTENDED";
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 p-3 hover:bg-slate2-50/50"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar
                        name={p.user?.name || "Participant"}
                        color={p.user?.avatarColor || "#0B7A6B"}
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate2-800 truncate">
                          {p.user?.name || "Participant"}
                        </p>
                        <p className="text-[11px] text-slate2-400 truncate">
                          {p.user?.email || ""}
                        </p>
                      </div>
                    </div>

                    <div className="inline-flex items-center rounded-lg bg-slate2-100 p-0.5 border border-slate2-200 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setStagedAttendance((prev) => ({
                            ...prev,
                            [p.id]: "ATTENDED",
                          }))
                        }
                        disabled={isFinalizing}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all ${currentStatus === "ATTENDED"
                          ? "bg-brand text-white shadow-sm"
                          : "text-slate2-600 hover:text-slate2-900"
                          }`}
                      >
                        ATTENDED
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setStagedAttendance((prev) => ({
                            ...prev,
                            [p.id]: "NOT ATTENDED",
                          }))
                        }
                        disabled={isFinalizing}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all ${currentStatus === "NOT ATTENDED"
                          ? "bg-slate2-700 text-white shadow-sm"
                          : "text-slate2-500 hover:text-slate2-800"
                          }`}
                      >
                        NOT ATTENDED
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Attendance Summary */}
            <div className="flex items-center justify-between rounded-lg bg-slate2-50 p-3 text-xs">
              <span className="text-slate2-500 font-medium">Summary:</span>
              <strong className="text-slate2-800 font-semibold">
                {totalParticipants} invited · {modalAttendedCount} attended (
                {modalPct}% attendance)
              </strong>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate2-100 pt-3">
              <Button
                variant="secondary"
                onClick={() => setFinalizeModalOpen(false)}
                disabled={isFinalizing}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirmFinalize}
                disabled={isFinalizing}
              >
                {isFinalizing ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Finalizing
                    Attendance...
                  </>
                ) : (
                  "Confirm & Finalize Attendance"
                )}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Update Participant RSVP Modal for Organizer / Admin */}
      {rsvpTarget && (
        <Modal
          open
          onClose={() => {
            if (!savingRsvp) setRsvpTarget(null);
          }}
          title={`Update RSVP: ${rsvpTarget.user.name}`}
        >
          <div className="space-y-4 text-xs text-slate2-700">
            <div>
              <label className="text-xs font-semibold text-slate2-700 block mb-2">
                Invitation Status
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setTargetStatus("ACCEPTED")}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${targetStatus === "ACCEPTED"
                    ? "bg-emerald-50 border-emerald-300 text-emerald-800 shadow-2xs ring-1 ring-emerald-400"
                    : "bg-white border-slate2-200 text-slate2-600 hover:bg-slate2-50"
                    }`}
                >
                  <CheckCircle2
                    size={18}
                    className={
                      targetStatus === "ACCEPTED"
                        ? "text-emerald-600"
                        : "text-slate2-400"
                    }
                  />
                  <span className="mt-1">Accepted</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTargetStatus("REJECTED")}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${targetStatus === "REJECTED"
                    ? "bg-rose-50 border-rose-300 text-rose-800 shadow-2xs ring-1 ring-rose-400"
                    : "bg-white border-slate2-200 text-slate2-600 hover:bg-slate2-50"
                    }`}
                >
                  <XCircle
                    size={18}
                    className={
                      targetStatus === "REJECTED"
                        ? "text-rose-600"
                        : "text-slate2-400"
                    }
                  />
                  <span className="mt-1">Rejected</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTargetStatus("INVITED")}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${targetStatus === "INVITED"
                    ? "bg-amber-50 border-amber-300 text-amber-800 shadow-2xs ring-1 ring-amber-400"
                    : "bg-white border-slate2-200 text-slate2-600 hover:bg-slate2-50"
                    }`}
                >
                  <Clock
                    size={18}
                    className={
                      targetStatus === "INVITED"
                        ? "text-amber-600"
                        : "text-slate2-400"
                    }
                  />
                  <span className="mt-1">Awaiting</span>
                </button>
              </div>
            </div>

            {targetStatus === "REJECTED" && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate2-700 block">
                  Rejection Reason
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "Due to another meeting",
                    "Schedule conflict",
                    "Out of office / Annual leave",
                    "Prior business commitment",
                    "Field visit / Traveling",
                  ].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setTargetReason(chip)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors cursor-pointer ${targetReason === chip
                        ? "bg-rose-100 border-rose-300 text-rose-800"
                        : "bg-slate2-50 border-slate2-200 text-slate2-600 hover:bg-slate2-100"
                        }`}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={targetReason}
                  onChange={(e) => setTargetReason(e.target.value)}
                  placeholder="e.g. Due to another meeting"
                  className="w-full rounded-xl border border-slate2-200 bg-white px-3.5 py-2 text-xs text-slate2-800 placeholder:text-slate2-400 focus:outline-none focus:border-rose-400"
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate2-100">
              <Button
                variant="secondary"
                type="button"
                disabled={savingRsvp}
                onClick={() => setRsvpTarget(null)}
                className="text-xs"
              >
                Cancel
              </Button>
              <button
                type="button"
                disabled={
                  savingRsvp ||
                  (targetStatus === "REJECTED" && !targetReason.trim())
                }
                onClick={handleSaveParticipantRsvp}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#0B7A6B] hover:bg-brand-dark disabled:opacity-50 text-white font-semibold text-xs px-4 py-2 transition-colors cursor-pointer shadow-2xs"
              >
                {savingRsvp ? (
                  <>
                    <Loader2 size={13} className="animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <Save size={13} />
                    <span>Save Response</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Card>
  );
}
