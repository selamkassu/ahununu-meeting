import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { api } from "../api/client";
import { useAuth } from "./AuthContext";
import type { Notification } from "../types";

interface NotificationContextValue {
  notifications: Notification[];
  unreadCount: number;
  pendingApprovalsCount: number;
  setPendingApprovalsCount: React.Dispatch<React.SetStateAction<number>>;
  refreshPendingApprovals: () => Promise<void>;
  loading: boolean;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  refresh: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(
  undefined,
);

const POLL_INTERVAL_MS = 30_000; // 30 seconds

export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, hasPermission } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canApproveUsers = hasPermission("users:approve");

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const data = await api.get<Notification[]>("/notifications");
      setNotifications(data);
    } catch {
      // silently fail — don't break the app for notification errors
    }
  }, [user]);

  const refreshPendingApprovals = useCallback(async () => {
    if (!user || !canApproveUsers) {
      setPendingApprovalsCount(0);
      return;
    }
    try {
      const res = await api.get<{ count: number }>("/users/approvals/count");
      if (typeof res?.count === "number") {
        setPendingApprovalsCount(res.count);
      }
    } catch {
      // silently fail
    }
  }, [user, canApproveUsers]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([fetchNotifications(), refreshPendingApprovals()]);
    } finally {
      setLoading(false);
    }
  }, [fetchNotifications, refreshPendingApprovals]);

  // Initial load + polling
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setPendingApprovalsCount(0);
      return;
    }

    fetchNotifications();
    refreshPendingApprovals();

    timerRef.current = setInterval(() => {
      fetchNotifications();
      refreshPendingApprovals();
    }, POLL_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [user, fetchNotifications, refreshPendingApprovals]);

  const markRead = useCallback(async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
    } catch {
      // ignore
    }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await api.patch("/notifications/read-all");
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {
      // ignore
    }
  }, []);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const value = React.useMemo(
    () => ({
      notifications,
      unreadCount,
      pendingApprovalsCount,
      setPendingApprovalsCount,
      refreshPendingApprovals,
      loading,
      markRead,
      markAllRead,
      refresh,
    }),
    [
      notifications,
      unreadCount,
      pendingApprovalsCount,
      refreshPendingApprovals,
      loading,
      markRead,
      markAllRead,
      refresh,
    ]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx)
    throw new Error(
      "useNotifications must be used within a NotificationProvider",
    );
  return ctx;
}
