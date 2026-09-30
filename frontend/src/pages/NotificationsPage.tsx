import React, { useEffect, useState } from "react";
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

  const unread = notifications.filter((n) => !n.isRead).length;

  return (
    <Card>
      <CardHeader
        title="Notifications"
        subtitle="Meeting invites, assigned tasks and decisions from across Ahununu Logistics"
        action={
          unread > 0 && (
            <Button variant="secondary" onClick={markAllRead}>
              <CheckCheck size={14} /> Mark all read
            </Button>
          )
        }
      />
      {loading ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-slate2-100" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <EmptyState title="No notifications" description="You'll see meeting invites, cancellations and task assignments here." />
      ) : (
        <div className="divide-y divide-slate2-100">
          {notifications.map((n) => {
            const Icon = ICONS[n.type] || Bell;
            const isCancelled = n.type === "MEETING_CANCELLED";
            return (
              <button
                key={n.id}
                onClick={() => {
                  markRead(n.id);
                  if (n.link) navigate(n.link);
                }}
                className={`flex w-full items-start gap-3 px-5 py-3.5 text-left transition-colors hover:bg-slate2-50 ${
                  !n.isRead ? (isCancelled ? "bg-rose-50/40" : "bg-brand/5") : ""
                }`}
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    isCancelled
                      ? "bg-rose-100 text-rose-600"
                      : "bg-brand/10 text-brand"
                  }`}
                >
                  <Icon size={15} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-semibold ${isCancelled ? "text-rose-950" : "text-slate2-800"}`}>
                      {n.title}
                    </p>
                    {isCancelled && (
                      <span className="rounded bg-rose-100 px-1.5 py-0.2 text-[10px] font-semibold text-rose-700 uppercase tracking-wide">
                        Cancelled
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-slate2-600">{n.message}</p>
                  <p className="mt-1 text-[11px] text-slate2-400">{new Date(n.createdAt).toLocaleString()}</p>
                </div>
                {!n.isRead && (
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${isCancelled ? "bg-rose-500" : "bg-brand"}`} />
                )}
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}
