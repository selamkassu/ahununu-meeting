import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  CalendarDays,
  CalendarX,
  ListChecks,
  Gavel,
  AlertOctagon,
  CheckCheck,
  FileCheck,
  Trash2,
} from "lucide-react";
import { api } from "../api/client";
import type { Notification } from "../types";
import { Card, CardHeader, Button, EmptyState } from "../components/ui/Primitives";

const ICONS: Record<string, React.ElementType> = {
  MEETING_INVITE: CalendarDays,
  MEETING_INVITATION: CalendarDays,
  MEETING_CANCELLED: CalendarX,
  MEETING_SIGN_REQUEST: FileCheck,
  MEETING_REMINDER: CalendarDays,
  ACTION_ASSIGNED: ListChecks,
  ACTION_ITEM_ASSIGNED: ListChecks,
  ACTION_DUE_SOON: ListChecks,
  ACTION_OVERDUE: AlertOctagon,
  DECISION_LOGGED: Gavel,
};

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"ALL" | "UNREAD">("ALL");

  const load = () => {
    setLoading(true);
    api
      .get<Notification[]>("/notifications")
      .then(setNotifications)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const markAllRead = async () => {
    await api.patch("/notifications/read-all");
    load();
  };

  const markRead = async (id: string) => {
    await api.patch(`/notifications/${id}/read`);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  };

  const clearRead = async () => {
    await api.delete("/notifications");
    setNotifications((prev) => prev.filter((n) => !n.isRead));
  };

  const deleteSingle = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await api.delete(`/notifications/${id}`);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const unreadCount = useMemo(() => notifications.filter((n) => !n.isRead).length, [notifications]);
  const readCount = useMemo(() => notifications.filter((n) => n.isRead).length, [notifications]);

  const displayedNotifications = useMemo(() => {
    if (filter === "UNREAD") return notifications.filter((n) => !n.isRead);
    return notifications;
  }, [notifications, filter]);

  return (
    <Card>
      <CardHeader
        title="Notifications"
        subtitle="Meeting invites, assigned tasks and decisions from across Ahununu Logistics"
        action={
          <div className="flex flex-wrap items-center gap-2">
            {unreadCount > 0 && (
              <Button variant="secondary" onClick={markAllRead} className="text-xs">
                <CheckCheck size={14} /> Mark all read
              </Button>
            )}
            {readCount > 0 && (
              <Button variant="secondary" onClick={clearRead} className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50">
                <Trash2 size={13} /> Clear read ({readCount})
              </Button>
            )}
          </div>
        }
      />

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate2-100 bg-slate2-50/50 px-5 py-2.5 text-xs">
        <button
          type="button"
          onClick={() => setFilter("ALL")}
          className={`px-3 py-1 rounded-full font-medium transition-colors cursor-pointer ${
            filter === "ALL"
              ? "bg-[#0B7A6B] text-white shadow-2xs font-semibold"
              : "bg-white text-slate2-600 border border-slate2-200 hover:bg-slate2-50"
          }`}
        >
          All ({notifications.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter("UNREAD")}
          className={`px-3 py-1 rounded-full font-medium transition-colors cursor-pointer ${
            filter === "UNREAD"
              ? "bg-[#0B7A6B] text-white shadow-2xs font-semibold"
              : "bg-white text-slate2-600 border border-slate2-200 hover:bg-slate2-50"
          }`}
        >
          Unread ({unreadCount})
        </button>
      </div>

      {loading ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-slate2-100" />
          ))}
        </div>
      ) : displayedNotifications.length === 0 ? (
        <EmptyState
          title={notifications.length === 0 ? "No notifications" : "No unread notifications"}
          description={
            notifications.length === 0
              ? "You'll see meeting invites, cancellations and task assignments here."
              : "You have reviewed all incoming notifications."
          }
        />
      ) : (
        <div className="divide-y divide-slate2-100">
          {displayedNotifications.map((n) => {
            const Icon = ICONS[n.type] || Bell;
            const isCancelled = n.type === "MEETING_CANCELLED";
            return (
              <div
                key={n.id}
                onClick={() => {
                  markRead(n.id);
                  if (n.link) navigate(n.link);
                }}
                className={`group flex w-full items-start justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-slate2-50 cursor-pointer ${
                  !n.isRead ? (isCancelled ? "bg-rose-50/40" : "bg-brand/5") : ""
                }`}
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                      isCancelled
                        ? "bg-rose-100 text-rose-600"
                        : "bg-brand/10 text-brand"
                    }`}
                  >
                    <Icon size={15} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-semibold truncate ${isCancelled ? "text-rose-950" : "text-slate2-800"}`}>
                        {n.title}
                      </p>
                      {isCancelled && (
                        <span className="rounded bg-rose-100 px-1.5 py-0.2 text-[10px] font-semibold text-rose-700 uppercase tracking-wide">
                          Cancelled
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-slate2-600 line-clamp-2">{n.message}</p>
                    <p className="mt-1 text-[11px] text-slate2-400">{new Date(n.createdAt).toLocaleString()}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-center">
                  {!n.isRead && (
                    <span className={`h-2 w-2 rounded-full ${isCancelled ? "bg-rose-500" : "bg-brand"}`} />
                  )}
                  <button
                    type="button"
                    onClick={(e) => deleteSingle(e, n.id)}
                    title="Delete notification"
                    className="p-1 text-slate2-300 hover:text-rose-600 rounded transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
