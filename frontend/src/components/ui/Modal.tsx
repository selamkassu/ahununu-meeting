import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  wide?: boolean;
  className?: string;
  closeOnBackdropClick?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  wide = false,
  className = "",
  closeOnBackdropClick = true,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Lock body scroll while modal is open
  useEffect(() => {
    if (!open) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  // Handle keyboard navigation (Escape to close)
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

  if (!open || typeof document === "undefined") return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && closeOnBackdropClick) {
      onClose();
    }
  };

  const modalElement = (
    <div
      role="dialog"
      aria-modal="true"
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate2-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150"
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full ${
          wide ? "max-w-2xl" : "max-w-lg"
        } my-auto rounded-2xl bg-white shadow-2xl border border-slate2-200/90 ring-1 ring-black/5 flex flex-col max-h-[calc(100vh-3rem)] overflow-hidden animate-in zoom-in-95 duration-150 ${className}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate2-100 px-6 py-4 bg-slate2-50/70 shrink-0">
          <div>
            <h3 className="font-display text-base font-semibold text-slate2-900 tracking-tight">
              {title}
            </h3>
            {subtitle && (
              <p className="mt-0.5 text-xs text-slate2-500 font-normal">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="focus-ring rounded-lg p-1.5 text-slate2-400 hover:bg-slate2-100 hover:text-slate2-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );

  return createPortal(modalElement, document.body);
}
