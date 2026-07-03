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
import { usePathname, useRouter } from "next/navigation";

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

export type AccessDeniedReason =
  | "invite_required"
  | "disabled"
  | "expired_invite"
  | "revoked_invite"
  | "wrong_invite_email"
  | "not_invited";

export interface AuthState {
  loading: boolean;
  authenticated: boolean;
  authConfigured: boolean;
  authProvider: "auth0" | "test" | "disabled" | "none";
  auth0Authenticated: boolean;
  accessDenied: { reason: AccessDeniedReason; invitedEmail?: string } | null;
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
  auth0Authenticated: false,
  accessDenied: null,
  user: null,
  permissions: [],
};

const PUBLIC_PATHS = ["/login", "/access-denied", "/invite", "/auth"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(defaultState);
  const router = useRouter();
  const pathname = usePathname();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        setState({
          loading: false,
          authenticated: false,
          authConfigured: res.status === 401,
          authProvider: "none",
          auth0Authenticated: false,
          accessDenied: null,
          user: null,
          permissions: [],
        });
        return;
      }
      const data = (await res.json()) as AuthState & {
        user: AuthUser | null;
        accessDenied?: { reason: AccessDeniedReason; invitedEmail?: string } | null;
        auth0Authenticated?: boolean;
      };
      setState({
        loading: false,
        authenticated: Boolean(data.user),
        authConfigured: Boolean(data.authConfigured),
        authProvider: data.authProvider ?? "none",
        auth0Authenticated: Boolean(data.auth0Authenticated),
        accessDenied: data.accessDenied ?? null,
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

  useEffect(() => {
    if (state.loading) return;
    if (!state.auth0Authenticated || !state.accessDenied) return;
    if (pathname.startsWith("/access-denied")) return;

    const params = new URLSearchParams({ reason: state.accessDenied.reason });
    if (state.accessDenied.invitedEmail) {
      params.set("email", state.accessDenied.invitedEmail);
    }
    router.replace(`/access-denied?${params.toString()}`);
  }, [state.loading, state.auth0Authenticated, state.accessDenied, pathname, router]);

  useEffect(() => {
    if (state.loading) return;
    if (state.authenticated || !state.authConfigured) return;
    if (state.auth0Authenticated) return;
    if (isPublicPath(pathname)) return;
    router.replace("/login");
  }, [
    state.loading,
    state.authenticated,
    state.authConfigured,
    state.auth0Authenticated,
    pathname,
    router,
  ]);

  useEffect(() => {
    if (state.loading || !state.authenticated) return;
    if (pathname !== "/login") return;
    const returnTo = new URLSearchParams(window.location.search).get("returnTo")?.trim();
    router.replace(returnTo && returnTo.startsWith("/") ? returnTo : "/");
  }, [state.loading, state.authenticated, pathname, router]);

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
