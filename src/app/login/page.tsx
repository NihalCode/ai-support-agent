const ERROR_COPY: Record<string, string> = {
  invalid_state:
    "Your sign-in session expired or was interrupted. Clear cookies for this site, then click Continue with SSO again and finish login in the same browser tab within a few minutes.",
  auth_failed: "Sign-in could not be completed. Please try again.",
};

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
          Sign in with your organization account to access investigations, API tools, and integrations.
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
        {/*
          Full document navigation is required for OAuth — Next.js <Link> client routing
          can skip Set-Cookie on /auth/login and cause "The state parameter is invalid."
        */}
        <a
          href="/auth/login"
          data-testid="login-continue"
          style={{
            display: "inline-block",
            padding: "10px 20px",
            background: "#111",
            color: "#fff",
            borderRadius: 6,
            textDecoration: "none",
          }}
        >
          Continue with SSO
        </a>
      </div>
    </main>
  );
}
