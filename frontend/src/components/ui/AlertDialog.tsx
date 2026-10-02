import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  createContext,
  useContext,
} from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";

export type AlertTone = "info" | "warning" | "danger" | "success";

export interface AlertDialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  message: React.ReactNode;
  detail?: string;
  tone?: AlertTone;
  confirmLabel?: string;
  cancelLabel?: string;
  isConfirm?: boolean;
  onConfirm?: () => void;
  closeOnBackdropClick?: boolean;
}

const TONE_CONFIG: Record<
  AlertTone,
  {
    icon: React.ElementType;
    iconBg: string;
    iconColor: string;
    iconRing: string;
    btnClass: string;
    defaultTitle: string;
  }
> = {
  warning: {
    icon: AlertTriangle,
    iconBg: "bg-amber-50 border-amber-200/90",
    iconColor: "text-amber-600",
    iconRing: "ring-amber-500/20",
    btnClass:
      "bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white shadow-xs focus-visible:ring-amber-500",
    defaultTitle: "Attention Required",
  },
  danger: {
    icon: AlertCircle,
    iconBg: "bg-rose-50 border-rose-200/90",
    iconColor: "text-rose-600",
    iconRing: "ring-rose-500/20",
    btnClass:
      "bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white shadow-xs focus-visible:ring-rose-500",
    defaultTitle: "Action Blocked",
  },
  success: {
    icon: CheckCircle2,
    iconBg: "bg-emerald-50 border-emerald-200/90",
    iconColor: "text-emerald-600",
    iconRing: "ring-emerald-500/20",
    btnClass:
      "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-xs focus-visible:ring-emerald-500",
    defaultTitle: "Operation Completed",
  },
  info: {
    icon: Info,
    iconBg: "bg-brand/10 border-brand/25",
    iconColor: "text-brand",
    iconRing: "ring-brand/20",
    btnClass:
      "bg-brand hover:bg-brand-dark active:bg-brand-dark text-white shadow-xs focus-visible:ring-brand",
    defaultTitle: "Information",
  },
};

/**
 * Clean, accessible modal dialog component designed as a replacement for window.alert() and window.confirm().
 */
export function AlertDialog({
  open,
  onClose,
  title,
  message,
  detail,
  tone = "info",
  confirmLabel = "Understood",
  cancelLabel = "Cancel",
  isConfirm = false,
  onConfirm,
  closeOnBackdropClick = true,
}: AlertDialogProps) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  // Lock body scroll while modal is open
  useEffect(() => {
    if (!open) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  // Autofocus primary confirmation button when opened
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        confirmBtnRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Handle keyboard navigation (Escape to close, Enter to confirm)
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const config = TONE_CONFIG[tone] || TONE_CONFIG.info;
  const IconComponent = config.icon;
  const displayTitle = title || config.defaultTitle;

  const handleConfirm = () => {
    if (onConfirm) onConfirm();
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && closeOnBackdropClick) {
      onClose();
    }
  };

  const dialogContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="alert-dialog-title"
      aria-describedby="alert-dialog-description"
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate2-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white p-6 shadow-2xl border border-slate2-200/90 ring-1 ring-black/5 animate-in zoom-in-95 duration-150"
      >
        {/* Close Button in corner */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute right-4 top-4 rounded-lg p-1 text-slate2-400 hover:bg-slate2-100 hover:text-slate2-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <X size={16} />
        </button>

        <div className="flex items-start gap-4">
          {/* Tone Icon Badge */}
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ring-4 ${config.iconBg} ${config.iconColor} ${config.iconRing}`}
          >
            <IconComponent size={22} className="shrink-0" />
          </div>

          <div className="flex-1 min-w-0 pr-2">
            <h3
              id="alert-dialog-title"
              className="text-base font-semibold text-slate2-900 font-display tracking-tight"
            >
              {displayTitle}
            </h3>
            <div
              id="alert-dialog-description"
              className="mt-2 text-xs sm:text-sm text-slate2-600 leading-relaxed font-normal whitespace-pre-line"
            >
              {message}
            </div>

            {/* Optional detail / reason box */}
            {detail && (
              <div className="mt-3 rounded-lg bg-slate2-50 border border-slate2-200/80 p-2.5 text-xs text-slate2-700 font-mono leading-normal break-words max-h-32 overflow-y-auto">
                {detail}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-6 flex flex-wrap-reverse items-center justify-end gap-2.5 pt-2 border-t border-slate2-100">
          {isConfirm && (
            <button
              ref={cancelBtnRef}
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl border border-slate2-300 bg-white px-4 py-2 text-xs sm:text-sm font-semibold text-slate2-700 hover:bg-slate2-50 active:bg-slate2-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate2-400"
            >
              {cancelLabel}
            </button>
          )}
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={handleConfirm}
            className={`w-full sm:w-auto inline-flex items-center justify-center rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${config.btnClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(dialogContent, document.body)
    : dialogContent;
}

// ----------------------------------------------------------------------
// Imperative Provider & Hook API (`useAlert`)
// ----------------------------------------------------------------------

export type AlertOptions =
  | string
  | {
      title?: string;
      message: React.ReactNode;
      detail?: string;
      tone?: AlertTone;
      confirmLabel?: string;
      closeOnBackdropClick?: boolean;
    };

export type ConfirmOptions = {
  title?: string;
  message: React.ReactNode;
  detail?: string;
  tone?: AlertTone;
  confirmLabel?: string;
  cancelLabel?: string;
  closeOnBackdropClick?: boolean;
};

interface AlertContextValue {
  /**
   * Drop-in replacement for window.alert(). Returns a Promise that resolves when dismissed.
   */
  alert: (options: AlertOptions) => Promise<void>;
  /**
   * Drop-in replacement for window.confirm(). Returns a Promise that resolves to true (confirmed) or false (cancelled).
   */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const AlertContext = createContext<AlertContextValue | null>(null);

/**
 * Global provider for the `useAlert()` hook.
 */
export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [dialogState, setDialogState] = useState<{
    open: boolean;
    title?: string;
    message: React.ReactNode;
    detail?: string;
    tone: AlertTone;
    confirmLabel: string;
    cancelLabel: string;
    isConfirm: boolean;
    closeOnBackdropClick: boolean;
    resolve: (value: boolean) => void;
  } | null>(null);

  const alert = useCallback((options: AlertOptions): Promise<void> => {
    return new Promise<void>((resolve) => {
      const opts = typeof options === "string" ? { message: options } : options;
      setDialogState({
        open: true,
        title: opts.title,
        message: opts.message,
        detail: opts.detail,
        tone: opts.tone || "info",
        confirmLabel: opts.confirmLabel || "OK",
        cancelLabel: "Cancel",
        isConfirm: false,
        closeOnBackdropClick: opts.closeOnBackdropClick !== false,
        resolve: () => resolve(),
      });
    });
  }, []);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setDialogState({
        open: true,
        title: options.title || "Please Confirm",
        message: options.message,
        detail: options.detail,
        tone: options.tone || "warning",
        confirmLabel: options.confirmLabel || "Confirm",
        cancelLabel: options.cancelLabel || "Cancel",
        isConfirm: true,
        closeOnBackdropClick: options.closeOnBackdropClick === true,
        resolve,
      });
    });
  }, []);

  const handleClose = () => {
    if (dialogState) {
      dialogState.resolve(false);
      setDialogState(null);
    }
  };

  const handleConfirm = () => {
    if (dialogState) {
      dialogState.resolve(true);
      setDialogState(null);
    }
  };

  return (
    <AlertContext.Provider value={{ alert, confirm }}>
      {children}
      {dialogState && (
        <AlertDialog
          open={dialogState.open}
          onClose={handleClose}
          onConfirm={handleConfirm}
          title={dialogState.title}
          message={dialogState.message}
          detail={dialogState.detail}
          tone={dialogState.tone}
          confirmLabel={dialogState.confirmLabel}
          cancelLabel={dialogState.cancelLabel}
          isConfirm={dialogState.isConfirm}
          closeOnBackdropClick={dialogState.closeOnBackdropClick}
        />
      )}
    </AlertContext.Provider>
  );
}

/**
 * Custom hook to show clean, modern alert and confirm modal dialogs without native window.alert().
 *
 * @example
 * ```tsx
 * const { alert, confirm } = useAlert();
 *
 * // Simple alert:
 * alert("Meeting completed successfully!");
 *
 * // Styled alert with tone:
 * await alert({
 *   title: "Completion Blocked",
 *   message: "At least one section must contain content.",
 *   tone: "warning",
 * });
 *
 * // Confirm dialog:
 * const shouldDelete = await confirm({
 *   title: "Delete Decision",
 *   message: "Are you sure you want to remove this record?",
 *   tone: "danger",
 *   confirmLabel: "Delete",
 * });
 * ```
 */
export function useAlert(): AlertContextValue {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error("useAlert must be used within an AlertProvider");
  }
  return context;
}
