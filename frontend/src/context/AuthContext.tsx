import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { api, getToken, setToken } from "../api/client";
import type { User } from "../types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    name: string;
    email: string;
    password: string;
    departmentId?: string;
    jobTitle?: string;
  }) => Promise<{ isPending?: boolean; message?: string }>;
  loginWithGoogle: (
    credential: string,
    mode?: "signin" | "signup" | "auto",
    meta?: { departmentId?: string; jobTitle?: string }
  ) => Promise<{ isNewUser: boolean; isPending?: boolean; message?: string }>;
  logout: () => void;
  updateUser: (user: User) => void;
  refreshUser: () => Promise<void>;
  /** Check if the current user's role includes the given permission */
  hasPermission: (permission: string) => boolean;
  /** Check if the current user's role includes ANY of the given permissions */
  hasAnyPermission: (...permissions: string[]) => boolean;
  googleClientId: string;
  isGoogleConfigured: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [googleClientId, setGoogleClientId] = useState<string>(
    (import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim()
  );
  const [isGoogleConfigured, setIsGoogleConfigured] = useState<boolean>(
    Boolean((import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim())
  );

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
    // Also fetch server-side Google config if not supplied via frontend env
    api.get<{ clientId: string; isConfigured: boolean }>("/auth/google/config")
      .then((cfg) => {
        if (cfg?.clientId) {
          setGoogleClientId(cfg.clientId);
          setIsGoogleConfigured(cfg.isConfigured);
        }
      })
      .catch(() => {});
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

  const register = useCallback(
    async (data: {
      name: string;
      email: string;
      password: string;
      departmentId?: string;
      jobTitle?: string;
    }) => {
      setError(null);
      try {
        const res = await api.post<{ token?: string; user?: User; isPending?: boolean; message?: string }>("/auth/register", data);
        if (res.token && res.user) {
          setToken(res.token);
          setUser(res.user);
        }
        return res;
      } catch (e: any) {
        setError(e.message || "Registration failed. Please check your details.");
        throw e;
      }
    },
    []
  );

  const loginWithGoogle = useCallback(
    async (
      credential: string,
      mode: "signin" | "signup" | "auto" = "auto",
      meta?: { departmentId?: string; jobTitle?: string }
    ) => {
      setError(null);
      try {
        const res = await api.post<{
          token?: string;
          user?: User;
          isNewUser: boolean;
          isPending?: boolean;
          message?: string;
        }>("/auth/google", {
          credential,
          mode,
          departmentId: meta?.departmentId,
          jobTitle: meta?.jobTitle,
        });
        if (res.token && res.user) {
          setToken(res.token);
          setUser(res.user);
        }
        return { isNewUser: res.isNewUser, isPending: res.isPending, message: res.message };
      } catch (e: any) {
        const msg = e.message || "Google authentication failed. Please try again.";
        setError(msg);
        throw e;
      }
    },
    []
  );

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
    (permission: string) => {
      if (permissionSet.has(permission)) return true;
      if (permissionSet.has("ADMIN_OVERRIDE")) return true;
      // If base permission is checked without tier, check if user has any scoped variant (:all, :dept, :own)
      if (!permission.endsWith(":all") && !permission.endsWith(":dept") && !permission.endsWith(":own")) {
        return (
          permissionSet.has(`${permission}:all`) ||
          permissionSet.has(`${permission}:dept`) ||
          permissionSet.has(`${permission}:own`)
        );
      }
      return false;
    },
    [permissionSet]
  );

  const hasAnyPermission = useCallback(
    (...permissions: string[]) => permissions.some((p) => hasPermission(p)),
    [hasPermission]
  );

  const updateUser = useCallback((updated: User) => {
    setUser(updated);
  }, []);

  const refreshUser = useCallback(async () => {
    await loadMe();
  }, [loadMe]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        login,
        register,
        loginWithGoogle,
        logout,
        updateUser,
        refreshUser,
        hasPermission,
        hasAnyPermission,
        googleClientId,
        isGoogleConfigured,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
