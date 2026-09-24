import React, { useEffect, useState } from "react";
import { Bell, CalendarDays, ListChecks, Gavel, AlertOctagon, CheckCheck } from "lucide-react";
import { api } from "../api/client";
import type { Notification } from "../types";
import { Card, CardHeader, Button, EmptyState } from "../components/ui/Primitives";

const ICONS: Record<string, React.ElementType> = {
  MEETING_INVITE: CalendarDays,
  MEETING_REMINDER: CalendarDays,
  ACTION_ASSIGNED: ListChecks,
  ACTION_DUE_SOON: ListChecks,
  ACTION_OVERDUE: AlertOctagon,
  DECISION_LOGGED: Gavel,
};

export default function NotificationsPage() {
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
        <EmptyState title="No notifications" description="You'll see meeting invites and task assignments here." />
      ) : (
        <div className="divide-y divide-slate2-100">
          {notifications.map((n) => {
            const Icon = ICONS[n.type] || Bell;
            return (
              <button
                key={n.id}
                onClick={() => markRead(n.id)}
                className={`flex w-full items-start gap-3 px-5 py-3.5 text-left hover:bg-slate2-50 ${!n.isRead ? "bg-brand/5" : ""}`}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                  <Icon size={15} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate2-800">{n.title}</p>
                  <p className="mt-0.5 text-sm text-slate2-500">{n.message}</p>
                  <p className="mt-1 text-[11px] text-slate2-400">{new Date(n.createdAt).toLocaleString()}</p>
                </div>
                {!n.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />}
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}
