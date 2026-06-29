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
    <div className="ide-user-menu" data-testid="user-menu" style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 12, color: "var(--muted)" }} title={user.email}>
        {user.name ?? user.email}
        <span style={{ opacity: 0.7 }}> · {user.role}</span>
      </span>
      <a
        className="ide-tree-item"
        href={logoutUrl}
        data-testid="user-menu-logout"
        style={{ width: "auto", padding: "4px 8px", fontSize: 12, textDecoration: "none" }}
      >
        Sign out
      </a>
    </div>
  );
}
