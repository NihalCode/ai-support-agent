const ERROR_COPY: Record<string, string> = {
  invalid_state:
    "Sign-in could not be verified. Click a sign-in option below and complete login in this same tab — do not use Back or an old link.",
  auth_failed:
    "Sign-in could not be completed. Choose a sign-in option below to try again in this tab.",
  auth_denied: "Sign-in was cancelled or denied. Choose a sign-in option when you are ready to try again.",
  auth_config:
    "Sign-in is misconfigured on the server. Ask an administrator to verify Auth0 settings, DATABASE_URL, and AUTH0_ACTION_SHARED_SECRET for this site.",
  auth_configuration_error:
    "Sign-in could not verify workspace access. Ask an administrator to confirm AUTH0_ACTION_SHARED_SECRET and APP_BASE_URL match in Vercel and the Auth0 Post-Login Action secrets.",
  invite_required:
    "This workspace is invite-only. Ask an administrator to invite your email before signing in.",
  not_invited:
    "This workspace is invite-only. Ask an administrator to invite your email before signing in.",
  expired_invite:
    "Your invite has expired. Ask an administrator to send a new invite before signing in.",
  invite_expired:
    "Your invite has expired. Ask an administrator to send a new invite before signing in.",
  access_disabled:
    "Your account has been disabled. Contact your workspace administrator for access.",
  disabled:
    "Your account has been disabled. Contact your workspace administrator for access.",
  wrong_invite_email:
    "You signed in with a different email than the one that was invited. Use the invited email address.",
};

function connectionUrl(connection?: string): string {
  if (!connection) return "/auth/login";
  return `/auth/login?connection=${encodeURIComponent(connection)}`;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;
  const errorCode = params.error?.trim();
  const customMessage = params.message?.trim();
  const errorText =
    customMessage ||
    (errorCode ? ERROR_COPY[errorCode] ?? ERROR_COPY.auth_failed : null);

  const googleConnection = process.env.AUTH0_GOOGLE_CONNECTION?.trim();
  const emailConnection = process.env.AUTH0_EMAIL_CONNECTION?.trim();

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
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>AI Support Studio</h1>
        <p style={{ color: "#666", marginBottom: 24, lineHeight: 1.5 }}>
          Sign in with your invited company email.
        </p>
        {errorText ? (
          <div
            role="alert"
            data-testid="login-error"
            style={{
              marginBottom: 20,
              padding: "12px 14px",
              borderRadius: 8,
              background: "#fef2f2",
              color: "#991b1b",
              fontSize: 14,
              lineHeight: 1.5,
              textAlign: "left",
            }}
          >
            {errorText}
          </div>
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href={connectionUrl(googleConnection ?? undefined)}
            data-testid="login-continue-google"
            style={buttonStyle}
          >
            Continue with Google
          </a>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href={connectionUrl(emailConnection ?? undefined)}
            data-testid="login-continue-email"
            style={{ ...buttonStyle, background: "#fff", color: "#111", border: "1px solid #ccc" }}
          >
            Continue with company email
          </a>
        </div>
        <p style={{ color: "#888", fontSize: 13, marginTop: 24, lineHeight: 1.5 }}>
          Need access? Ask an administrator for an invite.
        </p>
      </div>
    </main>
  );
}

const buttonStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 20px",
  background: "#111",
  color: "#fff",
  borderRadius: 6,
  textDecoration: "none",
};
