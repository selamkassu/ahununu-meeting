import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Signature,
  Type,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Calendar,
  UserCheck,
  Clock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button, CodeChip } from "../ui/Primitives";
import type { MeetingDetail } from "../../types";
import { useAuth } from "../../context/AuthContext";

interface MeetingApprovalModalProps {
  open: boolean;
  onClose: () => void;
  meeting: MeetingDetail;
  onApproveSuccess: (updatedMeeting: MeetingDetail) => void;
  onApproveApi: (
    signatureDataUrl: string,
    forceApprove?: boolean,
    forceReason?: string
  ) => Promise<MeetingDetail>;
}

export function MeetingApprovalModal({
  open,
  onClose,
  meeting,
  onApproveSuccess,
  onApproveApi,
}: MeetingApprovalModalProps) {
  const { user } = useAuth();

  const [tab, setTab] = useState<"draw" | "type">("draw");
  const [typedName, setTypedName] = useState(user?.name || "");
  const [typedStyle, setTypedStyle] = useState<"elegant" | "classic" | "modern">("elegant");
  const [hasDrawn, setHasDrawn] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [forceSubmit, setForceSubmit] = useState(false);
  const [forceReason, setForceReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sigCheckExpanded, setSigCheckExpanded] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  // Roster of required signers: all meeting participants + organizer/admin
  const requiredSigners = useMemo(() => {
    const list = [...(meeting.participants || []).map((p) => ({ user: p.user, roleLabel: "Participant" }))];
    if (meeting.organizer && !list.some((p) => p.user.id === meeting.organizer.id)) {
      list.unshift({ user: meeting.organizer as any, roleLabel: "Organizer / Admin" });
    }
    return list;
  }, [meeting.participants, meeting.organizer]);

  const totalSigners = requiredSigners.length;
  const signedUserIds = useMemo(
    () => new Set((meeting.participantSignatures || []).map((s) => s.userId)),
    [meeting.participantSignatures]
  );
  const signedCount = useMemo(
    () => requiredSigners.filter((s) => signedUserIds.has(s.user.id)).length,
    [requiredSigners, signedUserIds]
  );

  // Other required signers who haven't signed yet (excluding the current approving user who signs now)
  const pendingSigners = useMemo(() => {
    return requiredSigners.filter(
      (s) => !signedUserIds.has(s.user.id) && s.user.id !== user?.id
    );
  }, [requiredSigners, signedUserIds, user?.id]);
  const allSigned = pendingSigners.length === 0;
  const progressPct = totalSigners > 0 ? Math.round((signedCount / totalSigners) * 100) : 100;

  useEffect(() => {
    if (open) {
      setHasDrawn(false);
      setAgreed(false);
      setForceSubmit(false);
      setForceReason("");
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

  const generateTypedSignatureImage = (): string => {
    const offCanvas = document.createElement("canvas");
    offCanvas.width = 500;
    offCanvas.height = 200;
    const ctx = offCanvas.getContext("2d");
    if (!ctx) return "";

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, offCanvas.width, offCanvas.height);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (typedStyle === "elegant") {
      ctx.font = "italic 40px 'Georgia', serif";
      ctx.fillStyle = "#0B7A6B";
    } else if (typedStyle === "classic") {
      ctx.font = "italic bold 38px 'Times New Roman', serif";
      ctx.fillStyle = "#0B7A6B";
    } else {
      ctx.font = "bold 34px sans-serif";
      ctx.fillStyle = "#0B7A6B";
    }

    ctx.fillText(typedName.trim(), offCanvas.width / 2, 85);

    ctx.strokeStyle = "#0B7A6B";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(30, 150);
    ctx.lineTo(470, 150);
    ctx.stroke();
    ctx.font = "12px sans-serif";
    ctx.fillStyle = "#64748b";
    ctx.fillText(`Digitally signed by ${typedName.trim()} • Ahununu Portal`, offCanvas.width / 2, 175);
    return offCanvas.toDataURL("image/png");
  };

  const handleSubmit = async () => {
    setError(null);
    let signatureDataUrl = "";
    if (tab === "draw") {
      if (!hasDrawn || !canvasRef.current) {
        setError("Please draw your signature in the box before approving.");
        return;
      }
      signatureDataUrl = canvasRef.current.toDataURL("image/png");
    } else {
      if (!typedName.trim()) { setError("Please enter your name for the signature."); return; }
      signatureDataUrl = generateTypedSignatureImage();
    }
    if (!agreed) { setError("Please confirm your review and attestation before approving."); return; }

    if (!allSigned && !forceSubmit) {
      setError("Some participants haven't signed yet. Please toggle the Force Submit checkbox to confirm administrative override.");
      return;
    }

    setSubmitting(true);
    try {
      const updated = await onApproveApi(signatureDataUrl, Boolean(forceSubmit || !allSigned), forceReason);
      onApproveSuccess(updated);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to approve meeting. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const reviewerTitle = user?.jobTitle || user?.role?.name || "Authorized Reviewer";
  const nowFormatted = new Date().toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  return (
    <Modal open={open} onClose={submitting ? () => {} : onClose} title="Approve Meeting & Formalize Minutes" wide>
      <div className="space-y-5 text-sm text-slate2-700">

        {/* Header Summary Banner */}
        <div className="rounded-xl border border-brand/20 bg-brand/5 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-brand/10 p-2 text-brand shrink-0"><ShieldCheck size={22} /></div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate2-900">{meeting.title}</span>
                <CodeChip>{meeting.code}</CodeChip>
              </div>
              <p className="mt-1 text-xs text-slate2-600">
                You are about to provide the final formal approval for this meeting. This will permanently
                certify and lock the attendee roster, attendance status, agenda, recorded minutes, decisions, and action items.
              </p>
            </div>
          </div>
        </div>

        {/* Reviewer & Timestamp */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-slate2-200/80 bg-slate2-50/60 p-3 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 text-brand">
              <UserCheck size={16} />
            </div>
            <div>
              <p className="font-medium text-slate2-800">{user?.name || "Authorized Reviewer"}</p>
              <p className="text-slate2-500">{reviewerTitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 sm:justify-end">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate2-100 text-slate2-600">
              <Calendar size={15} />
            </div>
            <div>
              <p className="text-slate2-500">Approval Timestamp</p>
              <p className="font-medium text-slate2-800">{nowFormatted}</p>
            </div>
          </div>
        </div>

        {/* Attendee Signatures Checklist Card */}
        <div className="rounded-xl border border-slate2-200 bg-slate2-50/50 p-4 space-y-3">
          <div
            className="flex items-center justify-between cursor-pointer select-none"
            onClick={() => setSigCheckExpanded(!sigCheckExpanded)}
          >
            <div className="flex items-center gap-2">
              <UserCheck size={16} className="text-brand" />
              <span className="font-semibold text-xs text-slate2-800">
                Participant & Admin Pre-Signatures Roster
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                allSigned ? "bg-emerald-100 text-emerald-800 border border-emerald-300" : "bg-amber-100 text-amber-800 border border-amber-300"
              }`}>
                {signedCount} of {totalSigners} Signed ({progressPct}%)
              </span>
            </div>
            <button type="button" className="text-slate2-400 hover:text-slate2-600">
              {sigCheckExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
          </div>

          {sigCheckExpanded && (
            <div className="space-y-2 pt-1 border-t border-slate2-200/60">
              {/* Progress Bar */}
              <div className="h-1.5 w-full rounded-full bg-slate2-200 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%`, background: allSigned ? "#10b981" : "#0B7A6B" }}
                />
              </div>

              {/* Informative Note if participants are still pending */}
              {!allSigned && (
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200/80 rounded-lg p-2.5">
                  ℹ️ <strong>{totalSigners - signedCount} signature(s)</strong> are pending. As an authorized reviewer / administrator, you can proceed to sign and formally certify the meeting below.
                </p>
              )}

              {/* Signers list */}
              <div className="grid gap-1.5 mt-1">
                {requiredSigners.map((p) => {
                  const sig = meeting.participantSignatures?.find((s) => s.userId === p.user.id);
                  const isMe = p.user.id === user?.id;
                  return (
                    <div key={p.user.id} className="flex items-center gap-2.5 rounded-lg bg-white border border-slate2-200 px-3 py-2">
                      <div
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold"
                        style={{ background: p.user.avatarColor || "#0B7A6B" }}
                      >
                        {p.user.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate2-800 truncate">
                          {p.user.name} {isMe && "(You)"}
                        </p>
                        <p className="text-[10px] text-slate2-400">
                          {p.user.jobTitle || p.roleLabel}
                        </p>
                      </div>
                      {sig ? (
                        <div className="flex items-center gap-2 shrink-0">
                          <img
                            src={sig.signatureDataUrl}
                            alt="signature"
                            className="h-8 object-contain opacity-90 rounded border border-slate2-100 bg-white px-1"
                            style={{ maxWidth: 80 }}
                          />
                          <span
                            className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-600 shrink-0"
                            title={`Signed on ${new Date(sig.signedAt).toLocaleDateString()}`}
                          >
                            <Signature size={14} />
                          </span>
                        </div>
                      ) : (
                        <span
                          className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-amber-50 border border-amber-200 text-amber-500 shrink-0"
                          title="Signature pending"
                        >
                          <Signature size={14} className="opacity-70" />
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Reviewer Signature Capture */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate2-600">
              Reviewer Signature <span className="text-rose-500">*</span>
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
                    <Signature size={20} className="mb-1 text-slate2-300" />
                    <span className="text-xs font-medium">Draw your digital signature here</span>
                    <span className="text-[10px] text-slate2-400">Mouse, trackpad, or finger</span>
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
                  onChange={e => setTypedName(e.target.value)}
                  placeholder="e.g. Dawit Bekele"
                  className="w-full rounded-lg border border-slate2-300 px-3 py-2 text-sm text-slate2-900 placeholder:text-slate2-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate2-600 mb-1">
                  Select Signature Style
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["elegant", "classic", "modern"] as const).map(style => (
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
                  {typedName.trim() || "Your Name"}
                </div>
                <div className="mx-auto my-1 h-0.5 w-48 bg-brand/30 rounded-full" />
                <p className="text-[10px] text-slate2-400">Digitally verified reviewer endorsement</p>
              </div>
            </div>
          )}
        </div>

        {/* Force Submit Toggle Card: Displayed when some participants haven't signed yet */}
        {!allSigned && (
          <div className="rounded-xl border border-amber-300 bg-amber-50/80 p-4 space-y-3">
            <div className="flex items-start gap-2.5">
              <div className="rounded-lg bg-amber-100 p-1.5 text-amber-700 shrink-0 mt-0.5">
                <AlertTriangle size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <h5 className="font-semibold text-xs text-amber-950">
                    Participant Signatures Incomplete ({pendingSigners.length} pending)
                  </h5>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-200/90 border border-amber-300/80 px-2 py-0.5 rounded-full">
                    Override Required
                  </span>
                </div>
                <p className="text-xs text-amber-800/90 mt-1 leading-relaxed">
                  Some participants have not yet submitted their digital pre-signatures. To certify and lock this meeting immediately, you must toggle the <strong>Force Submit</strong> option below to authorize an administrative override.
                </p>
              </div>
            </div>

            {/* Toggle Checkbox */}
            <label className="flex items-start gap-3 rounded-lg border border-amber-300/90 bg-white p-3 cursor-pointer select-none transition-colors hover:bg-amber-50/40">
              <input
                id="force-submit-checkbox"
                type="checkbox"
                checked={forceSubmit}
                onChange={(e) => setForceSubmit(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500 accent-amber-600"
              />
              <div className="text-xs">
                <span className="font-bold text-amber-950">
                  Force submit and approve meeting without remaining attendee signatures
                </span>
                <p className="text-amber-800/80 text-[11px] mt-0.5">
                  I acknowledge that attendee signatures are incomplete, and I am exercising administrative authority to approve, certify, and lock these proceedings.
                </p>
              </div>
            </label>

            {/* Override Reason (Optional) */}
            {forceSubmit && (
              <div className="pt-1">
                <label className="block text-[11px] font-semibold text-amber-900 mb-1">
                  Reason for Administrative Force Approval <span className="font-normal text-amber-700">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={forceReason}
                  onChange={(e) => setForceReason(e.target.value)}
                  placeholder="e.g. Quorum satisfied; remaining participants unavailable or verbal approval obtained"
                  className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs text-slate2-800 placeholder:text-slate2-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 shadow-2xs"
                />
              </div>
            )}
          </div>
        )}

        {/* Attestation Checkbox */}
        <label className="flex items-start gap-3 rounded-lg border border-slate2-200/90 bg-white p-3 cursor-pointer select-none transition-colors hover:bg-slate2-50">
          <input
            type="checkbox"
            checked={agreed}
            onChange={e => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate2-300 text-brand focus:ring-brand"
          />
          <div className="text-xs text-slate2-600">
            <span className="font-semibold text-slate2-800">Reviewer Attestation & Final Lock</span>
            <p className="mt-0.5 text-slate2-500">
              I certify that I am an authorized reviewer, have reviewed the minutes and all associated
              records of this meeting, and hereby affix my digital signature to approve and lock this meeting.
            </p>
          </div>
        </label>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
            <AlertCircle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 border-t border-slate2-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting} className="text-xs">
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleSubmit}
            disabled={
              submitting
              || !agreed
              || (tab === "draw" ? !hasDrawn : !typedName.trim())
              || (!allSigned && !forceSubmit)
            }
            className={`text-xs py-2 px-5 shadow-sm inline-flex items-center gap-2 font-semibold text-white transition-all ${
              !allSigned && forceSubmit
                ? "bg-amber-600 hover:bg-amber-700"
                : "bg-brand hover:bg-brand-dark"
            }`}
          >
            {submitting ? (
              <><Loader2 size={14} className="animate-spin" /> Submitting Approval...</>
            ) : !allSigned && forceSubmit ? (
              <><ShieldAlert size={15} /> Force Sign & Approve Meeting</>
            ) : (
              <><ShieldCheck size={15} /> Sign & Approve Meeting</>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
