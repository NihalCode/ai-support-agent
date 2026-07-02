"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { Permission, UserRole } from "@/lib/auth/roles";
import { canUseDeveloperMode } from "@/lib/auth/roles";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  orgId: string;
  status: "active" | "disabled";
  picture?: string | null;
}

export interface AuthState {
  loading: boolean;
  authenticated: boolean;
  authConfigured: boolean;
  authProvider: "auth0" | "test" | "disabled" | "none";
  user: AuthUser | null;
  permissions: Permission[];
}

interface AuthContextValue extends AuthState {
  refresh: () => Promise<void>;
  hasPermission: (permission: Permission) => boolean;
  canUseDeveloperMode: boolean;
  loginUrl: string;
  logoutUrl: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const defaultState: AuthState = {
  loading: true,
  authenticated: false,
  authConfigured: false,
  authProvider: "none",
  user: null,
  permissions: [],
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(defaultState);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        setState({
          loading: false,
          authenticated: false,
          authConfigured: res.status === 401,
          authProvider: "none",
          user: null,
          permissions: [],
        });
        return;
      }
      const data = (await res.json()) as AuthState & { user: AuthUser | null };
      setState({
        loading: false,
        authenticated: Boolean(data.user),
        authConfigured: Boolean(data.authConfigured),
        authProvider: data.authProvider ?? "none",
        user: data.user,
        permissions: data.permissions ?? [],
      });
    } catch {
      setState({ ...defaultState, loading: false });
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void refresh();
    });
  }, [refresh]);

  const hasPermission = useCallback(
    (permission: Permission) => state.permissions.includes(permission),
    [state.permissions]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      refresh,
      hasPermission,
      canUseDeveloperMode: state.user ? canUseDeveloperMode(state.user.role) : true,
      loginUrl: "/auth/login",
      logoutUrl: "/auth/logout",
    }),
    [state, refresh, hasPermission]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
