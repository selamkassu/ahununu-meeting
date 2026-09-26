import React, { useEffect, useState, useMemo, useRef } from "react";
import { useParams, Link } from "react-router-dom";
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
  ShieldCheck,
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
} from "lucide-react";
import { api, ApiError, getToken } from "../../api/client";
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
} from "../../types";
import { isLockedMeeting } from "../../types";
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
import { MeetingApprovalModal } from "../../components/meetings/MeetingApprovalModal";

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
  "APPROVED",
  "COMPLETED",
  "CANCELLED",
];

export default function MeetingDetail() {
  const { id } = useParams();
  const { user, hasPermission } = useAuth();
  const [meeting, setMeeting] = useState<MeetingDetailType | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");
  const [loading, setLoading] = useState(true);

  const isLocked = isLockedMeeting(meeting?.status);
  const isSuperAdmin = user?.role?.code === "SYSTEM_ADMIN";
  const canEdit = !isLocked || isSuperAdmin;
  const canManage = hasPermission("meetings:edit");
  const isOrganizer = !!(user && meeting && user.id === meeting.organizer.id);
  const canApprove = !!(
    meeting &&
    !["APPROVED", "CANCELLED"].includes(meeting.status) &&
    (isOrganizer || isSuperAdmin || hasPermission("meetings:approve"))
  );

  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);

  const load = () => {
    if (!id) return;
    api
      .get<MeetingDetailType>(`/meetings/${id}`)
      .then(setMeeting)
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const updateStatus = async (status: MeetingStatus) => {
    if (!id) return;
    if (status === "APPROVED") {
      setIsApprovalModalOpen(true);
      return;
    }
    if (isLocked && !isSuperAdmin) {
      alert("This meeting is locked. Only Super Admins can alter status.");
      return;
    }
    try {
      const updated = await api.put<MeetingDetailType>(`/meetings/${id}`, {
        status,
      });
      setMeeting(updated);
    } catch (err: any) {
      alert(err.message || "Failed to update status.");
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

      <Card className="p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl font-semibold text-slate2-800">
                {meeting.title}
              </h2>
              <CodeChip>{meeting.code}</CodeChip>
            </div>
            {meeting.description && (
              <p className="mt-1.5 max-w-2xl text-sm text-slate2-500">
                {meeting.description}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate2-500">
              <span className="flex items-center gap-1.5">
                <CalendarDays size={13} />{" "}
                {new Date(meeting.date).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock size={13} /> {meeting.startTime} – {meeting.endTime}
              </span>
              {meeting.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin size={13} /> {meeting.location}
                </span>
              )}
              {meeting.onlineLink && (
                <a
                  href={meeting.onlineLink}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-brand hover:underline"
                >
                  <Video size={13} /> Join online
                </a>
              )}
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-slate2-500">
              <Avatar
                name={meeting.organizer.name}
                color={meeting.organizer.avatarColor}
              />
              Organized by{" "}
              <span className="font-medium text-slate2-700">
                {meeting.organizer.name}
              </span>{" "}
              · {meeting.department.name}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                type="button"
                onClick={() => printMeetingMinutes({ meeting })}
                className="text-xs py-1.5 px-2.5 inline-flex items-center gap-1.5 bg-white hover:bg-slate2-50"
                title="Print Meeting Minutes (Clean Corporate Letterhead)"
              >
                <Printer size={13} className="text-slate2-600" />
                <span className="hidden sm:inline">Print Minutes</span>
              </Button>
              {canApprove && (
                <Button
                  variant="primary"
                  onClick={() => setIsApprovalModalOpen(true)}
                  className="bg-brand hover:bg-brand-light text-white text-xs py-1.5 px-3 shadow-sm inline-flex items-center gap-1.5"
                >
                  <ShieldCheck size={14} /> Approve Meeting
                </Button>
              )}
              <PriorityBadge priority={meeting.priority} />
              <StatusBadge status={meeting.status} />
            </div>
            {canManage && (
              <div className="flex items-center gap-1.5">
                <select
                  value={meeting.status}
                  onChange={(e) => updateStatus(e.target.value as MeetingStatus)}
                  disabled={isLocked && !isSuperAdmin}
                  title={
                    isLocked && !isSuperAdmin
                      ? "Meeting is locked. Only Super Admins can alter status."
                      : undefined
                  }
                  className={`${inputClass} w-auto text-xs ${
                    isLocked && !isSuperAdmin ? "opacity-60 cursor-not-allowed bg-slate2-100" : ""
                  }`}
                >
                  {MEETING_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      Mark as {s.replace("_", " ")}
                    </option>
                  ))}
                </select>
                {isLocked && isSuperAdmin && (
                  <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 border border-amber-200">
                    Admin Override
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Read-Only Notification Banner */}
      {isLocked && (
        <div
          className={`rounded-xl border p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
            meeting.status === "APPROVED"
              ? "bg-brand/5 border-brand/20 text-brand-dark"
              : meeting.status === "CANCELLED"
              ? "bg-rose-50/80 border-rose-200 text-rose-950"
              : "bg-slate-50 border-slate-200 text-slate-900"
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`mt-0.5 rounded-lg p-2 ${
                meeting.status === "APPROVED"
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
                {isSuperAdmin && (
                  <span className="rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                    Super Admin Override Active
                  </span>
                )}
              </div>
              <div className="mt-1 text-xs text-slate2-600 space-y-0.5">
                <p>
                  {meeting.status === "APPROVED"
                    ? "This meeting has been approved. Participant roster, attendance flags, and agenda are locked from modification."
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
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-slate2-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`focus-ring flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? "border-brand text-brand"
                : "border-transparent text-slate2-500 hover:text-slate2-700"
            }`}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab meeting={meeting} />}
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
          canCreate={canManage && (!isLocked || isSuperAdmin)}
          isSuperAdmin={isSuperAdmin}
          onChange={load}
        />
      )}
      {tab === "participants" && (
        <ParticipantsTab
          meeting={meeting}
          canManage={canManage && canEdit}
          onChange={load}
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
          onApproveApi={async (signature) => {
            return await api.post<MeetingDetailType>(`/meetings/${id}/approve`, { signature });
          }}
        />
      )}
    </div>
  );
}

function OverviewTab({ meeting }: { meeting: MeetingDetailType }) {
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
    if (!window.confirm("Are you sure you want to remove this agenda item?")) return;
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
}: {
  meeting: MeetingDetailType;
  canManage: boolean;
  onChange: () => void;
  canApprove?: boolean;
  onApproveClick?: () => void;
}) {
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Meeting Summary State
  const summaryMinute = useMemo(() => {
    return (meeting.minutes || []).find(
      (m) => m.type === "SUMMARY" || (!m.type && !m.attendeeId)
    );
  }, [meeting.minutes]);

  const isCompleted = meeting.status === "COMPLETED";
  const isCancelled = meeting.status === "CANCELLED";
  const isReadOnly = isCompleted || isCancelled || !canManage;

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

      {/* Reviewer Callout when pending approval */}
      {canApprove && meeting.status !== "APPROVED" && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-brand/20 bg-brand/5 px-4 py-3 text-xs">
          <div className="flex items-center gap-2.5 text-brand-dark">
            <ShieldCheck size={18} className="text-brand shrink-0" />
            <span>
              <strong>Reviewer Notice:</strong> Ready to conclude this meeting? You can approve and sign the minutes.
            </span>
          </div>
          <Button
            variant="primary"
            onClick={onApproveClick}
            className="bg-brand hover:bg-brand-light text-white text-xs py-1.5 px-3 shrink-0 shadow-sm inline-flex items-center gap-1.5"
          >
            <ShieldCheck size={13} /> Approve Meeting
          </Button>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MEETING SUMMARY (SINGLE SECTION ONLY)
          ───────────────────────────────────────────────────────────── */}
      <Card className="overflow-hidden border border-slate2-200/80 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate2-100 bg-slate2-50/50 px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/10 text-brand font-semibold text-xs">
                <FileText size={15} />
              </span>
              <h3 className="text-base font-semibold text-slate2-900">Meeting Summary</h3>
            </div>
            <p className="mt-0.5 text-xs text-slate2-500">
              General overview and key points discussed in this meeting
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Print and Export Minutes Actions */}
            {summaryMinute?.content && !isEditing && (
              <div className="flex items-center gap-1.5 mr-1">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={handlePrintMinutes}
                  id="print-minutes-btn"
                  className="text-xs py-1.5 px-3 inline-flex items-center gap-1.5 h-8 bg-white hover:bg-slate2-50"
                  title="Print Meeting Minutes (Clean Corporate Letterhead)"
                >
                  <Printer size={13} className="text-slate2-600" />
                  <span>Print Minutes</span>
                </Button>

                <div className="relative inline-flex" ref={exportMenuRef}>
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => handleExportMinutes("pdf")}
                    id="export-minutes-btn"
                    className="text-xs py-1.5 px-3 inline-flex items-center gap-1.5 h-8 rounded-r-none border-r-0 bg-white hover:bg-slate2-50"
                    title="Export Meeting Minutes to PDF (.pdf)"
                  >
                    <Download size={13} className="text-slate2-600" />
                    <span>Export</span>
                  </Button>
                  <button
                    type="button"
                    id="export-minutes-options-btn"
                    onClick={() => setExportMenuOpen(!exportMenuOpen)}
                    className="focus-ring inline-flex h-8 items-center rounded-r-lg border border-slate2-200 bg-white px-2 text-slate2-600 hover:bg-slate2-50"
                    title="Export format options"
                    aria-label="Export format options"
                  >
                    <ChevronDown size={13} />
                  </button>

                  {exportMenuOpen && (
                    <div className="absolute right-0 top-full z-30 mt-1 w-56 rounded-lg border border-slate2-200 bg-white py-1 shadow-lg">
                      <button
                        type="button"
                        onClick={() => handleExportMinutes("pdf")}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate2-700 hover:bg-slate2-50"
                      >
                        <FileText size={15} className="text-rose-600" />
                        <span>PDF Document (.pdf)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportMinutes("doc")}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate2-700 hover:bg-slate2-50"
                      >
                        <FileText size={15} className="text-blue-600" />
                        <span>Word Document (.doc)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportMinutes("excel")}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate2-700 hover:bg-slate2-50"
                      >
                        <FileSpreadsheet size={15} className="text-emerald-600" />
                        <span>Excel Summary (.xlsx)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportMinutes("text")}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate2-700 hover:bg-slate2-50"
                      >
                        <FileText size={15} className="text-slate2-500" />
                        <span>Plain Text (.txt)</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
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
            {!isCompleted && !isCancelled && !canManage && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate2-100 px-2.5 py-1 text-xs font-medium text-slate2-600">
                <Lock size={12} /> Read-only View
              </span>
            )}
            {summaryMinute && !isEditing && (
              <span className="text-[11px] text-slate2-400">
                Last recorded by{" "}
                <span className="font-medium text-slate2-700">
                  {summaryMinute.recordedBy?.name || "Organizer"}
                </span>{" "}
                · {new Date(summaryMinute.updatedAt || summaryMinute.createdAt).toLocaleDateString()}
              </span>
            )}
            {!isReadOnly && !isEditing && summaryMinute?.content && (
              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  setIsEditing(true);
                  setSummaryContent(summaryMinute.content);
                }}
                className="text-xs py-1.5 px-3 inline-flex items-center gap-1.5"
              >
                <Pencil size={13} /> Edit Summary
              </Button>
            )}
          </div>
        </div>

        {/* Meeting Summary Body */}
        <div className="p-5">
          {isEditing ? (
            <div className="space-y-4">
              <RichTextEditor
                value={summaryContent}
                onChange={setSummaryContent}
                placeholder="Write a general summary of the meeting..."
                minHeight="260px"
              />
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
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
                    className="text-xs sm:text-sm py-2 px-4"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    type="button"
                    disabled={savingSummary || !summaryContent.trim()}
                    onClick={handleSaveSummary}
                    className="bg-brand hover:bg-brand-light text-white text-xs sm:text-sm py-2 px-5 shadow-sm inline-flex items-center gap-1.5"
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
            <div className="space-y-3">
              <div className="rounded-xl border border-slate2-100 bg-white p-5 shadow-2xs">
                <RichTextRenderer content={summaryMinute.content} />
              </div>
              {!isReadOnly && (
                <div className="flex justify-end pt-1">
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => {
                      setIsEditing(true);
                      setSummaryContent(summaryMinute.content);
                    }}
                    className="text-xs py-1.5 px-3.5 inline-flex items-center gap-1.5"
                  >
                    <Pencil size={13} /> Edit Summary
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate2-200 bg-slate2-50/40 p-8 text-center">
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
                    className="text-xs py-1.5 px-4 bg-brand hover:bg-brand-light text-white inline-flex items-center gap-1.5"
                  >
                    <Plus size={13} /> Write Meeting Summary
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
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
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      await api.post(`/meetings/${meeting.id}/decisions`, {
        title,
        description: description || undefined,
      });
      setTitle("");
      setDescription("");
      onChange();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Decisions"
        subtitle="Formal outcomes reached in this meeting"
      />
      <div className="divide-y divide-slate2-100">
        {meeting.decisions.length === 0 ? (
          <EmptyState
            title="No decisions logged yet"
            description="Record decisions here so they can be tracked to completion."
          />
        ) : (
          meeting.decisions.map((d) => (
            <div
              key={d.id}
              className="flex items-start justify-between gap-3 px-5 py-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-slate2-800">
                    {d.title}
                  </p>
                  <CodeChip>{d.code}</CodeChip>
                </div>
                {d.description && (
                  <p className="mt-1 text-xs text-slate2-500">
                    {d.description}
                  </p>
                )}
              </div>
              <StatusBadge status={d.status} />
            </div>
          ))
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
  isSuperAdmin,
  onChange,
}: {
  meeting: MeetingDetailType;
  canCreate: boolean;
  isSuperAdmin: boolean;
  onChange: () => void;
}) {
  const { user, hasPermission } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [title, setTitle] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [deadline, setDeadline] = useState("");
  const [decisionId, setDecisionId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get<User[]>("/users").then(setUsers);
  }, []);

  const isMeetingCancelled = meeting.status === "CANCELLED";

  // Check if current user can update status for a specific action item
  const canUpdateItemStatus = (item: (typeof meeting.actionItems)[number]) => {
    // If meeting is cancelled, everything is locked, even action item status
    if (isMeetingCancelled) {
      return false;
    }
    // If meeting is completed or active, action items run independently
    return (
      isSuperAdmin ||
      hasPermission("meetings:edit") ||
      hasPermission("action_items:edit") ||
      hasPermission("action_items:update_own") ||
      (user && user.id === item.assignedTo.id) ||
      (user && user.id === meeting.organizer.id)
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !assignedToId || !deadline) return;
    const assignee = users.find((u) => u.id === assignedToId);
    setSubmitting(true);
    try {
      await api.post("/action-items", {
        meetingId: meeting.id,
        decisionId: decisionId || undefined,
        title,
        assignedToId,
        departmentId: assignee?.departmentId,
        deadline,
      });
      setTitle("");
      setAssignedToId("");
      setDeadline("");
      onChange();
    } catch (err: any) {
      alert(err.message || "Failed to create action item.");
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await api.put(`/action-items/${id}`, { status });
      onChange();
    } catch (err: any) {
      alert(err.message || "Failed to update action item status.");
    }
  };

  return (
    <Card>
      <CardHeader
        title="Action Items"
        subtitle="Tasks assigned from this meeting's decisions"
      />
      <div className="divide-y divide-slate2-100">
        {meeting.actionItems.length === 0 ? (
          <EmptyState
            title="No action items yet"
            description="Turn a decision into a tracked task with an owner and deadline."
          />
        ) : (
          meeting.actionItems.map((a) => (
            <div
              key={a.id}
              className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                <Avatar
                  name={a.assignedTo.name}
                  color={a.assignedTo.avatarColor}
                />
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate2-800">
                      {a.title}
                    </p>
                    <CodeChip>{a.code}</CodeChip>
                  </div>
                  <p className="text-xs text-slate2-400">
                    {a.assignedTo.name} · Due{" "}
                    {new Date(a.deadline).toLocaleDateString()}
                    {a.overdue && (
                      <span className="ml-1 font-medium text-danger">
                        · Overdue
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 sm:w-56">
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
                <select
                  value={a.status}
                  onChange={(e) => updateStatus(a.id, e.target.value)}
                  disabled={!canUpdateItemStatus(a)}
                  title={
                    isMeetingCancelled
                      ? "Meeting is cancelled. Action items are locked from editing."
                      : !canUpdateItemStatus(a)
                      ? "You do not have permission to update this action item status."
                      : undefined
                  }
                  className={`${inputClass} w-auto text-xs ${
                    !canUpdateItemStatus(a) ? "opacity-60 cursor-not-allowed bg-slate2-100" : ""
                  }`}
                >
                  {["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"].map(
                    (s) => (
                      <option key={s} value={s}>
                        {s.replace("_", " ")}
                      </option>
                    ),
                  )}
                </select>
              </div>
            </div>
          ))
        )}
      </div>
      {canCreate && (
        <form
          onSubmit={submit}
          className="space-y-2 border-t border-slate2-100 p-4"
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task description"
              className={`${inputClass} sm:col-span-2`}
            />
            <select
              value={assignedToId}
              onChange={(e) => setAssignedToId(e.target.value)}
              className={inputClass}
            >
              <option value="">Assign to…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className={inputClass}
            />
          </div>
          {meeting.decisions.length > 0 && (
            <select
              value={decisionId}
              onChange={(e) => setDecisionId(e.target.value)}
              className={inputClass}
            >
              <option value="">Link to a decision (optional)</option>
              {meeting.decisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} — {d.title}
                </option>
              ))}
            </select>
          )}
          <div className="flex justify-end">
            <Button type="submit" disabled={submitting}>
              <CheckCircle2 size={14} /> Assign action item
            </Button>
          </div>
        </form>
      )}
    </Card>
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
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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
      const response = await fetch(
        `/api/meetings/${meeting.id}/documents/${documentId}/download`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );
      if (!response.ok) throw new Error("Download failed");

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
      setError("Failed to download file");
    }
  };
  const remove = async (documentId: string) => {
    if (!window.confirm("Delete this document?")) return;
    await api.delete(`/meetings/${meeting.id}/documents/${documentId}`);
    onChange();
  };

  return (
    <Card>
      <CardHeader
        title="Documents"
        subtitle="Upload and manage files attached to this meeting"
      />
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
                <p className="truncate text-sm font-medium text-slate2-800">
                  {d.fileName}
                </p>
                <p className="text-xs text-slate2-400">
                  {d.uploadedBy.name} · {(d.fileSize / 1024 / 1024).toFixed(2)}{" "}
                  MB
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  onClick={() => download(d.id, d.fileName)}
                >
                  Download
                </Button>
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
          <p className="mt-2 text-xs text-slate2-400">
            Any file type supported
          </p>
          {error && (
            <p className="mt-2 text-xs font-medium text-red-600">{error}</p>
          )}
        </form>
      )}
    </Card>
  );
}

function ParticipantsTab({
  meeting,
  canManage: propCanManage,
  onChange,
}: {
  meeting: MeetingDetailType;
  canManage?: boolean;
  onChange: () => void;
}) {
  const { user, hasPermission } = useAuth();
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

  // Authorization & Meeting State
  const isSuperAdmin = user?.role?.code === "SYSTEM_ADMIN";
  const isSecretary = user?.role?.code === "MEETING_SECRETARY";
  const isOrganizer = !!(user && meeting && user.id === meeting.organizer.id);
  const canManage =
    isSuperAdmin ||
    isSecretary ||
    isOrganizer ||
    hasPermission("meetings:manage_participants") ||
    hasPermission("meetings:edit") ||
    !!propCanManage;

  const meetingEnded = hasMeetingEnded(meeting);
  const isAttendanceFinalized = !!meeting.attendanceFinalized;
  const canEditAttendance = !isAttendanceFinalized
    ? meetingEnded && canManage
    : isSuperAdmin;

  useEffect(() => {
    api
      .get<User[]>("/users")
      .then(setUsers)
      .catch(() => {});
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
  const attendedCount = meeting.participants.filter(
    (p) => p.participated || p.status === "ATTENDED",
  ).length;
  const attendancePct =
    totalParticipants > 0
      ? Math.round((attendedCount / totalParticipants) * 100)
      : 0;

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
    <Card>
      <Toast
        message={toast?.message || null}
        type={toast?.type}
        onClose={() => setToast(null)}
      />

      <CardHeader
        title="Participants & Attendance"
        subtitle={`${totalParticipants} invited · ${attendedCount} attended (${attendancePct}% attendance)`}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-slate2-500 font-medium">
              Attendance:{" "}
              <strong className="text-brand font-semibold">
                {attendedCount}/{totalParticipants}
              </strong>
            </span>

            {isAttendanceFinalized ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand border border-brand/20 shadow-sm">
                  <CheckCircle2 size={13} className="text-brand" />{" "}
                  Attendance Finalized
                </span>
                {isSuperAdmin && (
                  <Button
                    variant="secondary"
                    onClick={openFinalizeModal}
                    className="text-xs py-1 px-2.5"
                    title="Admin Override: Re-finalize attendance"
                  >
                    <Pencil size={12} /> Edit Finalized
                  </Button>
                )}
              </div>
            ) : meetingEnded ? (
              <Button
                variant="primary"
                onClick={openFinalizeModal}
                disabled={!canManage || isFinalizing}
                className="text-xs py-1.5 px-3"
              >
                <CheckCircle2 size={14} /> Finalize Attendance
              </Button>
            ) : (
              <span
                title={`Attendance can be finalized once the meeting reaches its scheduled end time (${meeting.endTime}).`}
                className="inline-flex items-center gap-1.5 text-xs text-slate2-400 bg-slate2-100 rounded-lg px-2.5 py-1.5 border border-slate2-200"
              >
                <Clock size={13} /> Finalize Attendance (After {meeting.endTime})
              </span>
            )}
          </div>
        }
      />

      <div className="divide-y divide-slate2-100">
        {meeting.participants.length === 0 ? (
          <EmptyState
            title="No participants invited yet"
            description="Add participants below to invite team members and track attendance."
          />
        ) : (
          meeting.participants.map((p) => {
            const isAttended = p.participated || p.status === "ATTENDED";
            return (
              <div
                key={p.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3 hover:bg-slate2-50/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={p.user.name} color={p.user.avatarColor} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate2-800 truncate">
                      {p.user.name}
                    </p>
                    <p className="text-xs text-slate2-400 truncate">
                      {p.user.email}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 self-end sm:self-auto shrink-0">
                  {/* Attendance status options (ATTENDED / NOT ATTENDED) */}
                  <div className="inline-flex items-center rounded-lg bg-slate2-100 p-0.5 border border-slate2-200">
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
                      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                        isAttended
                          ? "bg-brand text-white shadow-sm"
                          : "text-slate2-600 hover:text-slate2-900"
                      } ${!canEditAttendance ? "opacity-80 cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      <CheckCircle2
                        size={12}
                        className={isAttended ? "text-white" : "text-slate2-400"}
                      />
                      <span>ATTENDED</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSingleAttendance(p.id, false)}
                      disabled={!canEditAttendance || togglingId === p.id}
                      title={
                        canEditAttendance
                          ? "Mark as Not Attended"
                          : isAttendanceFinalized
                            ? "Attendance finalized"
                            : `Available after meeting ends at ${meeting.endTime}`
                      }
                      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                        !isAttended
                          ? "bg-slate2-700 text-white shadow-sm"
                          : "text-slate2-500 hover:text-slate2-800"
                      } ${!canEditAttendance ? "opacity-80 cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      <UserX
                        size={12}
                        className={
                          !isAttended ? "text-white" : "text-slate2-400"
                        }
                      />
                      <span>NOT ATTENDED</span>
                    </button>
                  </div>

                  {/* Status Indicator */}
                  <span className="text-[11px] font-medium text-slate2-500 bg-slate2-100 rounded-md px-2 py-0.5">
                    {p.status}
                  </span>

                  {/* Remove Participant Action */}
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => setParticipantToDelete(p)}
                      title="Remove participant"
                      className="rounded-lg p-1.5 text-slate2-400 hover:bg-red-50 hover:text-red-600 transition-colors"
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
      {canManage && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 border-t border-slate2-100 p-4 bg-slate2-50/30">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={addingParticipant}
            className={`${inputClass} flex-1`}
          >
            <option value="">Select a user to invite…</option>
            {available.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} — {u.department?.name || "Ahununu"}
              </option>
            ))}
          </select>
          <Button onClick={add} disabled={!selected || addingParticipant}>
            {addingParticipant ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Adding...
              </>
            ) : (
              <>
                <Plus size={14} /> Add Participant
              </>
            )}
          </Button>
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
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all ${
                          currentStatus === "ATTENDED"
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
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all ${
                          currentStatus === "NOT ATTENDED"
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
    </Card>
  );
}
