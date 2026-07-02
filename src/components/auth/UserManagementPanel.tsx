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

interface StoredInviteRow {
  id: string;
  email: string;
  role: UserRole;
  status: "pending" | "accepted" | "expired" | "revoked";
  expiresAt: string;
  createdAt: string;
}

const ROLE_LABELS: Record<UserRole, string> = {
  owner: "Owner",
  admin: "Admin",
  developer: "Developer",
  support_agent: "Support Agent",
  viewer: "Viewer",
};

export function UserManagementPanel() {
  const { user: currentUser, hasPermission } = useAuth();
  const canWrite = hasPermission("users:write");
  const [users, setUsers] = useState<StoredUserRow[]>([]);
  const [invites, setInvites] = useState<StoredInviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("viewer");
  const [inviteExpiryDays, setInviteExpiryDays] = useState(7);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersRes, invitesRes] = await Promise.all([
        fetch("/api/auth/users"),
        fetch("/api/auth/invites"),
      ]);
      if (usersRes.status === 403 || invitesRes.status === 403) {
        setError("You do not have permission to manage users.");
        setUsers([]);
        setInvites([]);
        return;
      }
      if (!usersRes.ok) {
        setError("Could not load users.");
        return;
      }
      const usersData = (await usersRes.json()) as { users?: StoredUserRow[] };
      setUsers(usersData.users ?? []);
      if (invitesRes.ok) {
        const invitesData = (await invitesRes.json()) as { invites?: StoredInviteRow[] };
        setInvites(invitesData.invites ?? []);
      }
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

  async function updateStatus(userId: string, status: "active" | "disabled") {
    if (!canWrite) return;
    setBusyId(userId);
    setError(null);
    try {
      const res = await fetch("/api/auth/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, status }),
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

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!canWrite) return;
    setInviteBusy(true);
    setError(null);
    setLastInviteUrl(null);
    try {
      const res = await fetch("/api/auth/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
          expiryDays: inviteExpiryDays,
        }),
      });
      const data = (await res.json()) as { error?: string; inviteUrl?: string };
      if (!res.ok) {
        setError(data.error ?? "Invite failed");
        return;
      }
      setInviteEmail("");
      setLastInviteUrl(data.inviteUrl ?? null);
      await load();
    } finally {
      setInviteBusy(false);
    }
  }

  async function resendInvite(inviteId: string) {
    if (!canWrite) return;
    setBusyId(inviteId);
    setError(null);
    try {
      const res = await fetch(`/api/auth/invites/${inviteId}/resend`, { method: "POST" });
      const data = (await res.json()) as { error?: string; inviteUrl?: string };
      if (!res.ok) {
        setError(data.error ?? "Resend failed");
        return;
      }
      setLastInviteUrl(data.inviteUrl ?? null);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function revokeInvite(inviteId: string) {
    if (!canWrite) return;
    setBusyId(inviteId);
    setError(null);
    try {
      const res = await fetch(`/api/auth/invites/${inviteId}/revoke`, { method: "POST" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Revoke failed");
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

  if (error && users.length === 0 && invites.length === 0) {
    return (
      <p style={{ color: "var(--muted)", fontSize: 13 }} data-testid="user-management-error">
        {error}
      </p>
    );
  }

  const pendingInvites = invites.filter((i) => i.status === "pending");

  return (
    <div data-testid="user-management-panel">
      <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
        This workspace is invite-only. Users must be invited before they can sign in with Google or
        company email.
      </p>

      {error ? (
        <p style={{ color: "#b91c1c", fontSize: 13, marginBottom: 12 }} role="alert">
          {error}
        </p>
      ) : null}

      {canWrite ? (
        <form
          onSubmit={(e) => void sendInvite(e)}
          data-testid="invite-form"
          style={{
            display: "grid",
            gap: 10,
            marginBottom: 20,
            padding: 12,
            border: "1px solid var(--border)",
            borderRadius: 8,
          }}
        >
          <strong style={{ fontSize: 13 }}>Invite user</strong>
          <label style={{ fontSize: 12, display: "grid", gap: 4 }}>
            Email
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              data-testid="invite-email-input"
              style={{ padding: "6px 8px", fontSize: 13 }}
            />
          </label>
          <label style={{ fontSize: 12, display: "grid", gap: 4 }}>
            Role
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as UserRole)}
              data-testid="invite-role-select"
              style={{ padding: "6px 8px", fontSize: 13 }}
            >
              {USER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 12, display: "grid", gap: 4 }}>
            Expiration (days)
            <input
              type="number"
              min={1}
              max={90}
              value={inviteExpiryDays}
              onChange={(e) => setInviteExpiryDays(Number(e.target.value) || 7)}
              data-testid="invite-expiry-input"
              style={{ padding: "6px 8px", fontSize: 13, width: 100 }}
            />
          </label>
          <button
            type="submit"
            disabled={inviteBusy}
            data-testid="invite-send-button"
            style={{ padding: "8px 12px", fontSize: 13, width: "fit-content" }}
          >
            {inviteBusy ? "Sending…" : "Send invite"}
          </button>
          {lastInviteUrl ? (
            <div style={{ fontSize: 12 }} data-testid="invite-link-copy">
              <span style={{ color: "var(--muted)" }}>Invite link (copy and share): </span>
              <code style={{ wordBreak: "break-all" }}>{lastInviteUrl}</code>
            </div>
          ) : null}
        </form>
      ) : null}

      {canWrite && pendingInvites.length > 0 ? (
        <>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>Pending invites</h3>
          <table
            style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", marginBottom: 20 }}
            data-testid="pending-invites-table"
          >
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 11 }}>
                <th style={{ padding: "6px 8px" }}>Email</th>
                <th style={{ padding: "6px 8px" }}>Role</th>
                <th style={{ padding: "6px 8px" }}>Expires</th>
                <th style={{ padding: "6px 8px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingInvites.map((inv) => (
                <tr key={inv.id} data-testid={`invite-row-${inv.id}`}>
                  <td style={{ padding: "8px", borderTop: "1px solid var(--border)" }}>{inv.email}</td>
                  <td style={{ padding: "8px", borderTop: "1px solid var(--border)" }}>
                    {ROLE_LABELS[inv.role]}
                  </td>
                  <td style={{ padding: "8px", borderTop: "1px solid var(--border)" }}>
                    {new Date(inv.expiresAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: "8px", borderTop: "1px solid var(--border)" }}>
                    <button
                      type="button"
                      disabled={busyId === inv.id}
                      onClick={() => void resendInvite(inv.id)}
                      data-testid={`invite-resend-${inv.id}`}
                      style={{ marginRight: 8, fontSize: 12 }}
                    >
                      Resend
                    </button>
                    <button
                      type="button"
                      disabled={busyId === inv.id}
                      onClick={() => void revokeInvite(inv.id)}
                      data-testid={`invite-revoke-${inv.id}`}
                      style={{ fontSize: 12 }}
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      <h3 style={{ fontSize: 14, marginBottom: 8 }}>Active users</h3>
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
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                ) : (
                  ROLE_LABELS[u.role]
                )}
              </td>
              <td style={{ padding: "8px", borderTop: "1px solid var(--border)" }}>
                {canWrite && u.id !== currentUser?.id ? (
                  <select
                    value={u.status}
                    disabled={busyId === u.id}
                    onChange={(e) =>
                      void updateStatus(u.id, e.target.value as "active" | "disabled")
                    }
                    data-testid={`user-status-${u.id}`}
                  >
                    <option value="active">active</option>
                    <option value="disabled">disabled</option>
                  </select>
                ) : (
                  u.status
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {users.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--muted)" }}>
          No active users yet. Invite someone to get started.
        </p>
      )}
    </div>
  );
}
