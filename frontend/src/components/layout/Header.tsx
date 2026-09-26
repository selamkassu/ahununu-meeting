import React, { useEffect, useRef, useState } from "react";
import {
  Bell,
  Menu,
  LogOut,
  ChevronDown,
  CalendarDays,
  Clock,
  CheckCircle2,
  MailOpen,
} from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useNotifications } from "../../context/NotificationContext";
import { Avatar } from "../ui/Primitives";

// Map notification types to a user-friendly label
const TYPE_LABELS: Record<string, string> = {
  MEETING_INVITATION: "Meeting Invitation",
  MEETING_UPDATED: "Meeting Updated",
  MEETING_CANCELLED: "Meeting Cancelled",
  ACTION_ITEM_ASSIGNED: "Action Item Assigned",
  MEETING_REMINDER: "Meeting Reminder",
};

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function Header({
  title,
  onMenuClick,
}: {
  title: string;
  onMenuClick: () => void;
}) {
  const { user, logout } = useAuth();
  const { notifications, unreadCount, markRead, markAllRead } =
    useNotifications();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (
        notifRef.current &&
        !notifRef.current.contains(e.target as Node)
      )
        setNotifOpen(false);
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const displayCount = unreadCount > 99 ? "99+" : unreadCount;

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate2-200 bg-white/90 px-4 backdrop-blur lg:px-6 no-print">
      {/* Left: menu toggle + page title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="focus-ring rounded-md p-1.5 text-slate2-500 hover:bg-slate2-100 lg:hidden"
        >
          <Menu size={20} />
        </button>
        <div>
          <h1 className="font-display text-lg font-semibold text-slate2-800">
            {title}
          </h1>
          <p className="hidden text-[11px] text-slate2-400 sm:block">
            Ahununu Logistics – Meeting Management Portal
          </p>
        </div>
      </div>

      {/* Right: notification bell + user menu */}
      <div className="flex items-center gap-2">
        {/* ── Notification Bell ── */}
        <div className="relative" ref={notifRef}>
          <button
            id="notification-bell-btn"
            onClick={() => setNotifOpen((v) => !v)}
            className="focus-ring relative rounded-full p-2 text-slate2-500 hover:bg-slate2-100"
            aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
          >
            <Bell size={19} />
            {/* Red unread count badge */}
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
                {displayCount}
              </span>
            )}
          </button>

          {/* ── Notification Dropdown Panel ── */}
          {notifOpen && (
            <div className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-2rem)] rounded-xl border border-slate2-200 bg-white shadow-2xl">
              {/* Header row */}
              <div className="flex items-center justify-between border-b border-slate2-100 px-4 py-3">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate2-800">
                    Notifications
                  </p>
                  {unreadCount > 0 && (
                    <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
                      {displayCount} unread
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    id="mark-all-read-btn"
                    onClick={markAllRead}
                    className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                  >
                    <CheckCircle2 size={12} />
                    Mark all as read
                  </button>
                )}
              </div>

              {/* Notification list */}
              <div className="max-h-[440px] overflow-y-auto divide-y divide-slate2-50">
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                    <Bell
                      size={32}
                      className="text-slate2-200"
                      strokeWidth={1.5}
                    />
                    <p className="text-sm font-medium text-slate2-500">
                      You're all caught up
                    </p>
                    <p className="text-xs text-slate2-400">
                      No notifications yet.
                    </p>
                  </div>
                ) : (
                  notifications.slice(0, 10).map((n) => (
                    <div
                      key={n.id}
                      className={`group relative px-4 py-3.5 transition-colors hover:bg-slate2-50/80 ${
                        !n.isRead ? "bg-brand/5" : ""
                      }`}
                    >
                      {/* Unread dot indicator */}
                      {!n.isRead && (
                        <span className="absolute left-1.5 top-4 h-1.5 w-1.5 rounded-full bg-brand" />
                      )}

                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          {/* Type label + time */}
                          <div className="flex items-center gap-2 mb-0.5">
                            <span
                              className={`text-[10px] font-semibold uppercase tracking-wide ${
                                !n.isRead
                                  ? "text-brand"
                                  : "text-slate2-400"
                              }`}
                            >
                              {TYPE_LABELS[n.type] || n.type}
                            </span>
                            <span className="text-[10px] text-slate2-400">
                              {formatRelativeTime(n.createdAt)}
                            </span>
                          </div>

                          {/* Title */}
                          <p
                            className={`text-xs font-semibold leading-snug ${
                              !n.isRead
                                ? "text-slate2-900"
                                : "text-slate2-600"
                            }`}
                          >
                            {n.title}
                          </p>

                          {/* Message */}
                          <p className="mt-0.5 text-xs text-slate2-500 leading-relaxed line-clamp-2">
                            {n.message}
                          </p>

                          {/* Meeting link */}
                          {n.link && (
                            <Link
                              to={n.link}
                              onClick={() => setNotifOpen(false)}
                              className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline"
                            >
                              <CalendarDays size={11} />
                              View Meeting
                            </Link>
                          )}
                        </div>

                        {/* Mark as read button */}
                        {!n.isRead && (
                          <button
                            id={`mark-read-${n.id}`}
                            onClick={() => markRead(n.id)}
                            title="Mark as read"
                            className="mt-0.5 shrink-0 rounded-md p-1 text-slate2-400 hover:bg-slate2-200 hover:text-slate2-700 transition-colors"
                          >
                            <MailOpen size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              {notifications.length > 0 && (
                <div className="border-t border-slate2-100 px-4 py-2.5 text-center">
                  <Link
                    to="/notifications"
                    onClick={() => setNotifOpen(false)}
                    className="text-xs font-medium text-brand hover:underline"
                  >
                    View all notifications
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── User menu ── */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="focus-ring flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2 hover:bg-slate2-100"
          >
            {user && <Avatar name={user.name} color={user.avatarColor || "#AED580"} />}
            <div className="hidden text-left sm:block">
              <p className="text-xs font-bold text-slate2-800">
                {user?.name}
              </p>
              <p className="text-[10px] text-slate2-400">
                {user?.role?.name || "Ahununu Logistics"}
              </p>
            </div>
            <ChevronDown size={14} className="text-slate2-400" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-48 rounded-xl border border-slate2-200 bg-white py-1 shadow-xl">
              <button
                onClick={() => {
                  logout();
                  navigate("/login");
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate2-600 hover:bg-slate2-50"
              >
                <LogOut size={15} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
