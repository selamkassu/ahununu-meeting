import React, { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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

export default function MeetingCreateModal({
  departments,
  onClose,
  onCreated,
}: {
  departments: Department[];
  onClose: () => void;
  onCreated: (meeting: MeetingDetail) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
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
        agendaItems: agendaItems.filter((a) => a.title.trim()).map((a) => ({ ...a, description: a.description || undefined, presenter: a.presenter || undefined })),
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
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="e.g. Weekly Operations Sync" />
        </Field>

        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={inputClass} />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Date" required>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} required />
          </Field>
          <Field label="Start time" required>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputClass} required />
          </Field>
          <Field label="End time" required>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputClass} required />
          </Field>
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
              <label key={u.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate2-50">
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
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create meeting"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
