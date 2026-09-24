import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  PenTool,
  Type,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Lock,
  Calendar,
  UserCheck,
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
  onApproveApi: (signatureDataUrl: string) => Promise<MeetingDetail>;
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  // Reset state when opening modal
  useEffect(() => {
    if (open) {
      setHasDrawn(false);
      setAgreed(false);
      setError(null);
      setSubmitting(false);
      if (user?.name) setTypedName(user.name);
      // Wait for canvas element to mount
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
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
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
    ctx.lineTo(pt.x + 0.1, pt.y + 0.1);
    ctx.stroke();
    setHasDrawn(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const pt = getCanvasCoords(e);
    ctx.beginPath();
    if (lastPointRef.current) {
      ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    }
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    lastPointRef.current = pt;
    setHasDrawn(true);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDrawingRef.current = false;
    lastPointRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if capture was lost
    }
  };

  // Generate PNG data URL for typed signature
  const generateTypedSignatureImage = (): string => {
    const offCanvas = document.createElement("canvas");
    offCanvas.width = 600;
    offCanvas.height = 200;
    const ctx = offCanvas.getContext("2d");
    if (!ctx) return "";

    // Transparent background
    ctx.clearRect(0, 0, offCanvas.width, offCanvas.height);

    // Font styling based on chosen style
    let fontName = "'Brush Script MT', 'Caveat', cursive";
    if (typedStyle === "classic") {
      fontName = "'Times New Roman', 'Baskerville', serif";
      ctx.font = `italic 52px ${fontName}`;
    } else if (typedStyle === "modern") {
      fontName = "system-ui, -apple-system, sans-serif";
      ctx.font = `italic 600 44px ${fontName}`;
    } else {
      ctx.font = `italic 54px ${fontName}`;
    }

    ctx.fillStyle = "#0B7A6B";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(typedName.trim(), offCanvas.width / 2, 85);

    // Subtle flourish/underline
    ctx.beginPath();
    ctx.strokeStyle = "#0B7A6B";
    ctx.lineWidth = 2;
    const lineY = 135;
    ctx.moveTo(80, lineY);
    ctx.bezierCurveTo(
      offCanvas.width * 0.35,
      lineY + 12,
      offCanvas.width * 0.65,
      lineY - 8,
      offCanvas.width - 80,
      lineY + 4
    );
    ctx.stroke();

    // Timestamp & reviewer seal text at bottom
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
      if (!typedName.trim()) {
        setError("Please enter your name for the signature.");
        return;
      }
      signatureDataUrl = generateTypedSignatureImage();
    }

    if (!agreed) {
      setError("Please confirm your review and attestation before approving.");
      return;
    }

    setSubmitting(true);
    try {
      const updated = await onApproveApi(signatureDataUrl);
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
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Modal open={open} onClose={submitting ? () => {} : onClose} title="Approve Meeting & Minutes" wide>
      <div className="space-y-5 text-sm text-slate2-700">
        {/* Header Summary Banner */}
        <div className="rounded-xl border border-brand/20 bg-brand/5 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-brand/10 p-2 text-brand">
              <ShieldCheck size={22} />
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate2-900">{meeting.title}</span>
                <CodeChip>{meeting.code}</CodeChip>
              </div>
              <p className="mt-1 text-xs text-slate2-600">
                You are about to provide the final formal approval for this meeting. This will permanently
                certify and lock the attendee roster, attendance status, agenda, recorded minutes,
                decisions, and action items.
              </p>
            </div>
          </div>
        </div>

        {/* Reviewer & Timestamp Metadata */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-slate2-200/80 bg-slate2-50/60 p-3 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 text-brand font-semibold text-xs">
              <UserCheck size={16} />
            </div>
            <div>
              <p className="font-medium text-slate2-800">{user?.name || "Authorized Reviewer"}</p>
              <p className="text-slate2-500">{reviewerTitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 sm:justify-end">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate2-100 text-slate2-600 font-semibold text-xs">
              <Calendar size={15} />
            </div>
            <div>
              <p className="text-slate2-500">Approval Timestamp</p>
              <p className="font-medium text-slate2-800">{nowFormatted}</p>
            </div>
          </div>
        </div>

        {/* Signature Capture Mode Switcher */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate2-600">
              Reviewer Signature <span className="text-rose-500">*</span>
            </label>
            <div className="inline-flex rounded-lg border border-slate2-200 p-0.5 bg-slate2-100 text-xs">
              <button
                type="button"
                onClick={() => setTab("draw")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors ${
                  tab === "draw"
                    ? "bg-white text-brand shadow-xs"
                    : "text-slate2-600 hover:text-slate2-900"
                }`}
              >
                <PenTool size={13} /> Draw Signature
              </button>
              <button
                type="button"
                onClick={() => setTab("type")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors ${
                  tab === "type"
                    ? "bg-white text-brand shadow-xs"
                    : "text-slate2-600 hover:text-slate2-900"
                }`}
              >
                <Type size={13} /> Type Signature
              </button>
            </div>
          </div>

          {/* Mode 1: Draw Signature Pad */}
          {tab === "draw" && (
            <div className="space-y-2">
              <div className="relative rounded-xl border-2 border-dashed border-slate2-300 bg-white p-2 transition-colors hover:border-brand/40">
                <canvas
                  ref={canvasRef}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  className="h-36 w-full cursor-crosshair touch-none select-none rounded-lg bg-slate2-50/40"
                  style={{ touchAction: "none" }}
                />
                {/* Baseline Guide */}
                <div className="pointer-events-none absolute bottom-8 left-8 right-8 flex items-center gap-2 border-b border-slate2-200/80 text-[11px] text-slate2-400">
                  <PenTool size={12} className="opacity-50" />
                  <span>Sign above this line</span>
                </div>

                <div className="flex items-center justify-between px-2 pt-1 text-[11px] text-slate2-400">
                  <span>Use your mouse, stylus, or fingertip to sign</span>
                  <button
                    type="button"
                    onClick={clearCanvas}
                    className="inline-flex items-center gap-1 text-slate2-500 hover:text-rose-600 font-medium cursor-pointer"
                  >
                    <RotateCcw size={12} /> Clear
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Mode 2: Type Signature */}
          {tab === "type" && (
            <div className="space-y-3 rounded-xl border border-slate2-200 bg-slate2-50/40 p-3.5">
              <div>
                <label className="block text-xs font-medium text-slate2-600 mb-1">
                  Full Legal Name
                </label>
                <input
                  type="text"
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  placeholder="Enter full name"
                  className="w-full rounded-lg border border-slate2-200 bg-white px-3 py-2 text-sm text-slate2-800 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate2-600 mb-1">
                  Signature Style
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setTypedStyle("elegant")}
                    className={`rounded-lg border p-2 text-center text-xs transition-colors ${
                      typedStyle === "elegant"
                        ? "border-brand bg-brand/5 text-brand font-semibold"
                        : "border-slate2-200 bg-white text-slate2-600 hover:bg-slate2-50"
                    }`}
                  >
                    <span style={{ fontFamily: "'Brush Script MT', 'Caveat', cursive" }} className="text-base block">
                      Script
                    </span>
                    <span className="text-[10px] text-slate2-400">Elegant Cursive</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTypedStyle("classic")}
                    className={`rounded-lg border p-2 text-center text-xs transition-colors ${
                      typedStyle === "classic"
                        ? "border-brand bg-brand/5 text-brand font-semibold"
                        : "border-slate2-200 bg-white text-slate2-600 hover:bg-slate2-50"
                    }`}
                  >
                    <span style={{ fontFamily: "'Times New Roman', serif" }} className="text-base italic block">
                      Classic
                    </span>
                    <span className="text-[10px] text-slate2-400">Formal Serif</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTypedStyle("modern")}
                    className={`rounded-lg border p-2 text-center text-xs transition-colors ${
                      typedStyle === "modern"
                        ? "border-brand bg-brand/5 text-brand font-semibold"
                        : "border-slate2-200 bg-white text-slate2-600 hover:bg-slate2-50"
                    }`}
                  >
                    <span className="text-sm font-semibold italic block">
                      Modern
                    </span>
                    <span className="text-[10px] text-slate2-400">Clean San-Serif</span>
                  </button>
                </div>
              </div>

              {/* Live Preview */}
              <div className="rounded-lg border border-slate2-200 bg-white p-4 text-center">
                <p className="text-[11px] text-slate2-400 mb-1">Signature Stamp Preview</p>
                <div
                  className="py-2 text-2xl text-brand transition-all"
                  style={{
                    fontFamily:
                      typedStyle === "classic"
                        ? "'Times New Roman', serif"
                        : typedStyle === "modern"
                        ? "sans-serif"
                        : "'Brush Script MT', 'Caveat', cursive",
                    fontStyle: "italic",
                    fontWeight: typedStyle === "modern" ? 600 : 400,
                  }}
                >
                  {typedName.trim() || "Your Name"}
                </div>
                <div className="mx-auto my-1 h-0.5 w-48 bg-brand/30 rounded-full" />
                <p className="text-[10px] text-slate2-400">
                  Digitally verified reviewer endorsement
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Attestation Checkbox */}
        <label className="flex items-start gap-3 rounded-lg border border-slate2-200/90 bg-white p-3 cursor-pointer select-none transition-colors hover:bg-slate2-50">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
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

        {/* Error Alert */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
            <AlertCircle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2 border-t border-slate2-100 pt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={submitting}
            className="text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleSubmit}
            disabled={submitting || !agreed || (tab === "draw" ? !hasDrawn : !typedName.trim())}
            className="bg-brand hover:bg-brand-light text-white text-xs py-2 px-4 shadow-sm inline-flex items-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Submitting Approval...
              </>
            ) : (
              <>
                <ShieldCheck size={15} /> Sign & Approve Meeting
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
