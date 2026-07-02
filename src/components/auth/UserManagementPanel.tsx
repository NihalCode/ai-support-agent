"use client";

import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import type { UserRole } from "@/lib/auth/roles";
import { USER_ROLES } from "@/lib/auth/roles";

interface StoredUserRow {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  status: "active" | "disabled";
}

export function UserManagementPanel() {
  const { user: currentUser, hasPermission } = useAuth();
  const canWrite = hasPermission("users:write");
  const [users, setUsers] = useState<StoredUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/users");
      if (res.status === 403) {
        setError("You do not have permission to manage users.");
        setUsers([]);
        return;
      }
      if (!res.ok) {
        setError("Could not load users.");
        return;
      }
      const data = (await res.json()) as { users?: StoredUserRow[] };
      setUsers(data.users ?? []);
    } catch {
      setError("Could not load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  async function updateRole(userId: string, role: UserRole) {
    if (!canWrite) return;
    setBusyId(userId);
    setError(null);
    try {
      const res = await fetch("/api/auth/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Update failed");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <p style={{ color: "var(--muted)", fontSize: 13 }}>Loading users…</p>;
  }

  if (error) {
    return (
      <p style={{ color: "var(--muted)", fontSize: 13 }} data-testid="user-management-error">
        {error}
      </p>
    );
  }

  return (
    <div data-testid="user-management-panel">
      <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
        Users are provisioned on first Auth0 login. The first user in an organization becomes owner.
      </p>
      <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 11 }}>
            <th style={{ padding: "6px 8px" }}>Email</th>
            <th style={{ padding: "6px 8px" }}>Role</th>
            <th style={{ padding: "6px 8px" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} data-testid={`user-row-${u.id}`}>
              <td style={{ padding: "8px", borderTop: "1px solid var(--border)" }}>
                {u.email}
                {u.id === currentUser?.id ? " (you)" : ""}
              </td>
              <td style={{ padding: "8px", borderTop: "1px solid var(--border)" }}>
                {canWrite && u.id !== currentUser?.id ? (
                  <select
                    value={u.role}
                    disabled={busyId === u.id}
                    onChange={(e) => void updateRole(u.id, e.target.value as UserRole)}
                    data-testid={`user-role-${u.id}`}
                  >
                    {USER_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                ) : (
                  u.role
                )}
              </td>
              <td style={{ padding: "8px", borderTop: "1px solid var(--border)" }}>{u.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {users.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--muted)" }}>No users yet — sign in with Auth0 to create the first account.</p>
      )}
    </div>
  );
}
