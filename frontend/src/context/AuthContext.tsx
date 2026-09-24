import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { api, getToken, setToken } from "../api/client";
import type { User } from "../types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Check if the current user's role includes the given permission */
  hasPermission: (permission: string) => boolean;
  /** Check if the current user's role includes ANY of the given permissions */
  hasAnyPermission: (...permissions: string[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMe = useCallback(async () => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    try {
      const me = await api.get<User>("/auth/me");
      setUser(me);
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const res = await api.post<{ token: string; user: User }>("/auth/login", { email, password });
      setToken(res.token);
      setUser(res.user);
    } catch (e: any) {
      setError(e.message || "Sign-in failed. Check your credentials and try again.");
      throw e;
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  /** Memoized set of the current user's permissions for O(1) lookups */
  const permissionSet = useMemo(() => {
    const perms = user?.role?.permissions || [];
    return new Set(perms);
  }, [user]);

  const hasPermission = useCallback(
    (permission: string) => permissionSet.has(permission),
    [permissionSet]
  );

  const hasAnyPermission = useCallback(
    (...permissions: string[]) => permissions.some((p) => permissionSet.has(p)),
    [permissionSet]
  );

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout, hasPermission, hasAnyPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
