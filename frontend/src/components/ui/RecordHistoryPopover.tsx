import React, { useState, useRef, useEffect, useId, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Clock,
  CheckCircle2,
  Calendar,
  FileSignature,
  ShieldCheck,
  Unlock,
  AlertCircle,
  X,
} from "lucide-react";

export interface StatusHistoryEntry {
  id?: string;
  status: string;
  timestamp: string | Date;
  userName?: string;
  userRole?: string;
  note?: string;
  isCurrent?: boolean;
  variant?: "brand" | "success" | "warning" | "danger" | "neutral";
}

export interface RecordHistoryPopoverProps {
  /** Optional record identifier to display in header (e.g. "MTG-2026-0048") */
  recordId?: string;
  /** Explicit list of chronological status entries */
  history?: StatusHistoryEntry[];
  /** Optional meeting object to automatically extract history from */
  meeting?: {
    id: string;
    code: string;
    status: string;
    createdAt?: string | Date;
    date?: string | Date;
    organizer?: { name?: string; role?: any } | null;
    signaturesRequestedAt?: string | Date | null;
    approvedAt?: string | Date | null;
    approvedBy?: { name?: string } | null;
    attendanceFinalizedAt?: string | Date | null;
    bypassReason?: string | null;
  };
  /** Placement alignment of the popover relative to trigger */
  align?: "left" | "right";
  /** Optional additional CSS class for trigger wrapper */
  className?: string;
  /** Custom trigger element (optional, defaults to small clock icon button) */
  customTrigger?: React.ReactNode;
}

/**
 * Format a date/time string into clean corporate format:
 * e.g., "Aug 17, 2026, 11:39 AM"
 */
function formatHistoryDate(dateInput: string | Date): string {
  if (!dateInput) return "—";
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return String(dateInput);

  const dateStr = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeStr = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return `${dateStr}, ${timeStr}`;
}

/**
 * Auto-generate chronological history entries from a meeting record
 */
function deriveMeetingHistory(meeting: NonNullable<RecordHistoryPopoverProps["meeting"]>): StatusHistoryEntry[] {
  const entries: StatusHistoryEntry[] = [];

  // 1. Created entry
  const organizerRole =
    typeof meeting.organizer?.role === "object" && meeting.organizer?.role !== null
      ? (meeting.organizer.role as { name: string }).name
      : typeof meeting.organizer?.role === "string"
        ? meeting.organizer.role
        : undefined;

  entries.push({
    id: "created",
    status: "Record Created",
    timestamp: meeting.createdAt || meeting.date || new Date(),
    userName: meeting.organizer?.name ? `by ${meeting.organizer.name}` : undefined,
    userRole: organizerRole,
    variant: "neutral",
  });

  // 2. Signatures Requested
  if (meeting.signaturesRequestedAt) {
    entries.push({
      id: "signatures_requested",
      status: "Signatures Requested",
      timestamp: meeting.signaturesRequestedAt,
      userName: meeting.organizer?.name ? `by ${meeting.organizer.name}` : undefined,
      variant: "warning",
    });
  }

  // 3. Attendance Finalized
  if (meeting.attendanceFinalizedAt) {
    entries.push({
      id: "attendance_finalized",
      status: "Attendance Finalized",
      timestamp: meeting.attendanceFinalizedAt,
      userName: meeting.organizer?.name ? `by ${meeting.organizer.name}` : undefined,
      variant: "neutral",
    });
  }

  // 4. Admin Unlock / Override (if present in bypassReason)
  if (meeting.bypassReason && meeting.bypassReason.toLowerCase().includes("unlocked")) {
    entries.push({
      id: "unlocked",
      status: "Administrative Override",
      timestamp: meeting.signaturesRequestedAt || meeting.createdAt || meeting.date || new Date(),
      note: meeting.bypassReason,
      variant: "warning",
    });
  }

  // 5. Approved
  if (meeting.approvedAt) {
    entries.push({
      id: "approved",
      status: "Certified & Approved",
      timestamp: meeting.approvedAt,
      userName: meeting.approvedBy?.name ? `by ${meeting.approvedBy.name}` : undefined,
      variant: "success",
    });
  }

  // 6. Current Status (if not covered above)
  const currentStatusLabel = meeting.status.replace(/_/g, " ");
  const isAlreadyLast = entries.some(
    (e) => e.status.toLowerCase() === currentStatusLabel.toLowerCase()
  );

  if (!isAlreadyLast && meeting.status !== "SCHEDULED") {
    entries.push({
      id: "current",
      status: currentStatusLabel,
      timestamp: new Date(),
      isCurrent: true,
      variant: meeting.status === "APPROVED" ? "success" : meeting.status === "CANCELLED" ? "danger" : "brand",
    });
  }

  // Mark the last item as current
  if (entries.length > 0) {
    entries[entries.length - 1].isCurrent = true;
  }

  return entries;
}

export function RecordHistoryPopover({
  recordId,
  history,
  meeting,
  align = "left",
  className = "",
  customTrigger,
}: RecordHistoryPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popoverId = useId();

  const [coords, setCoords] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    maxHeight: number;
  } | null>(null);

  // Combine provided history or auto-derive from meeting
  const resolvedHistory: StatusHistoryEntry[] = React.useMemo(() => {
    if (history && history.length > 0) return history;
    if (meeting) return deriveMeetingHistory(meeting);
    return [
      {
        status: "Record Created",
        timestamp: new Date(),
        userName: "by System",
        isCurrent: true,
      },
    ];
  }, [history, meeting]);

  // Dynamically position the portal popover relative to trigger button
  const updatePosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const popoverWidth = 320; // 20rem / sm:w-80
    const spacing = 6;
    const margin = 12;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Calculate horizontal alignment (respecting 'align' and viewport bounds)
    let left = align === "right" ? rect.right - popoverWidth : rect.left;
    if (left + popoverWidth > viewportWidth - margin) {
      left = viewportWidth - popoverWidth - margin;
    }
    if (left < margin) {
      left = margin;
    }

    // Calculate vertical placement: check room below vs room above
    const spaceBelow = viewportHeight - rect.bottom - spacing - margin;
    const spaceAbove = rect.top - spacing - margin;
    const placeAbove = spaceBelow < 280 && spaceAbove > spaceBelow;

    let top: number | undefined;
    let bottom: number | undefined;
    let maxHeight: number;

    if (placeAbove) {
      bottom = viewportHeight - rect.top + spacing;
      maxHeight = Math.max(160, Math.min(spaceAbove, 480));
    } else {
      top = rect.bottom + spacing;
      maxHeight = Math.max(160, Math.min(spaceBelow, 480));
    }

    setCoords({
      top,
      bottom,
      left,
      maxHeight,
    });
  }, [align]);

  // Recalculate position on open, scroll, or resize
  useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener("resize", handleScrollOrResize);
    window.addEventListener("scroll", handleScrollOrResize, true);

    return () => {
      window.removeEventListener("resize", handleScrollOrResize);
      window.removeEventListener("scroll", handleScrollOrResize, true);
    };
  }, [isOpen, updatePosition]);

  // Close when clicking outside both trigger and portal popover
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        containerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Hover handlers with debounce across trigger and portal popover
  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setIsOpen(true);
    }, 120);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 200);
  };

  const handlePopoverMouseEnter = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
  };

  const toggleOpen = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setIsOpen((prev) => !prev);
  };

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* ── Popover Trigger Button ── */}
      {customTrigger ? (
        <div onClick={toggleOpen} role="button" tabIndex={0} className="cursor-pointer">
          {customTrigger}
        </div>
      ) : (
        <button
          type="button"
          onClick={toggleOpen}
          aria-expanded={isOpen}
          aria-controls={popoverId}
          aria-haspopup="dialog"
          title="View Record History & Status Transitions"
          className={`focus-ring inline-flex items-center justify-center h-6 w-6 rounded-md text-slate2-400 hover:text-brand hover:bg-slate2-100 transition-colors cursor-pointer ${
            isOpen ? "text-brand bg-slate2-100" : ""
          }`}
        >
          <Clock size={14} className="shrink-0" />
          <span className="sr-only">View record status history</span>
        </button>
      )}

      {/* ── Floating Popover Card (Rendered via portal directly into document.body to avoid parent overflow:hidden clipping) ── */}
      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            id={popoverId}
            role="dialog"
            aria-label="Record History"
            onMouseEnter={handlePopoverMouseEnter}
            onMouseLeave={handleMouseLeave}
            style={{
              backgroundColor: "#ffffff",
              opacity: 1,
              position: "fixed",
              zIndex: 9999,
              left: coords ? `${coords.left}px` : undefined,
              top: coords?.top !== undefined ? `${coords.top}px` : undefined,
              bottom: coords?.bottom !== undefined ? `${coords.bottom}px` : undefined,
              maxHeight: coords ? `${coords.maxHeight}px` : "min(85vh, 480px)",
            }}
            className="w-72 sm:w-80 rounded-xl border border-slate2-200 bg-white shadow-2xl p-4 text-left animate-popover-in flex flex-col overflow-hidden"
          >
            {/* Popover Header */}
            <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate2-100 shrink-0">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-teal-50 text-brand">
                  <Clock size={13} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate2-900 tracking-tight leading-none">
                    Record History
                  </h4>
                  {recordId && (
                    <p className="text-[10px] font-mono text-slate2-400 mt-0.5 leading-none">
                      {recordId}
                    </p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-md p-1 text-slate2-400 hover:bg-slate2-100 hover:text-slate2-600 transition-colors cursor-pointer"
                aria-label="Close record history"
              >
                <X size={13} />
              </button>
            </div>

            {/* Chronological Timeline Track (Scrollable with overflow-y: auto) */}
            <div className="relative pl-3 space-y-4 overflow-y-auto pr-1 flex-1 min-h-0">
              {/* Vertical connector line */}
              <div className="absolute left-[17px] top-2 bottom-2 w-px bg-slate2-200" />

              {resolvedHistory.map((item, idx) => {
                // Visual styling based on variant or state
                let dotBg = "bg-slate2-300";
                let ringColor = "ring-white";

                if (item.isCurrent) {
                  dotBg = "bg-brand";
                  ringColor = "ring-slate2-100";
                } else if (item.variant === "success") {
                  dotBg = "bg-emerald-500";
                } else if (item.variant === "warning") {
                  dotBg = "bg-amber-500";
                } else if (item.variant === "danger") {
                  dotBg = "bg-rose-500";
                }

                return (
                  <div key={item.id || idx} className="relative flex items-start gap-3 group">
                    {/* Step Marker Dot */}
                    <div
                      className={`relative z-10 mt-1 h-2.5 w-2.5 rounded-full ring-4 ${dotBg} ${ringColor} shrink-0 transition-transform group-hover:scale-125`}
                    />

                    {/* Content Block */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2 flex-wrap">
                        <span
                          className={`text-xs font-semibold capitalize tracking-tight ${
                            item.isCurrent
                              ? "text-brand font-bold"
                              : "text-slate2-800"
                          }`}
                        >
                          {item.status}
                        </span>

                        {item.isCurrent && (
                          <span className="rounded bg-teal-50 text-brand px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider">
                            Current
                          </span>
                        )}
                      </div>

                      {/* Timestamp */}
                      <div className="flex items-center gap-1.5 text-[11px] text-slate2-500 mt-0.5">
                        <Calendar size={10} className="text-slate2-400 shrink-0" />
                        <span>{formatHistoryDate(item.timestamp)}</span>
                      </div>

                      {/* Performed by username */}
                      {item.userName && (
                        <p className="text-[11px] text-slate2-600 mt-0.5 font-medium truncate">
                          {item.userName.startsWith("by ") ? item.userName : `by ${item.userName}`}
                          {item.userRole && (
                            <span className="text-[10px] text-slate2-400 font-normal ml-1">
                              ({item.userRole})
                            </span>
                          )}
                        </p>
                      )}

                      {/* Optional Note / Reason */}
                      {item.note && (
                        <p className="mt-1 text-[10px] text-slate2-600 bg-slate2-50 border border-slate2-200 rounded-md p-1.5 leading-snug break-words">
                          {item.note}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer note */}
            <div className="mt-3 pt-2 border-t border-slate2-100 flex items-center justify-between text-[10px] text-slate2-400 shrink-0">
              <span>Chronological order</span>
              <span>{resolvedHistory.length} event{resolvedHistory.length === 1 ? "" : "s"}</span>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
