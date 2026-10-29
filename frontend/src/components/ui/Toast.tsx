import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "info";

export interface ToastProps {
  message: string | null;
  type?: ToastType;
  duration?: number;
  onClose: () => void;
}

export function Toast({
  message,
  type = "success",
  duration = 4000,
  onClose,
}: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onClose]);

  if (!message || typeof document === "undefined") return null;

  const styles = {
    success: {
      bg: "bg-emerald-50/95 border-emerald-200 text-emerald-950",
      icon: <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />,
      ring: "ring-emerald-500/10",
    },
    error: {
      bg: "bg-rose-50/95 border-rose-200 text-rose-950",
      icon: <AlertCircle size={18} className="shrink-0 text-rose-600" />,
      ring: "ring-rose-500/10",
    },
    info: {
      bg: "bg-brand/5 border-brand/20 text-brand-dark",
      icon: <Info size={18} className="shrink-0 text-brand" />,
      ring: "ring-brand/10",
    },
  }[type];

  const toastContent = (
    <div
      role="alert"
      className={`fixed top-5 right-5 z-[9999] flex max-w-md items-center gap-3 rounded-xl border p-4 shadow-xl backdrop-blur-xs ring-1 transition-all animate-in slide-in-from-top-2 fade-in duration-200 ${styles.bg} ${styles.ring}`}
    >
      {styles.icon}
      <div className="flex-1 text-xs sm:text-sm font-medium leading-relaxed">
        {message}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded-md p-1 text-slate2-400 hover:bg-black/5 hover:text-slate2-700 transition-colors focus:outline-none"
        title="Dismiss notification"
      >
        <X size={15} />
      </button>
    </div>
  );

  return createPortal(toastContent, document.body);
}
