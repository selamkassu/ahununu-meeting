import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Signature,
  Type,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  Clock,
  Shield,
  ChevronDown,
  ChevronUp,
  Gavel,
  ListChecks,
  Monitor,
  CalendarDays,
  UserCheck,
} from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Primitives";
import { RichTextRenderer } from "../editor/RichTextRenderer";
import type { MeetingDetail } from "../../types";
import { getActionItemAssignees } from "../../types";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api/client";

interface Props {
  open: boolean;
  onClose: () => void;
  meeting: MeetingDetail;
  onSignSuccess: (updated: MeetingDetail) => void;
}

export function ParticipantSigningModal({ open, onClose, meeting, onSignSuccess }: Props) {
  const { user } = useAuth();
  const [tab, setTab] = useState<"draw" | "type">("draw");
  const [typedName, setTypedName] = useState(user?.name || "");
  const [typedStyle, setTypedStyle] = useState<"elegant" | "classic" | "modern">("elegant");
  const [hasDrawn, setHasDrawn] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReviewContent, setShowReviewContent] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const alreadySigned = meeting.participantSignatures?.some((s) => s.userId === user?.id);
  const mySignature = meeting.participantSignatures?.find((s) => s.userId === user?.id);

  // Roster of required signers: all meeting participants + meeting organizer/admin
  const requiredSigners = useMemo(() => {
    const list = [...(meeting.participants || []).map((p) => ({ user: p.user, roleLabel: "Participant" }))];
    if (meeting.organizer && !list.some((p) => p.user.id === meeting.organizer.id)) {
      list.unshift({ user: meeting.organizer as any, roleLabel: "Organizer / Admin" });
    }
    return list;
  }, [meeting.participants, meeting.organizer]);

  const totalSigners = requiredSigners.length;
  const signedCount = meeting.participantSignatures?.length ?? 0;
  const progressPct = totalSigners > 0 ? Math.round((signedCount / totalSigners) * 100) : 0;

  // Minutes summary content
  const summaryMinute = meeting.minutes?.find(
    (m) => m.type === "SUMMARY" || (!m.type && !m.attendeeId)
  );

  useEffect(() => {
    if (open) {
      setHasDrawn(false);
      setAgreed(false);
      setError(null);
      setSubmitting(false);
      if (user?.name) setTypedName(user.name);
      setTimeout(initCanvas, 50);
    }
  }, [open, user?.name]);

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = "#0B7A6B";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    setHasDrawn(false);
  };

  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    const pt = getCanvasCoords(e);
    lastPointRef.current = pt;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !canvasRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    const pt = getCanvasCoords(e);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    setHasDrawn(true);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    isDrawingRef.current = false;
    lastPointRef.current = null;
  };

  const generateTypedSig = (): string => {
    const offCanvas = document.createElement("canvas");
    offCanvas.width = 500;
    offCanvas.height = 180;
    const ctx = offCanvas.getContext("2d");
    if (!ctx) return "";

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, offCanvas.width, offCanvas.height);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (typedStyle === "elegant") {
      ctx.font = "italic 38px 'Georgia', serif";
      ctx.fillStyle = "#0B7A6B";
    } else if (typedStyle === "classic") {
      ctx.font = "italic bold 36px 'Times New Roman', serif";
      ctx.fillStyle = "#0B7A6B";
    } else {
      ctx.font = "600 32px sans-serif";
      ctx.fillStyle = "#0B7A6B";
    }

    ctx.fillText(typedName.trim(), offCanvas.width / 2, 75);

    ctx.strokeStyle = "#0B7A6B";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(20, 135);
    ctx.lineTo(480, 135);
    ctx.stroke();

    ctx.font = "11px sans-serif";
    ctx.fillStyle = "#64748b";
    ctx.fillText(`Digitally signed by ${typedName.trim()} · Ahununu Portal`, offCanvas.width / 2, 158);
    return offCanvas.toDataURL("image/png");
  };

  const handleSubmit = async () => {
    setError(null);
    let signatureDataUrl = "";
    if (tab === "draw") {
      if (!hasDrawn || !canvasRef.current) {
        setError("Please draw your signature before submitting.");
        return;
      }
      signatureDataUrl = canvasRef.current.toDataURL("image/png");
    } else {
      if (!typedName.trim()) {
        setError("Please enter your name.");
        return;
      }
      signatureDataUrl = generateTypedSig();
    }
    if (!agreed) {
      setError("Please confirm the participant attestation before signing.");
      return;
    }
    setSubmitting(true);
    try {
      const updated = await api.post<MeetingDetail>(`/meetings/${meeting.id}/participant-sign`, {
        signature: signatureDataUrl,
      });
      onSignSuccess(updated);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to submit signature. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={submitting ? () => {} : onClose} title="Review Proceedings & Affix Digital Signature" wide>
      <div className="space-y-5 text-sm text-slate2-700">

        {/* Meeting Header Banner */}
        <div className="rounded-xl border border-brand/20 bg-gradient-to-r from-brand/5 via-brand/[0.02] to-slate2-50 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-brand/10 p-2.5 text-brand shrink-0">
                <FileText size={22} />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-slate2-900 truncate text-base">{meeting.title}</h3>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate2-500">
                  <span className="inline-flex items-center gap-1 font-medium text-slate2-700">
                    <CalendarDays size={13} className="text-brand" />
                    {new Date(meeting.date).toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                  {meeting.startTime && (
                    <>
                      <span>·</span>
                      <span className="font-medium">{meeting.startTime} – {meeting.endTime}</span>
                    </>
                  )}
                  {meeting.department && (
                    <>
                      <span>·</span>
                      <span className="rounded bg-slate2-100 px-1.5 py-0.5 font-medium text-slate2-700">
                        {meeting.department.name}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="text-[11px] font-semibold text-slate2-400 uppercase tracking-wider block">Meeting ID</span>
              <span className="font-mono text-xs font-bold text-slate2-700">{meeting.code}</span>
            </div>
          </div>
        </div>

        {/* Attendees Signing Progress Bar */}
        <div className="rounded-xl border border-slate2-200 bg-slate2-50/70 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate2-700 flex items-center gap-1.5">
              <UserCheck size={14} className="text-brand" />
              Signatures Collected (Admin & Participants)
            </span>
            <span className={`font-bold ${signedCount >= totalSigners ? "text-emerald-600" : "text-amber-600"}`}>
              {signedCount} of {totalSigners} Signed ({progressPct}%)
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate2-200 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progressPct}%`,
                background: signedCount >= totalSigners ? "#10b981" : "#0B7A6B",
              }}
            />
          </div>

          {/* Attendee pills */}
          <div className="flex flex-wrap gap-2 pt-1">
            {requiredSigners.map((p) => {
              const sig = meeting.participantSignatures?.find((s) => s.userId === p.user.id);
              const isCurrentUser = p.user.id === user?.id;
              return (
                <div
                  key={p.user.id}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                    sig
                      ? "border-emerald-200 bg-emerald-50/70 text-emerald-800"
                      : isCurrentUser
                      ? "border-amber-300 bg-amber-50 text-amber-900 font-medium"
                      : "border-slate2-200 bg-white text-slate2-600"
                  }`}
                >
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                    style={{ background: p.user.avatarColor || "#0B7A6B" }}
                  >
                    {p.user.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate max-w-[130px]">
                    {p.user.name} {isCurrentUser && "(You)"}
                  </span>
                  {sig ? (
                    <Signature size={13} className="text-emerald-600 shrink-0" />
                  ) : (
                    <Clock size={13} className="text-amber-500 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Collapsible Section: Review Recorded Minutes, Decisions & Action Items */}
        <div className="rounded-xl border border-slate2-200 bg-white overflow-hidden shadow-2xs">
          <button
            type="button"
            onClick={() => setShowReviewContent(!showReviewContent)}
            className="w-full flex items-center justify-between p-3.5 bg-slate2-50 hover:bg-slate2-100/70 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-brand" />
              <span className="font-semibold text-slate2-800 text-xs">
                Review Minutes, Decisions & Action Items Prior to Signing
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs text-slate2-500">
              <span>{showReviewContent ? "Hide Details" : "Show Details"}</span>
              {showReviewContent ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </div>
          </button>

          {showReviewContent && (
            <div className="p-4 space-y-4 border-t border-slate2-100 divide-y divide-slate2-100">
              {/* Summary Section */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate2-500 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText size={13} className="text-brand" /> Meeting Summary
                </span>
                {summaryMinute?.content ? (
                  <div className="rounded-lg bg-slate2-50/60 p-3 text-xs text-slate2-700 leading-relaxed max-h-48 overflow-y-auto">
                    <RichTextRenderer content={summaryMinute.content} />
                  </div>
                ) : (
                  <p className="text-xs text-slate2-400 italic">No summary recorded for this meeting.</p>
                )}
              </div>

              {/* Decisions Section */}
              {meeting.decisions && meeting.decisions.length > 0 && (
                <div className="pt-3 space-y-1.5">
                  <span className="text-[11px] font-bold text-slate2-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Gavel size={13} className="text-brand" /> Agreed Decisions ({meeting.decisions.length})
                  </span>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {meeting.decisions.map((d) => (
                      <div key={d.id} className="rounded-lg border border-slate2-100 bg-slate2-50/50 p-2.5 text-xs">
                        <span className="font-semibold text-slate2-800">{d.title}</span>
                        {d.description && <p className="text-slate2-600 mt-0.5">{d.description}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Items Section */}
              {meeting.actionItems && meeting.actionItems.length > 0 && (
                <div className="pt-3 space-y-1.5">
                  <span className="text-[11px] font-bold text-slate2-500 uppercase tracking-wider flex items-center gap-1.5">
                    <ListChecks size={13} className="text-brand" /> Assigned Action Items ({meeting.actionItems.length})
                  </span>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {meeting.actionItems.map((a) => (
                      <div key={a.id} className="rounded-lg border border-slate2-100 bg-slate2-50/50 p-2.5 text-xs flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-semibold text-slate2-800 truncate block">{a.title}</span>
                          <span className="text-[10px] text-slate2-500">
                            Assigned to:{" "}
                            <strong className="text-slate2-700">
                              {getActionItemAssignees(a).map((u) => u.name).join(", ") || a.assignedTo?.name || "Unassigned"}
                            </strong>
                            {" "}· Due: {new Date(a.deadline).toLocaleDateString()}
                          </span>
                        </div>
                        <span className="rounded bg-slate2-100 px-2 py-0.5 text-[10px] font-medium text-slate2-700 shrink-0">
                          {a.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Already Signed View */}
        {alreadySigned && mySignature ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-5 text-center space-y-3">
            <div className="inline-flex rounded-full bg-emerald-100 p-2.5 text-emerald-600 mb-1">
              <Signature size={32} />
            </div>
            <div>
              <h4 className="font-bold text-emerald-900 text-base">You Have Already Signed These Minutes</h4>
              <p className="text-xs text-emerald-700 mt-0.5">
                Verified on {new Date(mySignature.signedAt).toLocaleString()}
              </p>
            </div>
            <div className="mx-auto max-w-xs rounded-xl border border-emerald-200 bg-white p-3 shadow-2xs">
              <span className="block text-[10px] font-semibold text-slate2-400 uppercase tracking-wider mb-1">
                Your Digital Signature
              </span>
              <div className="flex items-center justify-center min-h-[50px]">
                <img
                  src={mySignature.signatureDataUrl}
                  alt="Your signature"
                  className="max-h-14 max-w-[200px] object-contain"
                />
              </div>
              <div className="mt-2 pt-2 border-t border-slate2-100 text-[10px] text-slate2-500 flex items-center justify-center gap-1">
                <Monitor size={11} className="text-slate2-400" />
                <span>Audited: {new Date(mySignature.signedAt).toLocaleDateString()}</span>
              </div>
            </div>
            <div className="pt-2">
              <Button type="button" variant="secondary" onClick={onClose} className="text-xs">
                Close
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Signature Capture Pad */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate2-700 flex items-center gap-1.5">
                  <Signature size={13} className="text-brand" />
                  Your Digital Signature <span className="text-rose-500">*</span>
                </label>
                <div className="inline-flex rounded-lg border border-slate2-200 p-0.5 bg-slate2-100 text-xs">
                  <button
                    type="button"
                    onClick={() => setTab("draw")}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors ${
                      tab === "draw"
                        ? "bg-white text-brand shadow-2xs font-semibold"
                        : "text-slate2-600 hover:text-slate2-900"
                    }`}
                  >
                    <Signature size={12} /> Draw Signature
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("type")}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors ${
                      tab === "type"
                        ? "bg-white text-brand shadow-2xs font-semibold"
                        : "text-slate2-600 hover:text-slate2-900"
                    }`}
                  >
                    <Type size={12} /> Type Name
                  </button>
                </div>
              </div>

              {tab === "draw" ? (
                <div className="space-y-1.5">
                  <div className="relative rounded-xl border-2 border-dashed border-slate2-300 bg-white p-2 hover:border-brand/40 transition-colors">
                    <canvas
                      ref={canvasRef}
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      className="h-32 w-full cursor-crosshair touch-none select-none rounded-lg bg-slate2-50/50"
                      style={{ touchAction: "none" }}
                    />
                    {!hasDrawn && (
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-slate2-400">
                        <Signature size={22} className="mb-1 text-slate2-300" />
                        <span className="text-xs font-medium">Draw your digital signature here</span>
                        <span className="text-[10px] text-slate2-400">Use your mouse, trackpad, or finger</span>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate2-500 px-1">
                    <span>Sign above using pointer or stylus</span>
                    <button
                      type="button"
                      onClick={clearCanvas}
                      disabled={!hasDrawn}
                      className="inline-flex items-center gap-1 text-xs text-slate2-500 hover:text-rose-600 disabled:opacity-40 disabled:hover:text-slate2-500 cursor-pointer"
                    >
                      <RotateCcw size={12} /> Clear
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate2-700 mb-1">
                      Full Legal Name
                    </label>
                    <input
                      type="text"
                      value={typedName}
                      onChange={(e) => setTypedName(e.target.value)}
                      placeholder="e.g. Dawit Bekele"
                      className="w-full rounded-lg border border-slate2-300 px-3 py-2 text-sm text-slate2-900 placeholder:text-slate2-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate2-600 mb-1">
                      Select Signature Style
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["elegant", "classic", "modern"] as const).map((style) => (
                        <button
                          key={style}
                          type="button"
                          onClick={() => setTypedStyle(style)}
                          className={`rounded-lg border p-2 text-center text-xs font-medium capitalize transition-all ${
                            typedStyle === style
                              ? "border-brand bg-brand/5 text-brand font-semibold shadow-2xs"
                              : "border-slate2-200 bg-white text-slate2-600 hover:bg-slate2-50"
                          }`}
                        >
                          {style}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Preview */}
                  <div className="rounded-xl border border-slate2-200 bg-slate2-50/70 p-4 text-center">
                    <span className="block text-[10px] font-semibold text-slate2-400 uppercase tracking-wider mb-1">
                      Signature Preview
                    </span>
                    <div
                      className={`min-h-[60px] flex items-center justify-center text-2xl text-brand ${
                        typedStyle === "elegant"
                          ? "italic font-serif"
                          : typedStyle === "classic"
                          ? "font-serif italic font-bold"
                          : "font-sans font-semibold"
                      }`}
                    >
                      {typedName.trim() || user?.name || "Your Name"}
                    </div>
                    <div className="mx-auto mt-2 h-0.5 w-36 bg-accent rounded-full" />
                    <span className="mt-1 block text-[10px] text-slate2-400 font-mono">
                      Digitally signed · Ahununu Portal
                    </span>
                  </div>
                </div>
              )}

              {/* IP / Device Footprint metadata info */}
              <div className="flex items-center justify-between rounded-lg bg-slate2-50 border border-slate2-200/80 px-3 py-2 text-[11px] text-slate2-500">
                <span className="flex items-center gap-1.5">
                  <Monitor size={12} className="text-slate2-400" />
                  <span>Audit Footprint: Web Client ({navigator.platform || "Standard Client"})</span>
                </span>
                <span className="font-mono text-[10px] text-slate2-400">
                  {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} UTC
                </span>
              </div>

              {/* Participant Attestation Checkbox */}
              <label className="flex items-start gap-3 rounded-xl border border-slate2-200 bg-white p-3.5 cursor-pointer select-none hover:bg-slate2-50 transition-colors shadow-2xs">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate2-300 text-brand focus:ring-brand cursor-pointer"
                />
                <div className="text-xs text-slate2-600 leading-relaxed">
                  <span className="font-semibold text-slate2-900 block mb-0.5">
                    Participant Review Attestation & Consent
                  </span>
                  I confirm that I participated in this meeting, have reviewed the recorded proceedings, minutes, decisions, and action items, and hereby affix my digital signature to verify their accuracy.
                </div>
              </label>

              {/* Error display */}
              {error && (
                <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 border-t border-slate2-100 pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onClose}
                  disabled={submitting}
                  className="text-xs py-2 px-4"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleSubmit}
                  disabled={submitting || !agreed || (tab === "draw" ? !hasDrawn : !typedName.trim())}
                  className="bg-brand hover:bg-brand-light text-white text-xs py-2 px-5 shadow-sm inline-flex items-center gap-2 font-semibold"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Submitting Signature...
                    </>
                  ) : (
                    <>
                      <Signature size={14} /> Affix Digital Signature
                    </>
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
