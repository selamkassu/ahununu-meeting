import React, { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Clock, AlertCircle } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { Field, inputClass, Button } from "../../components/ui/Primitives";
import { api, ApiError } from "../../api/client";
import type { Department, MeetingDetail, Priority, User } from "../../types";

const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

interface AgendaDraft {
  title: string;
  description: string;
  presenter: string;
  durationMin: number;
}

/**
 * Format a Date object to YYYY-MM-DD in local time
 */
function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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
 * Get sensible default date, startTime, and endTime for a new meeting based on current time.
 * Rounds up to the next 30-minute interval.
 * If late in the day (>= 22:30), advances date to tomorrow 09:00 - 10:00.
 */
function getDefaultMeetingTimes(): { date: string; startTime: string; endTime: string } {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // If late at night (>= 22:30), default to tomorrow 09:00 - 10:00
  if (currentMinutes >= 22 * 60 + 30) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return {
      date: getLocalDateString(tomorrow),
      startTime: "09:00",
      endTime: "10:00",
    };
  }

  // Round up to next 30 minutes (with at least 5 minutes cushion)
  const roundedMins = Math.ceil((currentMinutes + 5) / 30) * 30;
  const startH = Math.floor(roundedMins / 60);
  const startM = roundedMins % 60;
  const startTime = formatTimeHHmm(startH, startM);

  // End time default: 60 minutes after start time
  const endMins = Math.min(roundedMins + 60, 23 * 60 + 59);
  const endTime = minutesToTime(endMins);

  return {
    date: getLocalDateString(now),
    startTime,
    endTime,
  };
}

export default function MeetingCreateModal({
  departments,
  onClose,
  onCreated,
}: {
  departments: Department[];
  onClose: () => void;
  onCreated: (meeting: MeetingDetail) => void;
}) {
  const initialTimes = useMemo(() => getDefaultMeetingTimes(), []);
  const todayDateStr = useMemo(() => getLocalDateString(), []);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(initialTimes.date);
  const [startTime, setStartTime] = useState(initialTimes.startTime);
  const [endTime, setEndTime] = useState(initialTimes.endTime);
  const [location, setLocation] = useState("");
  const [onlineLink, setOnlineLink] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [departmentId, setDepartmentId] = useState(departments[0]?.id || "");
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [agendaItems, setAgendaItems] = useState<AgendaDraft[]>([{ title: "", description: "", presenter: "", durationMin: 15 }]);
  const [users, setUsers] = useState<User[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<User[]>("/users").then(setUsers).catch(() => {});
  }, []);

  // Real-time constraints computation
  const isDateInPast = date < todayDateStr;
  const isToday = date === todayDateStr;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const currentTimeString = formatTimeHHmm(now.getHours(), now.getMinutes());

  const startMins = timeToMinutes(startTime);
  const endMins = timeToMinutes(endTime);

  // Start time in the past check (only applies if date is today)
  const isStartTimeInPast = isToday && startMins < currentMinutes;

  // End time checks
  const isEndTimeBeforeOrEqualStart = endMins <= startMins;
  const durationMins = endMins - startMins;
  const isDurationTooShort = !isEndTimeBeforeOrEqualStart && durationMins < 5;

  // Formatting calculated duration
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

  // Aggregate time error message
  const timeError = useMemo(() => {
    if (isDateInPast) {
      return "Meeting date cannot be in the past.";
    }
    if (isStartTimeInPast) {
      return "Start time cannot be in the past for today's meeting.";
    }
    if (isEndTimeBeforeOrEqualStart) {
      return "End time must be strictly after the start time.";
    }
    if (isDurationTooShort) {
      return "Meeting duration must be at least 5 minutes.";
    }
    return null;
  }, [isDateInPast, isStartTimeInPast, isEndTimeBeforeOrEqualStart, isDurationTooShort]);

  // Agenda total duration
  const totalAgendaMin = useMemo(
    () => agendaItems.reduce((sum, a) => sum + (Number(a.durationMin) || 0), 0),
    [agendaItems]
  );
  const agendaExceedsMeeting = durationMins > 0 && totalAgendaMin > durationMins;

  // Interactive Handlers
  const handleDateChange = (newDate: string) => {
    setDate(newDate);
    // If user selects today and start time is already in the past, bump to upcoming slot
    if (newDate === todayDateStr) {
      const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
      if (timeToMinutes(startTime) < nowMins) {
        const roundedMins = Math.ceil((nowMins + 5) / 30) * 30;
        const newStart = minutesToTime(roundedMins);
        setStartTime(newStart);
        const prevDuration = Math.max(30, endMins - startMins);
        setEndTime(minutesToTime(roundedMins + prevDuration));
      }
    }
  };

  const handleStartTimeChange = (newStartTime: string) => {
    setStartTime(newStartTime);
    const newStartMins = timeToMinutes(newStartTime);
    const currentDuration = endMins > startMins ? (endMins - startMins) : 60;
    // Smart auto-adjustment: if end time is now <= new start time, automatically bump end time
    if (endMins <= newStartMins) {
      const newEndMins = Math.min(newStartMins + currentDuration, 23 * 60 + 59);
      setEndTime(minutesToTime(newEndMins));
    }
  };

  const handleEndTimeChange = (newEndTime: string) => {
    setEndTime(newEndTime);
  };

  const setQuickDuration = (minutes: number) => {
    const newStartMins = timeToMinutes(startTime);
    const newEndMins = Math.min(newStartMins + minutes, 23 * 60 + 59);
    setEndTime(minutesToTime(newEndMins));
  };

  const alignMeetingWithAgenda = () => {
    if (totalAgendaMin <= 0) return;
    const newStartMins = timeToMinutes(startTime);
    const newEndMins = Math.min(newStartMins + totalAgendaMin, 23 * 60 + 59);
    setEndTime(minutesToTime(newEndMins));
  };

  const addAgendaItem = () => setAgendaItems((prev) => [...prev, { title: "", description: "", presenter: "", durationMin: 15 }]);
  const removeAgendaItem = (idx: number) => setAgendaItems((prev) => prev.filter((_, i) => i !== idx));
  const updateAgendaItem = (idx: number, patch: Partial<AgendaDraft>) =>
    setAgendaItems((prev) => prev.map((a, i) => (i === idx ? { ...a, ...patch } : a)));

  const toggleParticipant = (id: string) =>
    setParticipantIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim() || !departmentId) {
      setError("Title and department are required.");
      return;
    }

    if (timeError) {
      setError(timeError);
      return;
    }

    setSubmitting(true);
    try {
      const meeting = await api.post<MeetingDetail>("/meetings", {
        title,
        description: description || undefined,
        date,
        startTime,
        endTime,
        location: location || undefined,
        onlineLink: onlineLink || undefined,
        priority,
        departmentId,
        participantIds,
        agendaItems: agendaItems
          .filter((a) => a.title.trim())
          .map((a) => ({ ...a, description: a.description || undefined, presenter: a.presenter || undefined })),
      });
      onCreated(meeting);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the meeting. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="New meeting" wide>
      <form onSubmit={submit} className="space-y-5">
        <Field label="Meeting title" required>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
            placeholder="e.g. Weekly Operations Sync"
            autoFocus
          />
        </Field>

        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className={inputClass}
            placeholder="Brief purpose or context for this meeting..."
          />
        </Field>

        {/* Date and Time Constraints Section */}
        <div className="space-y-2.5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {/* Date Picker with min restriction */}
            <div>
              <Field label="Date" required>
                <input
                  type="date"
                  min={todayDateStr}
                  value={date}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className={`${inputClass} ${isDateInPast ? "border-rose-400 focus:border-rose-500 focus:ring-rose-200" : ""}`}
                  required
                />
              </Field>
              {isDateInPast && (
                <p className="mt-1 text-[11px] font-medium text-rose-600 flex items-center gap-1">
                  <AlertCircle size={11} /> Cannot select past date
                </p>
              )}
            </div>

            {/* Start Time with past-time restriction for today */}
            <div>
              <Field label="Start time" required>
                <input
                  type="time"
                  min={isToday ? currentTimeString : undefined}
                  value={startTime}
                  onChange={(e) => handleStartTimeChange(e.target.value)}
                  className={`${inputClass} ${isStartTimeInPast ? "border-rose-400 focus:border-rose-500 focus:ring-rose-200" : ""}`}
                  required
                />
              </Field>
              {isStartTimeInPast && (
                <p className="mt-1 text-[11px] font-medium text-rose-600 flex items-center gap-1">
                  <AlertCircle size={11} /> Time already passed today
                </p>
              )}
            </div>

            {/* End Time with strict start < end restriction */}
            <div>
              <Field label="End time" required>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => handleEndTimeChange(e.target.value)}
                  className={`${inputClass} ${isEndTimeBeforeOrEqualStart || isDurationTooShort ? "border-rose-400 focus:border-rose-500 focus:ring-rose-200" : ""}`}
                  required
                />
              </Field>
              {isEndTimeBeforeOrEqualStart ? (
                <p className="mt-1 text-[11px] font-medium text-rose-600 flex items-center gap-1">
                  <AlertCircle size={11} /> Must be after start time
                </p>
              ) : isDurationTooShort ? (
                <p className="mt-1 text-[11px] font-medium text-rose-600 flex items-center gap-1">
                  <AlertCircle size={11} /> Min 5 minutes duration
                </p>
              ) : null}
            </div>
          </div>

          {/* Quick Duration Toolbar & Duration Status Pill */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate2-200 bg-slate2-50/70 px-3 py-2">
            <div className="flex items-center gap-2">
              {timeError ? (
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600">
                  <AlertCircle size={13} className="shrink-0 text-rose-500" />
                  <span>{timeError}</span>
                </div>
              ) : durationLabel ? (
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                  <Clock size={13} className="shrink-0 text-emerald-600" />
                  <span>Scheduled Duration: {durationLabel}</span>
                </div>
              ) : null}
            </div>

            {/* Preset duration buttons for effortless one-click scheduling */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-medium text-slate2-400 mr-1">Presets:</span>
              {[15, 30, 45, 60, 90, 120].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setQuickDuration(mins)}
                  className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-all border ${
                    durationMins === mins
                      ? "bg-brand text-white border-brand shadow-2xs"
                      : "bg-white text-slate2-600 border-slate2-200 hover:bg-slate2-100 hover:border-slate2-300"
                  }`}
                >
                  {mins < 60 ? `${mins}m` : mins === 60 ? "1h" : `${mins / 60}h`}
                </button>
              ))}
            </div>
          </div>

          {/* Warning if Agenda items exceed meeting duration */}
          {agendaExceedsMeeting && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-800">
              <div className="flex items-center gap-1.5">
                <AlertCircle size={13} className="text-amber-600 shrink-0" />
                <span>
                  Agenda items total <strong>{totalAgendaMin} min</strong>, which exceeds the current <strong>{durationMins} min</strong> meeting.
                </span>
              </div>
              <button
                type="button"
                onClick={alignMeetingWithAgenda}
                className="font-semibold text-amber-900 underline hover:no-underline text-xs"
              >
                Extend meeting to {totalAgendaMin} min
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Department" required>
            <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className={inputClass} required>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className={inputClass}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Location">
            <input value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} placeholder="e.g. HQ Boardroom" />
          </Field>
          <Field label="Online meeting link">
            <input value={onlineLink} onChange={(e) => setOnlineLink(e.target.value)} className={inputClass} placeholder="https://meet…" />
          </Field>
        </div>

        <Field label="Participants" hint="Select who should be invited">
          <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-slate2-200 p-2">
            {users.map((u) => (
              <label key={u.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate2-50 cursor-pointer">
                <input type="checkbox" checked={participantIds.includes(u.id)} onChange={() => toggleParticipant(u.id)} />
                <span className="text-slate2-700">{u.name}</span>
                <span className="text-xs text-slate2-400">{u.department?.name}</span>
              </label>
            ))}
          </div>
        </Field>

        <Field label="Agenda items">
          <div className="space-y-3">
            {agendaItems.map((a, idx) => (
              <div key={idx} className="rounded-lg border border-slate2-200 bg-slate2-50/50 p-3 space-y-2">
                {/* Row 1: Title + Duration + Delete */}
                <div className="flex items-center gap-2">
                  <input
                    value={a.title}
                    onChange={(e) => updateAgendaItem(idx, { title: e.target.value })}
                    placeholder={`Agenda item ${idx + 1} title`}
                    className={`${inputClass} flex-1 min-w-0`}
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      type="number"
                      min={5}
                      value={a.durationMin}
                      onChange={(e) => updateAgendaItem(idx, { durationMin: Number(e.target.value) })}
                      className={`${inputClass} w-20 text-center`}
                    />
                    <span className="text-xs text-slate2-400 shrink-0">min</span>
                  </div>
                  <button type="button" onClick={() => removeAgendaItem(idx)} className="text-slate2-400 hover:text-danger shrink-0">
                    <Trash2 size={16} />
                  </button>
                </div>
                {/* Row 2: Description */}
                <textarea
                  value={a.description}
                  onChange={(e) => updateAgendaItem(idx, { description: e.target.value })}
                  placeholder="Description (optional)"
                  rows={2}
                  className={`${inputClass} w-full resize-y`}
                />
                {/* Row 3: Presenter dropdown */}
                <select
                  value={a.presenter}
                  onChange={(e) => updateAgendaItem(idx, { presenter: e.target.value })}
                  className={`${inputClass} w-full`}
                >
                  <option value="">— No presenter —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.name}>
                      {u.name}{u.department ? ` (${u.department.name})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <button type="button" onClick={addAgendaItem} className="flex items-center gap-1 text-xs font-medium text-brand hover:underline">
              <Plus size={14} /> Add agenda item
            </button>
          </div>
        </Field>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-danger">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-slate2-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !!timeError}>
            {submitting ? "Creating…" : "Create meeting"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
