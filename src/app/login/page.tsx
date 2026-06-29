import Link from "next/link";

export default function LoginPage() {
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
        <Link
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
        </Link>
      </div>
    </main>
  );
}
