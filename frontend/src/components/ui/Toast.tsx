import React, { useEffect } from "react";
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

  if (!message) return null;

  const styles = {
    success: {
      bg: "bg-emerald-50 border-emerald-200 text-emerald-900",
      icon: <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />,
    },
    error: {
      bg: "bg-rose-50 border-rose-200 text-rose-900",
      icon: <AlertCircle size={18} className="shrink-0 text-rose-600" />,
    },
    info: {
      bg: "bg-brand/5 border-brand/20 text-brand-dark",
      icon: <Info size={18} className="shrink-0 text-brand" />,
    },
  }[type];

  return (
    <div
      className={`fixed top-5 right-5 z-50 flex max-w-md items-center gap-3 rounded-xl border p-4 shadow-xl transition-all ${styles.bg}`}
    >
      {styles.icon}
      <div className="flex-1 text-xs sm:text-sm font-medium leading-relaxed">
        {message}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded-md p-1 text-slate2-400 hover:bg-black/5 hover:text-slate2-700 transition-colors"
        title="Dismiss notification"
      >
        <X size={15} />
      </button>
    </div>
  );
}
