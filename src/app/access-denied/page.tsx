const REASON_COPY: Record<
  string,
  { title: string; body: string; testId: string }
> = {
  invite_required: {
    title: "Invite required",
    body: "This workspace is invite-only. Ask an administrator to invite your email before signing in.",
    testId: "access-denied-invite-required",
  },
  not_invited: {
    title: "Invite required",
    body: "This workspace is invite-only. Ask an administrator to invite your email before signing in.",
    testId: "access-denied-invite-required",
  },
  expired_invite: {
    title: "Invite expired",
    body: "Ask an administrator to send a new invite.",
    testId: "access-denied-expired",
  },
  revoked_invite: {
    title: "Invite revoked",
    body: "This invite is no longer valid. Ask an administrator for a new invite.",
    testId: "access-denied-revoked",
  },
  wrong_invite_email: {
    title: "Wrong email for this invite",
    body: "Sign in with the invited email or request a new invite.",
    testId: "access-denied-wrong-email",
  },
  disabled: {
    title: "Access disabled",
    body: "Your account is disabled. Contact your workspace administrator.",
    testId: "access-denied-disabled",
  },
};

export default async function AccessDeniedPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; email?: string }>;
}) {
  const params = await searchParams;
  const reason = params.reason?.trim() || "invite_required";
  const invitedEmail = params.email?.trim();
  const copy = REASON_COPY[reason] ?? REASON_COPY.invite_required;

  const body =
    reason === "wrong_invite_email" && invitedEmail
      ? `This invite was created for ${invitedEmail}. Sign in with that email or request a new invite.`
      : copy.body;

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 480, textAlign: "center" }} data-testid={copy.testId}>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>{copy.title}</h1>
        <p style={{ color: "#666", marginBottom: 24, lineHeight: 1.6 }}>{body}</p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/auth/logout?returnTo=/login"
            data-testid="access-denied-sign-out"
            style={{
              display: "inline-block",
              padding: "10px 20px",
              background: "#111",
              color: "#fff",
              borderRadius: 6,
              textDecoration: "none",
            }}
          >
            Sign out
          </a>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/login"
            style={{
              display: "inline-block",
              padding: "10px 20px",
              border: "1px solid #ccc",
              color: "#111",
              borderRadius: 6,
              textDecoration: "none",
            }}
          >
            Back to login
          </a>
        </div>
      </div>
    </main>
  );
}
