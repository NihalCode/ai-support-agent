"use client";

import { useAuth } from "./AuthProvider";

export function UserMenu() {
  const { loading, user, authConfigured, authenticated, loginUrl, logoutUrl } = useAuth();

  if (loading) {
    return (
      <span className="ide-user-menu" data-testid="user-menu-loading" style={{ fontSize: 12, color: "var(--muted)" }}>
        …
      </span>
    );
  }

  if (!authConfigured) {
    return (
      <span
        className="ide-user-menu"
        data-testid="user-menu-local"
        style={{ fontSize: 12, color: "var(--muted)" }}
        title="Auth0 not configured — running without login"
      >
        {user?.name ?? user?.email ?? "Local"}
      </span>
    );
  }

  if (!authenticated || !user) {
    return (
      <a
        className="ide-tree-item"
        href={loginUrl}
        data-testid="user-menu-login"
        style={{ width: "auto", padding: "4px 10px", textDecoration: "none" }}
      >
        Sign in
      </a>
    );
  }

  return (
    <div className="ide-user-menu flex items-center gap-2 min-w-0 max-w-[220px]" data-testid="user-menu">
      <span
        className="text-xs text-slate-400 truncate"
        title={user.email}
      >
        {user.name ?? user.email}
        <span className="opacity-70"> · {user.role}</span>
      </span>
      <a
        className="ide-tree-item shrink-0 rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-300 hover:bg-white/5 no-underline"
        href={logoutUrl}
        data-testid="user-menu-logout"
      >
        Sign out
      </a>
    </div>
  );
}
