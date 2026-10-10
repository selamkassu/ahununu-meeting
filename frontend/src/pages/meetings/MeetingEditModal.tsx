import React, { useState, useMemo } from "react";
import {
  Clock,
  Calendar,
  MapPin,
  Video,
  AlertCircle,
  AlertTriangle,
  Lock,
  Building,
  Tag,
  FileText,
  CheckCircle2,
} from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { Field, inputClass, Button, CodeChip } from "../../components/ui/Primitives";
import { StatusBadge, PriorityBadge } from "../../components/ui/Badge";
import { api, ApiError } from "../../api/client";
import type { Department, Priority, MeetingStatus, MeetingListItem, MeetingDetail } from "../../types";
import { isLockedMeeting } from "../../types";

const PRIORITIES: { value: Priority; label: string; desc: string; color: string }[] = [
  { value: "LOW", label: "Low", desc: "Routine, informational", color: "border-slate2-200 text-slate2-700 hover:border-slate2-300" },
  { value: "MEDIUM", label: "Medium", desc: "Standard committee operations", color: "border-sky-200 text-sky-800 hover:border-sky-300" },
  { value: "HIGH", label: "High", desc: "Urgent decisions & executive matters", color: "border-amber-200 text-amber-900 hover:border-amber-300" },
  { value: "CRITICAL", label: "Critical", desc: "Immediate operational intervention", color: "border-red-200 text-red-800 hover:border-red-300" },
];

/**
 * Format hours and minutes to HH:mm
 */
function formatTimeHHmm(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * Parse HH:mm to minutes from midnight
 */
function timeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Convert minutes from midnight to HH:mm string (clamped to 23:59)
 */
function minutesToTime(totalMins: number): string {
  const clamped = Math.max(0, Math.min(totalMins, 23 * 60 + 59));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return formatTimeHHmm(h, m);
}

/**
 * Helper to safely format a Date string to YYYY-MM-DD for standard date input
 */
function toInputDateString(dateValue: string | Date | undefined): string {
  if (!dateValue) return "";
  if (typeof dateValue === "string") {
    // If already starts with YYYY-MM-DD
    if (dateValue.length >= 10 && dateValue[4] === "-" && dateValue[7] === "-") {
      return dateValue.slice(0, 10);
    }
  }
  const d = new Date(dateValue);
  if (isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

interface MeetingEditModalProps {
  meeting: MeetingListItem | (Partial<MeetingDetail> & { id: string; code: string; title: string; date: string; startTime: string; endTime: string; priority: Priority; status: MeetingStatus; department: { id: string; name: string } });
  departments: Department[];
  onClose: () => void;
  onUpdated: (updatedMeeting: any) => void;
}

export default function MeetingEditModal({
  meeting,
  departments,
  onClose,
  onUpdated,
}: MeetingEditModalProps) {
  const locked = isLockedMeeting(meeting.status);

  // Form State
  const [title, setTitle] = useState(meeting.title || "");
  const [description, setDescription] = useState(meeting.description || "");
  const [date, setDate] = useState(() => toInputDateString(meeting.date));
  const [startTime, setStartTime] = useState(meeting.startTime || "09:00");
  const [endTime, setEndTime] = useState(meeting.endTime || "10:00");
  const [location, setLocation] = useState(meeting.location || "");
  const [onlineLink, setOnlineLink] = useState(meeting.onlineLink || "");
  const [priority, setPriority] = useState<Priority>(meeting.priority || "MEDIUM");
  const [status, setStatus] = useState<MeetingStatus>(meeting.status || "SCHEDULED");
  const [departmentId, setDepartmentId] = useState(
    (meeting as any).departmentId || meeting.department?.id || departments[0]?.id || ""
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Time & Duration Calculations
  const startMins = timeToMinutes(startTime);
  const endMins = timeToMinutes(endTime);
  const isEndTimeBeforeOrEqualStart = endMins <= startMins;
  const durationMins = endMins - startMins;
  const isDurationTooShort = !isEndTimeBeforeOrEqualStart && durationMins < 5;

  const durationLabel = useMemo(() => {
    if (durationMins <= 0) return null;
    const hours = Math.floor(durationMins / 60);
    const mins = durationMins % 60;
    if (hours > 0 && mins > 0) {
      return `${hours} hr ${mins} min (${durationMins} mins)`;
    }
    if (hours > 0) {
      return `${hours} hr${hours > 1 ? "s" : ""} (${durationMins} mins)`;
    }
    return `${mins} mins`;
  }, [durationMins]);

  const timeError = useMemo(() => {
    if (!date) return "Meeting date is required.";
    if (isEndTimeBeforeOrEqualStart) {
      return "End time must be strictly after the start time.";
    }
    if (isDurationTooShort) {
      return "Meeting duration must be at least 5 minutes.";
    }
    return null;
  }, [date, isEndTimeBeforeOrEqualStart, isDurationTooShort]);

  // Quick Duration Setter helper
  const setQuickDuration = (minutes: number) => {
    const newStartMins = timeToMinutes(startTime);
    const newEndMins = Math.min(newStartMins + minutes, 23 * 60 + 59);
    setEndTime(minutesToTime(newEndMins));
  };

  const handleStartTimeChange = (newStartTime: string) => {
    setStartTime(newStartTime);
    const newStartMins = timeToMinutes(newStartTime);
    const currentDuration = endMins > startMins ? endMins - startMins : 60;
    if (endMins <= newStartMins) {
      const newEndMins = Math.min(newStartMins + currentDuration, 23 * 60 + 59);
      setEndTime(minutesToTime(newEndMins));
    }
  };

  // Form Change Detection
  const isPristine = useMemo(() => {
    const origDate = toInputDateString(meeting.date);
    const origDeptId = (meeting as any).departmentId || meeting.department?.id || "";
    return (
      title.trim() === (meeting.title || "").trim() &&
      description.trim() === (meeting.description || "").trim() &&
      date === origDate &&
      startTime === (meeting.startTime || "") &&
      endTime === (meeting.endTime || "") &&
      location.trim() === (meeting.location || "").trim() &&
      onlineLink.trim() === (meeting.onlineLink || "").trim() &&
      priority === meeting.priority &&
      status === meeting.status &&
      departmentId === origDeptId
    );
  }, [
    title,
    description,
    date,
    startTime,
    endTime,
    location,
    onlineLink,
    priority,
    status,
    departmentId,
    meeting,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (locked) {
      setError(
        `This session is currently locked (${meeting.status.replace("_", " ")}). It must be unlocked by an authorized administrator before editing.`
      );
      return;
    }

    if (!title.trim() || title.trim().length < 3) {
      setError("Meeting title must be at least 3 characters long.");
      return;
    }

    if (!departmentId) {
      setError("Please assign a responsible department.");
      return;
    }

    if (timeError) {
      setError(timeError);
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, any> = {
        title: title.trim(),
        description: description.trim() || null,
        date,
        startTime,
        endTime,
        location: location.trim() || null,
        onlineLink: onlineLink.trim() || null,
        priority,
        departmentId,
      };

      // Only include status if it changed, and cannot be APPROVED directly
      if (status !== meeting.status) {
        if (status === "APPROVED") {
          setError("Approved status is only granted via the digital certification approval workflow.");
          setSubmitting(false);
          return;
        }
        payload.status = status;
      }

      const updated = await api.put<any>(`/meetings/${meeting.id}`, payload);
      onUpdated(updated);
      onClose();
    } catch (err: any) {
      setError(
        err instanceof ApiError
          ? err.message
          : err.message || "Failed to update meeting. Please verify all fields."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Edit Meeting Session" wide>
      <div className="space-y-5">
        {/* Signature Ahununu Dossier Identifier Card */}
        <div className="rounded-xl border border-slate2-200/90 bg-slate2-50/70 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <CodeChip>{meeting.code}</CodeChip>
              <span className="text-xs font-semibold text-slate2-800 truncate max-w-[280px]">
                {meeting.title}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <PriorityBadge priority={meeting.priority} />
              <StatusBadge status={meeting.status} />
            </div>
          </div>

          {locked && (
            <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50/90 p-2.5 text-xs text-amber-900">
              <Lock size={15} className="shrink-0 text-amber-700 mt-0.5" />
              <div>
                <p className="font-semibold">Session Record Locked</p>
                <p className="text-amber-800 mt-0.5 leading-relaxed">
                  This meeting is in <span className="font-semibold">{meeting.status.replace("_", " ")}</span> state. To modify official record information, an administrator with ADMIN_OVERRIDE must unlock the session first.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            <AlertCircle size={15} className="shrink-0 mt-0.5 text-red-600" />
            <div className="flex-1">{error}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <Field label="Meeting Title" required error={title.length > 0 && title.length < 3 ? "Minimum 3 characters" : null}>
            <input
              type="text"
              value={title}
              disabled={locked || submitting}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Q4 Logistics Fleet Review & Port Clearance Committee"
              className={`${inputClass} text-xs sm:text-sm`}
              required
            />
          </Field>

          {/* Department & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Responsible Department" required>
              <div className="relative">
                <Building size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate2-400" />
                <select
                  value={departmentId}
                  disabled={locked || submitting}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  className={`${inputClass} pl-8.5 text-xs sm:text-sm bg-white cursor-pointer`}
                  required
                >
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name} ({dept.code})
                    </option>
                  ))}
                </select>
              </div>
            </Field>

            <Field
              label="Session Lifecycle Status"
              hint={locked ? "Record locked" : "Approved status requires formal certification"}
            >
              <select
                value={status}
                disabled={locked || submitting}
                onChange={(e) => setStatus(e.target.value as MeetingStatus)}
                className={`${inputClass} text-xs sm:text-sm bg-white cursor-pointer`}
              >
                <option value="SCHEDULED">Scheduled</option>
                <option value="IN_PROGRESS">In Progress (Active Session)</option>
                <option value="PENDING_SIGNATURES">Pending Signatures</option>
                <option value="CANCELLED">Cancelled</option>
                {locked && (
                  <option value={meeting.status} disabled>
                    {meeting.status.replace("_", " ")} (Locked)
                  </option>
                )}
              </select>
            </Field>
          </div>

          {/* Date & Time Schedule Dossier */}
          <div className="rounded-xl border border-slate2-200/90 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate2-100 pb-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate2-800">
                <Clock size={13} className="text-brand" />
                <span>Schedule & Duration</span>
              </div>
              {durationLabel && !timeError && (
                <span className="inline-flex items-center gap-1 rounded-md bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">
                  <CheckCircle2 size={11} /> {durationLabel}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Meeting Date" required>
                <div className="relative">
                  <Calendar size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate2-400" />
                  <input
                    type="date"
                    value={date}
                    disabled={locked || submitting}
                    onChange={(e) => setDate(e.target.value)}
                    className={`${inputClass} pl-8.5 text-xs sm:text-sm font-mono`}
                    required
                  />
                </div>
              </Field>

              <Field label="Start Time" required>
                <input
                  type="time"
                  value={startTime}
                  disabled={locked || submitting}
                  onChange={(e) => handleStartTimeChange(e.target.value)}
                  className={`${inputClass} text-xs sm:text-sm font-mono`}
                  required
                />
              </Field>

              <Field label="End Time" required>
                <input
                  type="time"
                  value={endTime}
                  disabled={locked || submitting}
                  onChange={(e) => setEndTime(e.target.value)}
                  className={`${inputClass} text-xs sm:text-sm font-mono`}
                  required
                />
              </Field>
            </div>

            {/* Quick duration presets */}
            {!locked && (
              <div className="flex items-center gap-1.5 pt-1">
                <span className="text-[11px] font-medium text-slate2-400 mr-1">Preset Duration:</span>
                {[30, 45, 60, 90, 120].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setQuickDuration(mins)}
                    className={`rounded px-2 py-0.5 text-[11px] font-mono font-medium transition-colors border ${
                      durationMins === mins
                        ? "bg-brand text-white border-brand font-semibold"
                        : "bg-slate2-50 text-slate2-600 hover:bg-slate2-100 border-slate2-200"
                    }`}
                  >
                    {mins >= 60 ? `${mins / 60}h` : `${mins}m`}
                  </button>
                ))}
              </div>
            )}

            {timeError && (
              <div className="flex items-center gap-1.5 text-xs text-danger pt-1">
                <AlertTriangle size={13} className="shrink-0" />
                <span>{timeError}</span>
              </div>
            )}
          </div>

          {/* Priority Matrix Selection */}
          <div>
            <span className="mb-1.5 block text-xs font-medium text-slate2-600">
              Session Priority Classification
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PRIORITIES.map((p) => {
                const isSelected = priority === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    disabled={locked || submitting}
                    onClick={() => setPriority(p.value)}
                    className={`flex flex-col items-start p-2.5 rounded-lg border text-left transition-all ${
                      isSelected
                        ? "border-brand bg-brand/[0.04] ring-1 ring-brand/30 shadow-2xs"
                        : "border-slate2-200 bg-white hover:bg-slate2-50"
                    } ${locked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-bold text-slate2-800">{p.label}</span>
                      {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}
                    </div>
                    <span className="text-[10px] text-slate2-500 mt-1 leading-tight line-clamp-1">
                      {p.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Location & Virtual Room */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Physical Location / Boardroom" hint="Optional in-person venue">
              <div className="relative">
                <MapPin size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate2-400" />
                <input
                  type="text"
                  value={location}
                  disabled={locked || submitting}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Executive Boardroom 3B, Modjo Hub"
                  className={`${inputClass} pl-8.5 text-xs sm:text-sm`}
                />
              </div>
            </Field>

            <Field label="Online Meeting Room Link" hint="Optional virtual conference URL">
              <div className="relative">
                <Video size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate2-400" />
                <input
                  type="url"
                  value={onlineLink}
                  disabled={locked || submitting}
                  onChange={(e) => setOnlineLink(e.target.value)}
                  placeholder="https://meet.google.com/xyz-abc or Teams"
                  className={`${inputClass} pl-8.5 text-xs sm:text-sm font-mono`}
                />
              </div>
            </Field>
          </div>

          {/* Executive Agenda Brief / Description */}
          <Field label="Executive Description & Objectives" hint="Context provided to participants">
            <div className="relative">
              <textarea
                rows={3}
                value={description}
                disabled={locked || submitting}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Key directives, background context, and target decisions for this session..."
                className={`${inputClass} text-xs sm:text-sm resize-none`}
              />
            </div>
          </Field>

          {/* Modal Action Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate2-100">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={submitting}
              className="text-xs sm:text-sm"
            >
              Cancel
            </Button>

            <Button
              type="submit"
              disabled={locked || submitting || isPristine || Boolean(timeError) || title.trim().length < 3}
              className="text-xs sm:text-sm shadow-sm inline-flex items-center gap-1.5"
            >
              {submitting ? "Saving Changes..." : isPristine ? "No Changes" : "Save Changes"}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
