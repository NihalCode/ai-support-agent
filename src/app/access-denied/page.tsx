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
    body: "Sign in with the email address that received the invite, or ask an administrator for a new invite.",
    testId: "access-denied-wrong-email",
  },
  disabled: {
    title: "Access disabled",
    body: "Your account is disabled. Contact your workspace administrator.",
    testId: "access-denied-disabled",
  },
  auth_configuration_error: {
    title: "Sign-in configuration error",
    body: "Sign-in could not verify workspace access. Ask an administrator to confirm AUTH0_ACTION_SHARED_SECRET and APP_BASE_URL match in Vercel and the Auth0 Post-Login Action.",
    testId: "access-denied-auth-config",
  },
};

export default async function AccessDeniedPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const params = await searchParams;
  const reason = params.reason?.trim() || "invite_required";
  const copy = REASON_COPY[reason] ?? REASON_COPY.invite_required;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#07090d] px-4 py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(139,92,246,0.14),transparent)]"
      />

      <div
        className="relative w-full max-w-[480px] rounded-2xl border border-slate-700/60 bg-slate-900/90 p-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-sm"
        data-testid={copy.testId}
      >
        <div className="mb-6 flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/cyware_logo.png"
            alt="Cyware"
            width={44}
            height={44}
            className="h-11 w-11 object-contain"
          />
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-violet-400/90">
            AI Support Studio
          </p>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-slate-50">{copy.title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">{copy.body}</p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/auth/logout?returnTo=/login"
            data-testid="access-denied-sign-out"
            className="inline-flex items-center justify-center rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-900 no-underline transition hover:bg-white hover:no-underline"
          >
            Sign out
          </a>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/login"
            data-testid="access-denied-back-login"
            className="inline-flex items-center justify-center rounded-lg border border-slate-500 bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-100 no-underline transition hover:border-slate-400 hover:bg-slate-700 hover:no-underline"
          >
            Back to login
          </a>
        </div>
      </div>
    </main>
  );
}
