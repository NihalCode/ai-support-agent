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

/** Auth0 SDK route — must not be a Next.js page or OAuth never starts. */
function auth0LoginUrl(connection?: string, returnTo?: string): string {
  const params = new URLSearchParams();
  if (connection) params.set("connection", connection);
  if (returnTo) params.set("returnTo", returnTo);
  const qs = params.toString();
  return qs ? `/auth/login?${qs}` : "/auth/login";
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-slate-300"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25H4.5a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0l-7.5-4.615a2.25 2.25 0 0 1-1.07-1.916V6.75"
      />
    </svg>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; returnTo?: string }>;
}) {
  const params = await searchParams;
  const errorCode = params.error?.trim();
  const customMessage = params.message?.trim();
  const returnTo = params.returnTo?.trim();
  const errorText =
    customMessage ||
    (errorCode ? ERROR_COPY[errorCode] ?? ERROR_COPY.auth_failed : null);

  const googleConnection = process.env.AUTH0_GOOGLE_CONNECTION?.trim();
  const emailConnection = process.env.AUTH0_EMAIL_CONNECTION?.trim();

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#07090d] px-4 py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(139,92,246,0.18),transparent)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-1/2 h-64 w-[32rem] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,rgba(6,182,212,0.08),transparent)]"
      />

      <div className="relative w-full max-w-[420px] rounded-2xl border border-slate-700/60 bg-slate-900/90 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/cyware_logo.png"
            alt="Cyware"
            width={52}
            height={52}
            className="h-[52px] w-[52px] object-contain"
          />
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-violet-400/90">
              Cyware
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-50">
              AI Support Studio
            </h1>
          </div>
        </div>

        <div className="text-center">
          <h2 className="text-lg font-medium text-slate-100">Sign in</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
            Sign in with your invited company email.
          </p>
        </div>

        {errorText ? (
          <div
            role="alert"
            data-testid="login-error"
            className="mt-5 rounded-lg border border-red-500/30 bg-red-950/40 px-4 py-3 text-left text-sm leading-relaxed text-red-200"
          >
            {errorText}
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-3">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href={auth0LoginUrl(googleConnection ?? undefined, returnTo)}
            data-testid="login-continue-google"
            className="inline-flex items-center justify-center gap-2.5 rounded-lg bg-white px-4 py-3 text-sm font-medium text-slate-900 no-underline shadow-sm transition hover:bg-slate-100 hover:no-underline"
          >
            <GoogleIcon />
            Continue with Google
          </a>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href={auth0LoginUrl(emailConnection ?? undefined, returnTo)}
            data-testid="login-continue-email"
            className="inline-flex items-center justify-center gap-2.5 rounded-lg border border-slate-600 bg-slate-800/80 px-4 py-3 text-sm font-medium text-slate-100 no-underline transition hover:border-slate-500 hover:bg-slate-800 hover:no-underline"
          >
            <MailIcon />
            Continue with company email
          </a>
        </div>

        <p
          className="mt-6 text-center text-xs leading-relaxed text-slate-500"
          data-testid="login-invite-note"
        >
          Need access? Ask an administrator for an invite.
        </p>
      </div>
    </main>
  );
}
