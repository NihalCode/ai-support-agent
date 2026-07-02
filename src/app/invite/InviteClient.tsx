"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const REASON_COPY: Record<string, { title: string; body: string }> = {
  not_found: {
    title: "Invalid invite",
    body: "This invite link is not valid. Ask an administrator for a new invite.",
  },
  revoked: {
    title: "Invite revoked",
    body: "This invite is no longer valid. Ask an administrator for a new invite.",
  },
  accepted: {
    title: "Invite already used",
    body: "This invite was already accepted. Sign in with your invited email.",
  },
  expired: {
    title: "Invite expired",
    body: "Ask an administrator to send a new invite.",
  },
  missing_token: {
    title: "Invalid invite link",
    body: "This invite link is incomplete. Ask an administrator for a new invite.",
  },
};

function loginHref(email: string, token: string): string {
  const returnTo = encodeURIComponent(`/invite?token=${encodeURIComponent(token)}`);
  return `/auth/login?returnTo=${returnTo}&login_hint=${encodeURIComponent(email)}`;
}

export default function InviteClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? null;
  const [loading, setLoading] = useState(true);
  const [valid, setValid] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [reason, setReason] = useState<string>("not_found");

  useEffect(() => {
    void (async () => {
      if (!token) {
        setLoading(false);
        setReason("missing_token");
        return;
      }
      try {
        const res = await fetch(`/api/auth/invites/validate?token=${encodeURIComponent(token)}`);
        const data = (await res.json()) as {
          valid?: boolean;
          reason?: string;
          email?: string;
        };
        setValid(Boolean(data.valid));
        setEmail(data.email ?? null);
        setReason(data.reason ?? (data.valid ? "" : "not_found"));
      } catch {
        setReason("not_found");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) {
    return (
      <main style={pageStyle}>
        <p style={{ color: "#666" }}>Validating invite…</p>
      </main>
    );
  }

  if (!valid || !email || !token) {
    const copy = REASON_COPY[reason] ?? REASON_COPY.not_found;
    return (
      <main style={pageStyle} data-testid="invite-invalid">
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>{copy.title}</h1>
        <p style={{ color: "#666", lineHeight: 1.6 }}>{copy.body}</p>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/login" style={primaryLinkStyle}>
          Go to login
        </a>
      </main>
    );
  }

  return (
    <main style={pageStyle} data-testid="invite-valid">
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>You&apos;re invited</h1>
      <p style={{ color: "#666", marginBottom: 8, lineHeight: 1.6 }}>
        This workspace invite was sent to:
      </p>
      <p style={{ fontWeight: 600, marginBottom: 24 }} data-testid="invite-email">
        {email}
      </p>
      <p style={{ color: "#666", marginBottom: 24, lineHeight: 1.6 }}>
        Sign in with that exact email to accept your invite.
      </p>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href={loginHref(email, token)} data-testid="invite-sign-in" style={primaryLinkStyle}>
        Sign in to accept invite
      </a>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: 24,
  fontFamily: "system-ui, sans-serif",
  textAlign: "center",
  maxWidth: 480,
  margin: "0 auto",
};

const primaryLinkStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 20px",
  background: "#111",
  color: "#fff",
  borderRadius: 6,
  textDecoration: "none",
};
