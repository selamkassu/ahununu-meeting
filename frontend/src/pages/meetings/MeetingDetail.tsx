import React, { useEffect, useState, useMemo, useRef } from "react";
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
} from "lucide-react";
import { api, ApiError, getToken, buildUrl } from "../../api/client";
import { RichTextEditor } from "../../components/editor/RichTextEditor";
import { RichTextRenderer } from "../../components/editor/RichTextRenderer";
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

export function hasMeetingEnded(meeting: MeetingDetailType): boolean {
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
    dot: "bg-amber-500 animate-pulse",
  },
  PENDING_SIGNATURES: {
    bg: "bg-orange-50 text-orange-800",
    border: "border-orange-200 hover:border-orange-300",
    dot: "bg-orange-500 animate-pulse",
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

  useEffect(() => {
    if (tabParam) {
      setTab(tabParam);
    }
  }, [tabParam]);
  const [loading, setLoading] = useState(true);

  const isLocked = isLockedMeeting(meeting?.status);
  const isApproved = meeting?.status === "APPROVED";
  const isCancelled = meeting?.status === "CANCELLED";
  const hasAdminOverride = hasPermission("ADMIN_OVERRIDE");

  // When a meeting is APPROVED, it is strictly READ-ONLY for everyone until unlocked!
  // When a meeting is CANCELLED, it is strictly READ-ONLY for everyone (terminal state)!
  const canEdit = !isApproved && !isCancelled && (!isLocked || hasAdminOverride);
  const isOrganizer = !!(user && meeting && user.id === meeting.organizer.id);

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
    return meeting?.participants?.find((p) => p.user.id === user?.id);
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
    }> = (meeting.participants || []).map((p) => ({
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

  const load = () => {
    if (!id) return;
    api
      .get<MeetingDetailType>(`/meetings/${id}`)
      .then(setMeeting)
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  // Handle RSVP action triggered from Email action buttons (?rsvp=ACCEPTED or ?rsvp=REJECTED)
  const rsvpHandledRef = useRef(false);
  useEffect(() => {
    if (!meeting || !user || rsvpHandledRef.current) return;
    const rsvpQuery = searchParams.get("rsvp");
    if (!rsvpQuery) return;

    const myPart = meeting.participants?.find((p) => p.user.id === user.id);
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
      } catch {}
    } catch (err: any) {
      // Re-fetch latest meeting state from server to guarantee sync
      try {
        const fresh = await api.get<MeetingDetailType>(`/meetings/${id}`);
        if (fresh) setMeeting(fresh);
      } catch {}
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
    if (meeting.status === "APPROVED" && !hasAdminOverride) {
      await alert({
        title: "Meeting is Locked",
        message:
          "This meeting is approved and strictly read-only. It must be unlocked first by an administrator with ADMIN_OVERRIDE permission.",
        tone: "warning",
      });
      return;
    }
    if (status === "APPROVED") {
      setIsApprovalModalOpen(true);
      return;
    }
    if (status === "PENDING_SIGNATURES") {
      handleRequestSignatures();
      return;
    }
    if (isLocked && !hasAdminOverride) {
      await alert({
        title: "Status Change Blocked",
        message:
          "This meeting is locked. Only users with the ADMIN_OVERRIDE permission can alter status.",
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

  if (loading) {
    return <div className="h-64 animate-pulse rounded-xl bg-slate2-100" />;
  }
  if (!meeting) {
    return (
      <Card>
        <EmptyState
          title="Meeting not found"
          description="It may have been deleted, or the link is incorrect."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Link
        to="/meetings"
        className="inline-flex items-center gap-1 text-xs font-medium text-slate2-500 hover:text-brand"
      >
        <ArrowLeft size={14} /> Back to meetings
      </Link>

      <Card className="overflow-hidden border border-slate2-200/80 shadow-sm bg-white">
        {/* Top brand accent stripe */}
        <div className="h-1 w-full bg-gradient-to-r from-brand via-brand-light to-accent" />

        <div className="p-5 sm:p-6 space-y-4">
          {/* Header Row: Title, Code on left; Badges, Actions on right */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1.5 flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate2-800">
                  {meeting.title}
                </h2>
              </div>
              {meeting.description ? (
                <p className="text-sm text-slate2-600 max-w-3xl leading-relaxed pt-0.5">
                  {meeting.description}
                </p>
              ) : null}
            </div>

            {/* Action Hub & Status Controls */}
            <div className="flex flex-wrap items-center gap-2 sm:self-end lg:self-start shrink-0">
              <div className="flex flex-col gap-y-2">
                <div className="flex flex-row gap-x-2 justify-end">
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

                  {/* Complete Meeting Button — only when active and content requirements satisfied */}
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

                  {/* Approve Meeting — only when ready for approval or force approve via admin override */}
                  {canShowApproveButton && (
                    <Button
                      variant="primary"
                      onClick={() => setIsApprovalModalOpen(true)}
                      className="bg-brand hover:bg-brand-dark text-white text-xs py-1.5 px-3.5 shadow-sm inline-flex items-center gap-1.5 font-medium transition-all cursor-pointer"
                    >
                      <ShieldCheck size={14} />
                      <span>Approve Meeting</span>
                    </Button>
                  )}
                </div>
                <div className="flex flex-row items-center gap-3 justify-end">
                  {isLocked && hasAdminOverride && (
                    <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200 shadow-2xs">
                      Admin Override
                    </span>
                  )}
                  {meeting.forceApproved && (
                    <span
                      className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 border border-amber-300 shadow-2xs"
                      title={meeting.bypassReason || "Approved with force submit override"}
                    >
                      Force Approved
                    </span>
                  )}
                  <PriorityBadge priority={meeting.priority} />
                  {meeting.status === "APPROVED" && !hasAdminOverride ? (
                    <div
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border ${STATUS_CONFIG.APPROVED.bg} ${STATUS_CONFIG.APPROVED.border} shadow-2xs`}
                      title="Meeting approved & certified (Read-only)"
                    >
                      <span className={`h-2 w-2 rounded-full shrink-0 ${STATUS_CONFIG.APPROVED.dot}`} />
                      <span>Approved</span>
                      <Lock size={11} className="text-inherit opacity-70 ml-0.5" />
                    </div>
                  ) : canManage || hasAdminOverride ? (
                    <div
                      className={`group relative inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border transition-all ${STATUS_CONFIG[meeting.status]?.bg || "bg-slate2-100 text-slate2-700"
                        } ${STATUS_CONFIG[meeting.status]?.border || "border-slate2-200"
                        } ${isLocked && !hasAdminOverride
                          ? "opacity-75 cursor-not-allowed"
                          : "cursor-pointer hover:shadow-xs shadow-2xs"
                        }`}
                    >
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 ${STATUS_CONFIG[meeting.status]?.dot || "bg-slate2-400"
                          }`}
                      />
                      <select
                        value={meeting.status}
                        onChange={(e) => updateStatus(e.target.value as MeetingStatus)}
                        disabled={isLocked && !hasAdminOverride}
                        title={
                          isLocked && !hasAdminOverride
                            ? "Meeting is locked. Only users with the ADMIN_OVERRIDE permission can alter status."
                            : "Click to change status"
                        }
                        className="bg-transparent text-inherit font-semibold text-xs border-0 outline-none p-0 pr-4 cursor-pointer disabled:cursor-not-allowed appearance-none focus:ring-0 select-none"
                      >
                        {(meeting.status === "APPROVED" ? ["APPROVED", ...STATUS_DROPDOWN_OPTIONS] : STATUS_DROPDOWN_OPTIONS).map((s) => (
                          <option
                            key={s}
                            value={s}
                            disabled={s === "COMPLETED" && !canCompleteMeeting}
                            className="bg-white text-slate2-800 font-medium py-1 disabled:text-slate2-400"
                          >
                            {s.replace("_", " ")}
                            {s === "COMPLETED" && !canCompleteMeeting ? " (Content Required)" : ""}
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
          </div>

          {/* Location & Online Links */}
          {(meeting.location || meeting.onlineLink || (meeting.participants && meeting.participants.length > 0)) && (
            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              {meeting.location && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate2-50 px-2.5 py-1 text-slate2-700 border border-slate2-200/80 font-medium">
                  <MapPin size={13} className="text-slate2-500" />
                  <span>{meeting.location}</span>
                </span>
              )}
              {meeting.onlineLink && (
                <a
                  href={meeting.onlineLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand/5 px-2.5 py-1 text-brand border border-brand/20 hover:bg-brand/10 transition-colors font-medium"
                >
                  <Video size={13} />
                  <span>Join online</span>
                </a>
              )}
              {meeting.participants && meeting.participants.length > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate2-50 px-2.5 py-1 text-slate2-600 border border-slate2-200/80">
                  <Users size={13} className="text-slate2-400" />
                  <span>
                    {meeting.participants.length}{" "}
                    {meeting.participants.length === 1 ? "participant" : "participants"}
                  </span>
                </span>
              )}
            </div>
          )}

          {/* Bottom Bar: Organizer on Left, Time/Date schedule on Right Bottom Corner */}
          <div className="border-t border-slate2-100 pt-3.5 mt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {/* Bottom Left: Organizer Info */}
            <div className="flex items-center gap-2.5 text-xs text-slate2-600">
              {/* <Avatar
                name={meeting.organizer.name}
                color={meeting.organizer.avatarColor}
              /> */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-slate2-500">Organized by</span>
                <span className="font-semibold text-slate2-800">
                  {meeting.organizer.name}
                </span>
                <span className="text-slate2-400">·</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate2-100 text-slate2-700 font-medium text-[11px]">
                  {meeting.department.name}
                </span>
              </div>
            </div>

            {/* Bottom Right Corner: Date & Time schedule */}
            <div className="flex items-center gap-2.5 self-start sm:self-auto rounded-xl bg-slate2-50 border border-slate2-200/80 px-3.5 py-1.5 text-xs text-slate2-700 shadow-2xs">
              <CodeChip>{meeting.code}</CodeChip>

              <div className="flex items-center gap-1.5 font-medium text-slate2-700">
                <CalendarDays size={14} className="text-brand" />
                <span>
                  {new Date(meeting.date).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
              <span className="h-3.5 w-px bg-slate2-200" />
              <div className="flex items-center gap-1.5 font-semibold text-slate2-900">
                <Clock size={14} className="text-brand" />
                <span>
                  {meeting.startTime} – {meeting.endTime}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Card>



      {/* Read-Only Notification Banner for Approved / Cancelled / Completed */}
      {isLocked && meeting.status !== "PENDING_SIGNATURES" && meeting.status !== "READY_FOR_APPROVAL" && (
        <div
          className={`rounded-xl border p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${meeting.status === "APPROVED"
            ? "bg-brand/5 border-brand/20 text-brand-dark"
            : meeting.status === "CANCELLED"
              ? "bg-rose-50/80 border-rose-200 text-rose-950"
              : "bg-slate-50 border-slate-200 text-slate-900"
            }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`mt-0.5 rounded-lg p-2 ${meeting.status === "APPROVED"
                ? "bg-brand/10 text-brand"
                : meeting.status === "CANCELLED"
                  ? "bg-rose-100 text-rose-700"
                  : "bg-slate-200 text-slate-700"
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
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">
                  Meeting {meeting.status === "APPROVED" ? "Approved" : meeting.status === "CANCELLED" ? "Cancelled" : "Completed"} — {meeting.status === "COMPLETED" ? "Action Items Active" : "Read-Only Mode"}
                </span>
                <span className="rounded-full bg-white/80 border border-current px-2 py-0.5 text-[10px] font-bold tracking-wider">
                  {meeting.status === "COMPLETED" ? "COMPLETED" : "LOCKED"}
                </span>
                {hasAdminOverride && (
                  <span className="rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                    Admin Override Active
                  </span>
                )}
              </div>
              <div className="mt-1 text-xs text-slate2-600 space-y-0.5">
                <p>
                  {meeting.status === "APPROVED"
                    ? "This meeting has been officially approved & certified. All documents, decisions, attendance records, and minutes are strictly locked in Read-Only mode for all users. Users with the ADMIN_OVERRIDE permission can unlock this meeting using the button above to reopen it for modification."
                    : meeting.status === "CANCELLED"
                      ? "This meeting was cancelled. All records, including action item status, are locked from editing."
                      : "This meeting has been completed. Meeting records are archived; action items run independently and their status can be updated."}
                </p>
                {meeting.status === "APPROVED" && meeting.approvedBy && meeting.approvedAt && (
                  <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-brand/15 mt-2">
                    <p className="font-medium text-brand flex items-center gap-1.5 pt-0.5">
                      <CheckCircle2 size={13} className="text-brand shrink-0" />
                      Approved by {meeting.approvedBy.name} on {new Date(meeting.approvedAt).toLocaleString()}
                    </p>
                    {meeting.approvalSignature && (
                      <div className="flex items-center gap-2 rounded-lg bg-white/95 border border-brand/20 px-3 py-1 shadow-2xs self-start sm:self-auto">
                        <span className="text-[10px] font-semibold text-slate2-500 uppercase tracking-wider">
                          Reviewer Signature:
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

      {/* Participant RSVP Banner for Invited Users */}
      {myParticipant && meeting.status !== "CANCELLED" && (
        <div className="rounded-2xl border border-slate2-200/90 bg-white p-4 sm:p-5 shadow-xs transition-all">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5 min-w-0">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                  myParticipant.status === "ACCEPTED"
                    ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                    : myParticipant.status === "REJECTED" || myParticipant.status === "DECLINED"
                    ? "bg-rose-50 text-rose-600 border-rose-200"
                    : "bg-amber-50 text-amber-600 border-amber-200"
                }`}
              >
                {myParticipant.status === "ACCEPTED" ? (
                  <CheckCircle2 size={20} />
                ) : myParticipant.status === "REJECTED" || myParticipant.status === "DECLINED" ? (
                  <XCircle size={20} />
                ) : (
                  <Clock size={20} />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm text-slate2-900">
                    Meeting Invitation
                  </span>
                  {myParticipant.status === "ACCEPTED" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold">
                      <CheckCircle2 size={12} className="text-emerald-600" />
                      <span>(Accepted)</span>
                    </span>
                  ) : myParticipant.status === "REJECTED" || myParticipant.status === "DECLINED" ? (
                    <div className="inline-flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 text-rose-800 border border-rose-200 px-2.5 py-0.5 text-xs font-semibold">
                        <XCircle size={12} className="text-rose-600" />
                        <span>(Rejected)</span>
                      </span>
                      {myParticipant.rejectionReason && (
                        <span className="text-xs text-rose-700 font-medium">
                          ➜ &lsquo;{myParticipant.rejectionReason}&rsquo;
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-0.5 text-xs font-medium">
                      <Clock size={11} className="text-amber-600" />
                      <span>(Awaiting Response)</span>
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate2-500 mt-0.5">
                  {myParticipant.status === "ACCEPTED"
                    ? "You confirmed that you will attend this meeting."
                    : myParticipant.status === "REJECTED" || myParticipant.status === "DECLINED"
                    ? `You declined this invitation.${
                        myParticipant.rejectionReason ? ` Reason: '${myParticipant.rejectionReason}'` : ""
                      }`
                    : "You are invited to this meeting. Please respond to let the organizer know if you can attend."}
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
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3.5 py-2 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                  >
                    {isSubmittingRsvp ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={14} />
                    )}
                    <span>Accept (Will Attend)</span>
                  </button>
                  <button
                    type="button"
                    disabled={isSubmittingRsvp}
                    onClick={() => setIsDeclineModalOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 text-rose-700 px-3.5 py-2 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                  >
                    <XCircle size={14} />
                    <span>Decline / Reject</span>
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  {myParticipant.status === "ACCEPTED" ? (
                    <button
                      type="button"
                      disabled={isSubmittingRsvp}
                      onClick={() => setIsDeclineModalOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate2-200 bg-white hover:bg-slate2-50 text-slate2-700 px-3 py-1.5 text-xs font-medium shadow-2xs transition-colors cursor-pointer"
                    >
                      <span>Change to Decline</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isSubmittingRsvp}
                      onClick={() => handleRsvp("ACCEPTED")}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 px-3 py-1.5 text-xs font-medium shadow-2xs transition-colors cursor-pointer"
                    >
                      <CheckCircle2 size={13} className="text-emerald-600" />
                      <span>Change to Accepted</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-slate2-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`focus-ring flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${tab === t.key
              ? "border-brand text-brand"
              : "border-transparent text-slate2-500 hover:text-slate2-700"
              }`}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <OverviewTab meeting={meeting} onNavigateTab={setTab} />
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
                    className={`rounded-full px-2.5 py-1 text-xs font-medium border transition-colors cursor-pointer ${
                      declineReason === chip
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
          onClose={unlocking ? () => {} : () => setIsUnlockModalOpen(false)}
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
                  <><Loader2 size={13} className="animate-spin" /> Unlocking...</>
                ) : (
                  <><Unlock size={14} /> Confirm Unlock & Reopen</>
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
  const totalParticipants = meeting.participants.length;
  const acceptedCount = meeting.participants.filter(
    (p) => p.status === "ACCEPTED",
  ).length;
  const rejectedCount = meeting.participants.filter(
    (p) => p.status === "REJECTED" || p.status === "DECLINED",
  ).length;
  const awaitingCount = meeting.participants.filter(
    (p) =>
      p.status !== "ACCEPTED" &&
      p.status !== "REJECTED" &&
      p.status !== "DECLINED",
  ).length;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="p-4 text-center">
        <p className="font-display text-2xl font-semibold text-slate2-800">
          {meeting.agendaItems.length}
        </p>
        <p className="text-xs text-slate2-500">Agenda items</p>
      </Card>
      <Card className="p-4 text-center">
        <p className="font-display text-2xl font-semibold text-slate2-800">
          {meeting.decisions.length}
        </p>
        <p className="text-xs text-slate2-500">Decisions logged</p>
      </Card>
      <Card className="p-4 text-center">
        <p className="font-display text-2xl font-semibold text-slate2-800">
          {meeting.actionItems.length}
        </p>
        <p className="text-xs text-slate2-500">Action items</p>
      </Card>

      {/* View for Meeting Organizer: Participant Invitations & RSVP Breakdown */}
      <Card className="p-5 lg:col-span-3">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate2-100">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-brand" />
            <h4 className="text-sm font-bold text-slate2-900">
              Participant Invitation Status
            </h4>
          </div>
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold">
              <CheckCircle2 size={12} className="text-emerald-600" />
              {acceptedCount} Accepted
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 text-rose-800 border border-rose-200 px-2.5 py-0.5 text-xs font-semibold">
              <XCircle size={12} className="text-rose-600" />
              {rejectedCount} Rejected
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-0.5 text-xs font-medium">
              <Clock size={11} className="text-amber-600" />
              {awaitingCount} Awaiting
            </span>
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab("participants")}
                className="text-xs text-brand hover:underline font-semibold ml-2 cursor-pointer"
              >
                View all in Participants Tab →
              </button>
            )}
          </div>
        </div>

        {meeting.participants.length === 0 ? (
          <p className="py-4 text-xs text-slate2-400 text-center">
            No participants invited yet.
          </p>
        ) : (
          <div className="divide-y divide-slate2-100 mt-2">
            {meeting.participants.map((p) => (
              <div
                key={p.id}
                className="py-2.5 flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: p.user.avatarColor || "#0b2545" }}
                  />
                  <span className="text-xs font-semibold text-slate2-900 truncate">
                    {p.user.name}
                  </span>
                  <span className="text-xs text-slate2-400 truncate hidden sm:inline">
                    {p.user.email}
                  </span>
                </div>

                <div className="shrink-0">
                  {p.status === "ACCEPTED" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold">
                      <CheckCircle2 size={12} className="text-emerald-600" />
                      <span>(Accepted)</span>
                    </span>
                  ) : p.status === "REJECTED" || p.status === "DECLINED" ? (
                    <div className="inline-flex items-center gap-1.5 flex-wrap justify-end">
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 text-rose-800 border border-rose-200 px-2.5 py-0.5 text-xs font-semibold">
                        <XCircle size={12} className="text-rose-600" />
                        <span>(Rejected)</span>
                      </span>
                      {p.rejectionReason && (
                        <span className="text-xs text-rose-700 font-medium">
                          ➜ &lsquo;{p.rejectionReason}&rsquo;
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-0.5 text-xs font-medium">
                      <Clock size={11} className="text-amber-600" />
                      <span>(Awaiting Response)</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5 lg:col-span-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate2-400">
          Workflow
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {[
            "Meeting",
            "Agenda",
            "Discussion",
            "Minutes",
            "Decision",
            "Action Item",
            "Responsible Person",
            "Deadline",
            "Follow-up",
            "Completion",
          ].map((step, i, arr) => (
            <React.Fragment key={step}>
              <span className="rounded-full bg-slate2-100 px-2.5 py-1 font-medium text-slate2-600">
                {step}
              </span>
              {i < arr.length - 1 && <span className="text-slate2-400 select-none font-normal">→</span>}
            </React.Fragment>
          ))}
        </div>
      </Card>
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

  return (
    <Card>
      <CardHeader title="Agenda" subtitle="Topics for discussion, in order" />
      <div className="divide-y divide-slate2-100">
        {meeting.agendaItems.length === 0 ? (
          <EmptyState
            title="No agenda items yet"
            description="Add the first topic for this meeting below."
          />
        ) : (
          meeting.agendaItems.map((a, idx) => {
            const isEditing = editingId === a.id;
            const itemPresenterOptions =
              a.presenter && !presenterOptions.includes(a.presenter)
                ? [a.presenter, ...presenterOptions]
                : presenterOptions;

            if (isEditing) {
              return (
                <div key={a.id} className="bg-slate2-50/70 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-brand">
                      Edit Agenda Item #{idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="text-slate2-400 hover:text-slate2-600"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                    <div className="sm:col-span-6">
                      <label className="mb-1 block text-xs font-medium text-slate2-600">
                        Agenda item title <span className="text-danger">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder="Agenda item title"
                        className={inputClass}
                      />
                    </div>

                    <div className="sm:col-span-4">
                      <label className="mb-1 block text-xs font-medium text-slate2-600">
                        Presenter (Optional)
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

                  {/* WIDER INPUT: Agenda Item Description full width on desktop and mobile */}
                  <div className="w-full">
                    <label className="mb-1 block text-xs font-medium text-slate2-600">
                      Agenda Item Description
                    </label>
                    <textarea
                      rows={3}
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Enter full agenda item description, discussion objectives, or background context..."
                      className={`${inputClass} min-h-[76px] w-full resize-y text-slate2-800 bg-white leading-relaxed placeholder:text-slate2-400`}
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-medium text-slate2-600">Status:</label>
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value as AgendaStatus)}
                        className="rounded-lg border border-slate2-200 bg-white px-2.5 py-1 text-xs text-slate2-700 focus-ring"
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
                      >
                        <X size={14} /> Cancel
                      </Button>
                      <Button
                        type="button"
                        onClick={() => saveEdit(a.id)}
                        disabled={updating || !editTitle.trim()}
                      >
                        <Check size={14} /> {updating ? "Saving..." : "Save changes"}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={a.id}
                className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate2-100 text-xs font-semibold text-slate2-500 mt-0.5">
                    {idx + 1}
                  </span>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate2-800">
                      {a.title}
                    </p>

                    {/* Display saved description */}
                    {a.description && (
                      <p className="text-xs leading-relaxed text-slate2-600 whitespace-pre-wrap">
                        {a.description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate2-500 pt-0.5">
                      {a.presenter ? (
                        <span className="inline-flex items-center gap-1 rounded bg-slate2-100 px-2 py-0.5 font-medium text-slate2-700">
                          Presenter: {a.presenter}
                        </span>
                      ) : (
                        <span className="text-slate2-400 italic">No presenter assigned</span>
                      )}
                      <span>·</span>
                      <span className="text-slate2-500">{a.durationMin} min</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <span className="rounded-full bg-slate2-100 px-2.5 py-0.5 text-[11px] font-medium text-slate2-600 uppercase">
                    {a.status.replace("_", " ")}
                  </span>
                  {canManage && (
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        type="button"
                        onClick={() => startEdit(a)}
                        className="rounded-md p-1.5 text-slate2-400 hover:bg-slate2-100 hover:text-slate2-700 transition-colors"
                        title="Edit agenda topic"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteItem(a.id)}
                        className="rounded-md p-1.5 text-slate2-400 hover:bg-red-50 hover:text-danger transition-colors"
                        title="Delete agenda topic"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {canManage && (
        <form
          onSubmit={addItem}
          className="border-t border-slate2-100 bg-slate2-50/40 p-5 space-y-3"
        >
          <p className="text-xs font-semibold text-slate2-700">Add Agenda Topic</p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
            <div className="sm:col-span-6">
              <label className="mb-1 block text-xs font-medium text-slate2-600">
                Agenda item title <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Q3 Fleet Maintenance & Fuel Optimization"
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

          {/* WIDER INPUT: Agenda Item Description full width on desktop and mobile */}
          <div className="w-full">
            <label className="mb-1 block text-xs font-medium text-slate2-600">
              Agenda Item Description
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter full agenda item description, discussion objectives, or topics to cover..."
              className={`${inputClass} min-h-[76px] w-full resize-y text-slate2-800 bg-white leading-relaxed placeholder:text-slate2-400`}
            />
          </div>

          <div className="flex justify-end pt-1">
            <Button type="submit" disabled={submitting || !title.trim()}>
              <Plus size={14} /> Add Agenda Item
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
  const isReadOnly =
    isCompleted ||
    isCancelled ||
    isApproved ||
    isPendingSignatures ||
    isReadyForApproval ||
    !canManage;

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
                <Clock size={22} className="animate-pulse" />
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

      {(meeting.status === "IN_PROGRESS" || meeting.status === "SCHEDULED" || meeting.status === "COMPLETED") && canManage && summaryMinute?.content && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-brand/20 bg-brand/5 px-4 py-3 text-xs">
          <div className="flex items-center gap-2.5 text-brand-dark">
            <Signature size={18} className="text-brand shrink-0" />
            <span>
              <strong>Minutes Drafting:</strong> Meeting summary recorded. When finalized, request digital signatures from all participants.
            </span>
          </div>
          <Button
            variant="secondary"
            type="button"
            onClick={onRequestSignaturesClick}
            disabled={requestingSignatures}
            className="border-brand/30 text-brand hover:bg-brand/10 text-xs py-1.5 px-3 shrink-0 inline-flex items-center gap-1.5 font-medium bg-white disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Signature size={13} /> {requestingSignatures ? "Requesting Signatures..." : "Request Participant Signatures"}
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
                    className={`rounded-xl border p-3.5 transition-all flex flex-col justify-between ${
                      sig
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

  return (
    <Card>
      <CardHeader
        title="Decisions"
        subtitle="Formal outcomes reached in this meeting"
      />
      {meeting.status === "APPROVED" && (
        <div className="mx-5 mb-3 rounded-xl border border-slate2-200 bg-slate2-50/90 p-3.5 shadow-2xs">
          <div className="flex items-start gap-2.5">
            <Lock size={18} className="text-slate2-500 mt-0.5 shrink-0" />
            <div>
              <h4 className="text-xs font-bold text-slate2-800 uppercase tracking-wider">
                Decisions Officially Certified & Locked (Read-Only)
              </h4>
              <p className="mt-0.5 text-xs text-slate2-600 leading-relaxed">
                This meeting has been officially approved and certified. In accordance with compliance and governance rules, all decisions are permanently locked in Read-Only mode. An authorized administrator with ADMIN_OVERRIDE permission must unlock the meeting before decisions can be modified.
              </p>
            </div>
          </div>
        </div>
      )}
      <div className="divide-y divide-slate2-100">
        {meeting.decisions.length === 0 ? (
          <EmptyState
            title="No decisions logged yet"
            description="Record decisions here so they can be tracked to completion."
          />
        ) : (
          meeting.decisions.map((d) => {
            const isEditing = editingId === d.id;

            if (isEditing) {
              return (
                <div key={d.id} className="bg-slate2-50/70 p-5 space-y-4">
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
                    <div className="rounded-lg bg-red-50 p-2 text-xs text-danger flex items-center gap-1.5">
                      <AlertCircle size={14} />
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                    <div className="sm:col-span-8">
                      <label className="mb-1 block text-xs font-medium text-slate2-600">
                        Decision title <span className="text-danger">*</span>
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
                      Details / Background (Optional)
                    </label>
                    <textarea
                      rows={3}
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Enter decision details, rationale, or context..."
                      className={`${inputClass} min-h-[76px] w-full resize-y text-slate2-800 bg-white leading-relaxed`}
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={cancelEdit}
                      disabled={updating}
                    >
                      <X size={14} /> Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={() => saveEdit(d.id)}
                      disabled={updating || !editTitle.trim()}
                    >
                      <Check size={14} /> {updating ? "Saving..." : "Save changes"}
                    </Button>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={d.id}
                className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate2-800">
                      {d.title}
                    </p>
                    <CodeChip>{d.code}</CodeChip>
                  </div>
                  {d.description && (
                    <p className="text-xs leading-relaxed text-slate2-600 whitespace-pre-wrap">
                      {d.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  {canManage ? (
                    <select
                      value={d.status}
                      onChange={(e) => quickUpdateStatus(d.id, e.target.value as DecisionStatus)}
                      className="rounded-lg border border-slate2-200 bg-white px-2 py-1 text-xs font-semibold text-slate2-700 shadow-2xs focus-ring cursor-pointer hover:border-slate2-300"
                      title="Update decision status"
                    >
                      <option value="OPEN">OPEN</option>
                      <option value="IMPLEMENTED">IMPLEMENTED</option>
                      <option value="REVERSED">REVERSED</option>
                    </select>
                  ) : (
                    <StatusBadge status={d.status} />
                  )}

                  {canManage && (
                    <div className="flex items-center gap-1 ml-1">
                      <button
                        type="button"
                        onClick={() => startEdit(d)}
                        className="rounded-md p-1.5 text-slate2-400 hover:bg-slate2-100 hover:text-slate2-700 transition-colors"
                        title="Edit decision"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteDecision(d.id, d.code)}
                        disabled={deletingId === d.id}
                        className="rounded-md p-1.5 text-slate2-400 hover:bg-red-50 hover:text-danger transition-colors disabled:opacity-50"
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
      {canManage && (
        <form
          onSubmit={submit}
          className="space-y-2 border-t border-slate2-100 p-4"
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Decision title"
            className={inputClass}
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Details (optional)"
            className={inputClass}
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={submitting}>
              <Gavel size={14} /> Log decision
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
  // Any locked or cancelled meeting locks action item creation, editing task details, and deletion unless ADMIN_OVERRIDE
  const isActionItemsLocked = (isLocked && !hasPermission("ADMIN_OVERRIDE")) || isMeetingCancelled;

  // Check if current user can update status / edit for a specific action item
  const canUpdateItem = (item: (typeof meeting.actionItems)[number]) => {
    if (isMeetingCancelled) return false;
    if (hasPermission("ADMIN_OVERRIDE")) return true;
    const assignees = getActionItemAssignees(item);
    if (user && assignees.some((u) => u.id === user.id)) return true;
    if (user && item.assignedTo && user.id === item.assignedTo.id) return true;
    if (user && user.id === meeting.organizer?.id) return true;
    if (hasPermission("action_items:edit:all") || hasPermission("meetings:edit:all")) return true;
    if (
      (hasPermission("action_items:edit:dept") || hasPermission("meetings:edit:dept")) &&
      user?.department?.id === meeting.department?.id
    ) {
      return true;
    }
    return false;
  };

  const canDeleteItem = (item: (typeof meeting.actionItems)[number]) => {
    if (isActionItemsLocked) return false;
    if (isMeetingCancelled) return false;
    if (hasPermission("ADMIN_OVERRIDE")) return true;
    if (user && user.id === meeting.organizer?.id) return true;
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
    meeting.actionItems.forEach((item) => {
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
    return meeting.actionItems.filter((i) => {
      const assignees = getActionItemAssignees(i);
      return assignees.some((u) => u.id === user.id);
    }).length;
  }, [meeting.actionItems, user]);

  // Filtered action items based on active assignee tab
  const displayedActionItems = useMemo(() => {
    if (assigneeFilter === "ALL") return meeting.actionItems;
    if (assigneeFilter === "MINE") {
      if (!user) return meeting.actionItems;
      return meeting.actionItems.filter((i) =>
        getActionItemAssignees(i).some((u) => u.id === user.id)
      );
    }
    return meeting.actionItems.filter((i) =>
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

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            Action Items
            {isActionItemsLocked && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate2-100 text-slate2-500 border border-slate2-200 px-2.5 py-0.5 text-xs font-semibold">
                <Lock size={11} />
                View Only
              </span>
            )}
          </span>
        }
        subtitle="Manage single or multiple task assignments across team members"
        action={
          canCreate && !isActionItemsLocked && (
            <div className="flex items-center gap-1.5 bg-slate2-100 p-0.5 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setCreationMode("SINGLE")}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                  creationMode === "SINGLE"
                    ? "bg-white text-brand shadow-2xs"
                    : "text-slate2-600 hover:text-slate2-900"
                }`}
              >
                Standard Task
              </button>
              <button
                type="button"
                onClick={() => setCreationMode("BATCH")}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                  creationMode === "BATCH"
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

      {/* Assignee Filter Tabs Bar (Instant visibility for multiple actions per user) */}
      {meeting.actionItems.length > 0 && (
        <div className="flex items-center gap-1.5 px-5 py-2.5 bg-slate2-50/70 border-b border-slate2-100 overflow-x-auto text-xs">
          <span className="font-semibold text-slate2-500 text-[11px] uppercase tracking-wider mr-1 shrink-0">
            Filter:
          </span>
          <button
            type="button"
            onClick={() => setAssigneeFilter("ALL")}
            className={`px-2.5 py-1 rounded-full font-medium transition-all shrink-0 cursor-pointer ${
              assigneeFilter === "ALL"
                ? "bg-[#005f56] text-white shadow-2xs"
                : "bg-white text-slate2-700 hover:bg-slate2-100 border border-slate2-200"
            }`}
          >
            All Tasks ({meeting.actionItems.length})
          </button>

          {user && myTasksCount > 0 && (
            <button
              type="button"
              onClick={() => setAssigneeFilter("MINE")}
              className={`px-2.5 py-1 rounded-full font-medium transition-all shrink-0 cursor-pointer ${
                assigneeFilter === "MINE"
                  ? "bg-[#005f56] text-white shadow-2xs"
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
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium transition-all shrink-0 cursor-pointer ${
                assigneeFilter === u.id
                  ? "bg-[#005f56] text-white shadow-2xs"
                  : "bg-white text-slate2-700 hover:bg-slate2-100 border border-slate2-200"
              }`}
            >
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: u.avatarColor || "#005f56" }}
              />
              <span>{u.name.split(" ")[0]}</span>
              <span
                className={`text-[10px] font-bold rounded-full px-1.5 py-0.2 ${
                  assigneeFilter === u.id ? "bg-white/20 text-white" : "bg-slate2-100 text-slate2-600"
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
              className="text-[11px] font-semibold text-brand hover:underline shrink-0 ml-2"
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
            title={assigneeFilter !== "ALL" ? "No matching action items" : "No action items yet"}
            description={
              assigneeFilter !== "ALL"
                ? "No tasks assigned to the selected assignee filter."
                : "Turn meeting decisions into tracked tasks with single or multi-user accountability."
            }
          />
        ) : (
          displayedActionItems.map((a) => {
            const assignees = getActionItemAssignees(a);
            const userCanUpdate = canUpdateItem(a);
            const userCanDelete = canDeleteItem(a);

            return (
              <div
                key={a.id}
                className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between hover:bg-slate2-50/50 transition-colors"
              >
                <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                  {/* Avatar stack */}
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
                      <p className="text-sm font-semibold text-slate2-800">
                        {a.title}
                      </p>
                      <CodeChip>{a.code}</CodeChip>
                      <PriorityBadge priority={a.priority} />
                      {a.decisionId && (
                        <span className="rounded bg-teal-50 border border-teal-200 px-1.5 py-0.5 text-[10px] font-semibold text-teal-800">
                          Linked Decision
                        </span>
                      )}
                    </div>
                    {a.description && (
                      <p className="text-xs text-slate2-500 mt-0.5 line-clamp-1">
                        {a.description}
                      </p>
                    )}
                    <p className="text-xs text-slate2-500 truncate max-w-xl mt-1">
                      <span className="text-slate2-400">Assigned: </span>
                      <strong className="text-slate2-700 font-semibold">
                        {assignees.length > 0
                          ? assignees.map((u) => u.name).join(", ")
                          : a.assignedTo?.name || "Unassigned"}
                      </strong>
                      {assignees.length > 1 && (
                        <span className="ml-1.5 text-[10px] font-semibold text-[#005f56] bg-[#e6f4f1] border border-[#c2e7df] px-1.5 py-0.2 rounded-full">
                          {assignees.length} assignees
                        </span>
                      )}
                      {" "}· Due {new Date(a.deadline).toLocaleDateString()}
                      {a.overdue && (
                        <span className="ml-1.5 font-bold text-danger bg-red-50 border border-red-200 px-1.5 py-0.2 rounded text-[10px]">
                          Overdue
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Status & Actions Hub */}
                <div className="flex items-center gap-2.5 sm:w-auto shrink-0 justify-between sm:justify-end">
                  <div className="w-24 sm:w-28 hidden md:block">
                    <div className="flex items-center justify-between text-[10px] text-slate2-500 mb-1">
                      <span>Progress</span>
                      <span className="font-semibold">{a.progressPercent}%</span>
                    </div>
                    <ProgressBar
                      percent={a.progressPercent}
                      tone={
                        a.overdue
                          ? "danger"
                          : a.status === "COMPLETED"
                          ? "success"
                          : "brand"
                      }
                    />
                  </div>

                  <select
                    value={a.status}
                    onChange={(e) => updateStatus(a.id, e.target.value)}
                    disabled={!userCanUpdate}
                    title={
                      isMeetingCancelled
                        ? "Meeting is cancelled. Action items are locked from editing."
                        : !userCanUpdate
                        ? "You do not have permission to update this action item status."
                        : "Change status"
                    }
                    className={`${inputClass} w-auto text-xs py-1 px-2 ${
                      !userCanUpdate ? "opacity-60 cursor-not-allowed bg-slate2-100" : "cursor-pointer"
                    }`}
                  >
                    {["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"].map((s) => (
                      <option key={s} value={s}>
                        {s.replace("_", " ")}
                      </option>
                    ))}
                  </select>

                  {/* Edit button — hidden when meeting is completed or no update permission */}
                  {userCanUpdate && !isActionItemsLocked && (
                    <button
                      type="button"
                      onClick={() => setEditingItem(a)}
                      className="p-1.5 text-slate2-500 hover:text-brand hover:bg-slate2-100 rounded-md transition-colors cursor-pointer"
                      title="Edit action item, assignees & progress"
                    >
                      <Pencil size={14} />
                    </button>
                  )}

                  {/* Delete button */}
                  {userCanDelete && (
                    <button
                      type="button"
                      onClick={() => handleDeleteItem(a)}
                      className="p-1.5 text-slate2-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                      title="Delete action item"
                    >
                      <Trash2 size={14} />
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
          className="space-y-3 border-t border-slate2-100 p-4 bg-slate2-50/40"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
            <div className="sm:col-span-5">
              <label className="block text-[11px] font-semibold text-slate2-600 mb-1">
                Task Description <span className="text-red-500">*</span>
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What needs to be done?"
                className={`${inputClass} w-full`}
              />
            </div>
            <div className="sm:col-span-4">
              <label className="block text-[11px] font-semibold text-slate2-600 mb-1">
                Assign To (One or Multiple) <span className="text-red-500">*</span>
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
              <label className="block text-[11px] font-semibold text-slate2-600 mb-1">
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
          </div>

          {/* Multi-User Assignment Mode Choice (When 2+ users are selected) */}
          {assignedUserIds.length > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#eaf6f4] border border-[#bce4dc] px-3.5 py-2.5 rounded-lg text-xs">
              <div className="flex items-center gap-1.5 text-[#005f56] font-semibold">
                <Users size={15} />
                <span>Multi-User Assignment Mode:</span>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 cursor-pointer font-medium text-slate2-800">
                  <input
                    type="radio"
                    name="assignmentModeSingle"
                    checked={assignmentMode === "SHARED"}
                    onChange={() => setAssignmentMode("SHARED")}
                    className="text-[#005f56] focus:ring-[#005f56]"
                  />
                  <span>
                    👥 Joint Shared Task (1 task for all {assignedUserIds.length} assignees)
                  </span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer font-medium text-slate2-800">
                  <input
                    type="radio"
                    name="assignmentModeSingle"
                    checked={assignmentMode === "INDIVIDUAL"}
                    onChange={() => setAssignmentMode("INDIVIDUAL")}
                    className="text-[#005f56] focus:ring-[#005f56]"
                  />
                  <span>
                    📋 Separate Tasks (Creates {assignedUserIds.length} individual tasks)
                  </span>
                </label>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1">
            <div className="sm:col-span-4">
              <label className="block text-[11px] font-semibold text-slate2-600 mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className={`${inputClass} w-full`}
              >
                <option value="LOW">Low Priority</option>
                <option value="MEDIUM">Medium Priority</option>
                <option value="HIGH">High Priority</option>
                <option value="CRITICAL">Critical Priority</option>
              </select>
            </div>
            {meeting.decisions.length > 0 && (
              <div className="sm:col-span-8">
                <label className="block text-[11px] font-semibold text-slate2-600 mb-1">
                  Link to Decision (Optional)
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
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate2-200/60">
            {/* Left: Keep assignees checkbox for rapid sequential task addition */}
            <label className="flex items-center gap-2 text-xs text-slate2-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={keepAssignees}
                onChange={(e) => setKeepAssignees(e.target.checked)}
                className="rounded border-slate2-300 text-brand focus:ring-brand"
              />
              <span>Keep assignee(s) selected to add multiple tasks</span>
            </label>

            {/* Right: Submit Button */}
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Assigning…
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} />
                  <span>
                    Assign action item{" "}
                    {assignedUserIds.length > 1
                      ? assignmentMode === "INDIVIDUAL"
                        ? `(${assignedUserIds.length} individual tasks)`
                        : `(${assignedUserIds.length} users)`
                      : ""}
                  </span>
                </>
              )}
            </Button>
          </div>
        </form>
      )}

      {/* Creation Form: Batch Mode (Multiple tasks to one user or multiple users) */}
      {canCreate && !isActionItemsLocked && creationMode === "BATCH" && (
        <form
          onSubmit={submitBatch}
          className="space-y-4 border-t border-slate2-100 p-4 bg-teal-50/20"
        >
          <div className="flex items-center justify-between pb-2 border-b border-teal-100">
            <div>
              <h4 className="text-xs font-bold text-slate2-800 uppercase tracking-wide">
                Batch Task Assignment
              </h4>
              <p className="text-[11px] text-slate2-500">
                Assign multiple tasks to one team member or distribute across multiple members at once.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCreationMode("SINGLE")}
              className="text-xs font-semibold text-brand hover:underline"
            >
              Switch to single task
            </button>
          </div>

          {/* Select Assignee(s) for the batch */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-8">
              <label className="block text-[11px] font-semibold text-slate2-600 mb-1">
                Assign All Tasks To <span className="text-red-500">*</span>
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
                <label className="block text-[11px] font-semibold text-slate2-600 mb-1">
                  Link to Decision (Optional)
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
          </div>

          {/* Multi-User choice in Batch */}
          {assignedUserIds.length > 1 && (
            <div className="flex items-center gap-4 bg-[#eaf6f4] border border-[#bce4dc] px-3.5 py-2 rounded-lg text-xs">
              <span className="font-semibold text-[#005f56]">Mode:</span>
              <label className="flex items-center gap-1.5 cursor-pointer text-slate2-800">
                <input
                  type="radio"
                  name="assignmentModeBatch"
                  checked={assignmentMode === "SHARED"}
                  onChange={() => setAssignmentMode("SHARED")}
                  className="text-[#005f56] focus:ring-[#005f56]"
                />
                <span>Joint Shared Tasks (Assignees work together on each task)</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-slate2-800">
                <input
                  type="radio"
                  name="assignmentModeBatch"
                  checked={assignmentMode === "INDIVIDUAL"}
                  onChange={() => setAssignmentMode("INDIVIDUAL")}
                  className="text-[#005f56] focus:ring-[#005f56]"
                />
                <span>Separate Individual Tasks (Each user gets a private copy)</span>
              </label>
            </div>
          )}

          {/* Task rows */}
          <div className="space-y-2">
            <label className="block text-[11px] font-semibold text-slate2-600">
              Action Items ({batchTasks.length})
            </label>
            {batchTasks.map((task, idx) => (
              <div
                key={task.id}
                className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2 bg-white rounded-lg border border-slate2-200 shadow-2xs"
              >
                <span className="text-xs font-bold text-slate2-400 w-5 shrink-0 text-center">
                  #{idx + 1}
                </span>
                <input
                  value={task.title}
                  onChange={(e) => {
                    const next = [...batchTasks];
                    next[idx].title = e.target.value;
                    setBatchTasks(next);
                  }}
                  placeholder={`Task #${idx + 1} description…`}
                  className={`${inputClass} flex-1`}
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
                    className={`${inputClass} w-36 text-xs`}
                  />
                  <select
                    value={task.priority}
                    onChange={(e) => {
                      const next = [...batchTasks];
                      next[idx].priority = e.target.value as Priority;
                      setBatchTasks(next);
                    }}
                    className={`${inputClass} w-24 text-xs`}
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
                      className="p-1.5 text-slate2-400 hover:text-red-500 rounded cursor-pointer"
                      title="Remove task row"
                    >
                      <Trash2 size={13} />
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
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:text-brand-dark py-1 px-2 rounded hover:bg-brand/5 cursor-pointer transition-colors"
            >
              <Plus size={13} /> Add another task row
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate2-200">
            <span className="text-xs text-slate2-500">
              {assignedUserIds.length > 0 ? (
                <span>
                  Ready to assign to{" "}
                  <strong className="text-[#005f56]">
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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.75)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#fff", borderRadius: 12, overflow: "hidden",
        display: "flex", flexDirection: "column",
        width: "92vw", maxWidth: 1100, height: "90vh",
        boxShadow: "0 25px 60px rgba(0,0,0,0.4)",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", borderBottom: "1px solid #e2e8f0",
          background: "#f8fafc", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <FileText size={16} color="#0B7A6B" style={{ flexShrink: 0 }} />
            <span style={{
              fontSize: 14, fontWeight: 600, color: "#1e293b",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{doc.fileName}</span>
            <span style={{ fontSize: 12, color: "#94a3b8", flexShrink: 0 }}>{sizeMB} MB</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <a href={viewUrl} target="_blank" rel="noopener noreferrer" title="Open in new tab"
              style={{
                width: 32, height: 32, display: "inline-flex",
                alignItems: "center", justifyContent: "center",
                borderRadius: 6, border: "1px solid #cbd5e1",
                background: "#fff", cursor: "pointer", textDecoration: "none",
              }}
            >
              <ExternalLink size={14} color="#475569" />
            </a>
            <button type="button" onClick={onDownload} title="Download file"
              style={{
                width: 32, height: 32, display: "inline-flex",
                alignItems: "center", justifyContent: "center",
                borderRadius: 6, border: "1.5px solid #0B7A6B",
                background: "#0B7A6B", cursor: "pointer",
              }}
            >
              <Download size={14} color="#fff" />
            </button>
            <button type="button" onClick={onClose} title="Close (Esc)"
              style={{
                width: 32, height: 32, display: "inline-flex",
                alignItems: "center", justifyContent: "center",
                borderRadius: 6, border: "1px solid #fca5a5",
                background: "#fff", cursor: "pointer",
              }}
            >
              <X size={14} color="#ef4444" />
            </button>
          </div>
        </div>
        {/* Content — always iframe; only invoked for browser-viewable file types */}
        <div style={{ flex: 1, overflow: "hidden", background: "#f1f5f9" }}>
          <iframe
            src={viewUrl}
            title={doc.fileName}
            style={{ width: "100%", height: "100%", border: "none" }}
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
      message: "Are you sure you want to delete this document?",
      tone: "danger",
      confirmLabel: "Delete Document",
      cancelLabel: "Cancel",
    });
    if (!confirmed) return;
    await api.delete(`/meetings/${meeting.id}/documents/${documentId}`);
    onChange();
  };

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
      <Card>
        <CardHeader
          title="Documents"
          subtitle="Upload and manage files attached to this meeting"
        />
        {meeting.status === "APPROVED" && (
          <div className="mx-5 mb-3 rounded-xl border border-slate2-200 bg-slate2-50/90 p-3.5 shadow-2xs">
            <div className="flex items-start gap-2.5">
              <Lock size={18} className="text-slate2-500 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-slate2-800 uppercase tracking-wider">
                  Documents Officially Certified & Locked (Read-Only)
                </h4>
                <p className="mt-0.5 text-xs text-slate2-600 leading-relaxed">
                  This meeting has been officially approved and certified. All meeting documents and attachments are permanently locked in Read-Only mode. An authorized administrator with ADMIN_OVERRIDE permission must unlock the meeting before documents can be added or deleted.
                </p>
              </div>
            </div>
          </div>
        )}
        <div className="divide-y divide-slate2-100">
          {meeting.documents.length === 0 ? (
            <EmptyState
              title="No documents attached"
              description="Upload meeting documents below."
            />
          ) : (
            meeting.documents.map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => handleView(d)}
                    className="truncate text-sm font-medium hover:underline transition-colors cursor-pointer text-left"
                    style={{ color: "#0B7A6B" }}
                    title={`Preview ${d.fileName}`}
                  >
                    {d.fileName}
                  </button>
                  <p className="text-xs text-slate2-400">
                    {d.uploadedBy.name} · {(d.fileSize / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {/* View button — opens inline modal */}
                  <button
                    type="button"
                    onClick={() => handleView(d)}
                    title="Preview file inline"
                    style={{
                      width: 36, height: 36,
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      borderRadius: 8, border: "1.5px solid #cbd5e1",
                      background: "#ffffff", cursor: "pointer", flexShrink: 0,
                      transition: "border-color 0.15s, background 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = "#0B7A6B";
                      (e.currentTarget as HTMLElement).style.background = "#f0faf8";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = "#cbd5e1";
                      (e.currentTarget as HTMLElement).style.background = "#ffffff";
                    }}
                  >
                    <Eye size={16} color="#0B7A6B" />
                  </button>
                  {/* Download / Export button */}
                  <button
                    type="button"
                    onClick={() => download(d.id, d.fileName)}
                    title="Export / Download file"
                    style={{
                      width: 36, height: 36,
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      borderRadius: 8, border: "1.5px solid #0B7A6B",
                      background: "#0B7A6B", cursor: "pointer", flexShrink: 0,
                      transition: "background 0.15s, border-color 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "#095f55";
                      (e.currentTarget as HTMLElement).style.borderColor = "#095f55";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "#0B7A6B";
                      (e.currentTarget as HTMLElement).style.borderColor = "#0B7A6B";
                    }}
                  >
                    <Download size={16} color="#ffffff" />
                  </button>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => remove(d.id)}
                      className="text-xs font-medium text-red-600 hover:text-red-700"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
        {canManage && (
          <form onSubmit={attach} className="border-t border-slate2-100 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="meeting-document-file"
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className={`${inputClass} flex-1`}
              />
              <Button type="submit" disabled={!file || submitting}>
                <Plus size={14} /> {submitting ? "Uploading…" : "Upload"}
              </Button>
            </div>
            <p className="mt-2 text-xs text-slate2-400">Any file type supported</p>
            {error && (
              <p className="mt-2 text-xs font-medium text-red-600">{error}</p>
            )}
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

  // Modifications to participants roster are strictly locked when meeting is locked or cancelled,
  // unless user has ADMIN_OVERRIDE.
  const canEdit = !isApproved && !isCancelled && (!isLocked || hasAdminOverride);
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
  const canEditAttendance = !isCancelled && (!isAttendanceFinalized
    ? meetingEnded && (canManage || hasAdminOverride)
    : hasAdminOverride);

  // If meeting is locked/cancelled and no override, participants roster and editing are locked
  const isParticipantsLocked = !canEdit;

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
    for (const p of meeting.participants) {
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
      const records = meeting.participants.map((p) => ({
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
  const totalParticipants = meeting.participants.length;
  const acceptedCount = meeting.participants.filter(
    (p) => p.status === "ACCEPTED",
  ).length;
  const rejectedCount = meeting.participants.filter(
    (p) => p.status === "REJECTED" || p.status === "DECLINED",
  ).length;
  const awaitingCount = meeting.participants.filter(
    (p) =>
      p.status !== "ACCEPTED" &&
      p.status !== "REJECTED" &&
      p.status !== "DECLINED",
  ).length;
  const attendedCount = meeting.participants.filter(
    (p) => p.participated || p.status === "ATTENDED",
  ).length;
  const attendancePct =
    totalParticipants > 0
      ? Math.round((attendedCount / totalParticipants) * 100)
      : 0;

  const displayedParticipants = useMemo(() => {
    if (rsvpFilter === "ACCEPTED")
      return meeting.participants.filter((p) => p.status === "ACCEPTED");
    if (rsvpFilter === "REJECTED")
      return meeting.participants.filter(
        (p) => p.status === "REJECTED" || p.status === "DECLINED",
      );
    if (rsvpFilter === "AWAITING")
      return meeting.participants.filter(
        (p) =>
          p.status !== "ACCEPTED" &&
          p.status !== "REJECTED" &&
          p.status !== "DECLINED",
      );
    return meeting.participants;
  }, [meeting.participants, rsvpFilter]);

  const invitedIds = new Set(meeting.participants.map((p) => p.user.id));
  const available = users.filter((u) => !invitedIds.has(u.id));

  // Modal stats calculation
  const modalAttendedCount = meeting.participants.filter(
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

      {/* Header matching screenshot: Title, Subtitle, Progress, Finalized Pill, Edit Button */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate2-100 bg-white">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base sm:text-lg font-bold text-slate2-900 leading-tight">
              Participants & Attendance
            </h3>
            {isParticipantsLocked && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate2-100 text-slate2-500 border border-slate2-200 px-2.5 py-0.5 text-xs font-semibold">
                <Lock size={11} />
                View Only
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate2-500 font-medium">
              {totalParticipants} invited
            </span>
            <span className="text-slate2-300">·</span>
            <button
              type="button"
              onClick={() =>
                setRsvpFilter(rsvpFilter === "ACCEPTED" ? "ALL" : "ACCEPTED")
              }
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border transition-all cursor-pointer ${
                rsvpFilter === "ACCEPTED"
                  ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                  : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
              }`}
              title="Click to filter accepted participants"
            >
              <CheckCircle2
                size={11}
                className={
                  rsvpFilter === "ACCEPTED" ? "text-white" : "text-emerald-600"
                }
              />
              <span>{acceptedCount} Accepted</span>
            </button>
            <button
              type="button"
              onClick={() =>
                setRsvpFilter(rsvpFilter === "REJECTED" ? "ALL" : "REJECTED")
              }
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border transition-all cursor-pointer ${
                rsvpFilter === "REJECTED"
                  ? "bg-rose-600 text-white border-rose-600 shadow-2xs"
                  : "bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100"
              }`}
              title="Click to filter rejected participants"
            >
              <XCircle
                size={11}
                className={
                  rsvpFilter === "REJECTED" ? "text-white" : "text-rose-600"
                }
              />
              <span>{rejectedCount} Rejected</span>
            </button>
            {awaitingCount > 0 && (
              <button
                type="button"
                onClick={() =>
                  setRsvpFilter(rsvpFilter === "AWAITING" ? "ALL" : "AWAITING")
                }
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border transition-all cursor-pointer ${
                  rsvpFilter === "AWAITING"
                    ? "bg-amber-600 text-white border-amber-600 shadow-2xs"
                    : "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
                }`}
                title="Click to filter awaiting RSVP participants"
              >
                <Clock
                  size={11}
                  className={
                    rsvpFilter === "AWAITING" ? "text-white" : "text-amber-600"
                  }
                />
                <span>{awaitingCount} Awaiting</span>
              </button>
            )}
            {rsvpFilter !== "ALL" && (
              <button
                type="button"
                onClick={() => setRsvpFilter("ALL")}
                className="text-[11px] text-slate2-500 hover:text-slate2-800 underline font-medium cursor-pointer"
              >
                Reset filter
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate2-600 font-medium">
              Attendance {attendedCount}/{totalParticipants}
            </span>
            <div className="h-1.5 w-20 rounded-full bg-slate2-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-[#0B7A6B] transition-all duration-300"
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
              className="inline-flex items-center gap-1 rounded-full bg-brand/10 text-brand border border-brand/20 px-2.5 py-0.5 text-xs font-semibold hover:bg-brand/20 transition-colors cursor-pointer"
            >
              <CheckCircle2 size={13} /> Finalize
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate2-100 text-slate2-600 px-2.5 py-0.5 text-xs font-medium">
              <Clock size={12} /> {isCancelled ? "Cancelled" : "In Progress"}
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

      {/* Participants List: Every participant on ONE single row */}
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
                : "Add participants below to invite team members and track attendance."
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
                className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-slate2-50/50 transition-colors"
              >
                {/* Left: Avatar + Name + RSVP Badge + Email + Rejection Reason */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold tracking-tight shadow-2xs"
                    style={{ backgroundColor: p.user.avatarColor || "#0b2545" }}
                  >
                    {initials}
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate2-900">
                        {p.user.name}
                      </span>

                      {/* View for the Meeting Organizer: Green Badge (ACCEPTED) & Red Badge and Reason (REJECTED) */}
                      {p.status === "ACCEPTED" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold">
                          <CheckCircle2 size={12} className="text-emerald-600" />
                          <span>(Accepted)</span>
                        </span>
                      ) : p.status === "REJECTED" || p.status === "DECLINED" ? (
                        <div className="inline-flex items-center gap-1.5 flex-wrap">
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 text-rose-800 border border-rose-200 px-2.5 py-0.5 text-xs font-semibold">
                            <XCircle size={12} className="text-rose-600" />
                            <span>(Rejected)</span>
                          </span>
                          {p.rejectionReason && (
                            <span className="text-xs text-rose-700 font-medium">
                              ➜ &lsquo;{p.rejectionReason}&rsquo;
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200/80 px-2.5 py-0.5 text-xs font-medium">
                          <Clock size={11} className="text-amber-600" />
                          <span>(Awaiting Response)</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-0.5 text-xs text-slate2-500">
                      <span className="truncate">{p.user.email}</span>
                      {p.respondedAt && (
                        <span className="text-[11px] text-slate2-400">
                          · Responded {new Date(p.respondedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Organizer RSVP Button + Attended/Absent Toggle + Signature Badge + Delete Action */}
                <div className="flex items-center gap-2.5 shrink-0">
                  {canManage && !isParticipantsLocked && (
                    <button
                      type="button"
                      onClick={() => handleOpenRsvpModal(p)}
                      title="Update participant invitation status"
                      className="inline-flex items-center gap-1 rounded-lg border border-slate2-200 bg-white hover:bg-slate2-50 px-2.5 py-1 text-xs font-semibold text-slate2-700 transition-colors shadow-2xs cursor-pointer"
                    >
                      <ClipboardList size={12} className="text-slate2-500" />
                      <span>Invitation</span>
                    </button>
                  )}
                  {/* Attendance status toggle [ Attended | Absent ] */}
                  <div className="inline-flex items-center rounded-xl bg-slate2-100/90 p-0.5 border border-slate2-200/80">
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
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                        isAttended
                          ? "bg-[#0B7A6B] text-white shadow-2xs"
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
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                        !isAttended
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

                  {/* Digital Signature Status - Icon Only */}
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
                        title="Signature pending"
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

      {/* Add Participant Section: Search/Select + [+ Add] Button */}
      {canManage && !isParticipantsLocked && (
        <div className="flex items-center gap-3 border-t border-slate2-100 p-4">
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
                <Loader2 size={13} className="animate-spin" /> Adding...
              </>
            ) : (
              <>+ Add</>
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
              {meeting.participants.map((p) => {
                const currentStatus =
                  stagedAttendance[p.id] || "NOT ATTENDED";
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 p-3 hover:bg-slate2-50/50"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar
                        name={p.user.name}
                        color={p.user.avatarColor}
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate2-800 truncate">
                          {p.user.name}
                        </p>
                        <p className="text-[11px] text-slate2-400 truncate">
                          {p.user.email}
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
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                    targetStatus === "ACCEPTED"
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
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                    targetStatus === "REJECTED"
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
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                    targetStatus === "INVITED"
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
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors cursor-pointer ${
                        targetReason === chip
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
