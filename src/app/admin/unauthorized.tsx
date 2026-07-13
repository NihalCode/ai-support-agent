import Link from "next/link";

export default function AdminUnauthorized() {
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-[#07090d] px-6 text-slate-100"
      aria-labelledby="admin-authentication-required"
    >
      <section className="max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-8">
        <p className="text-sm font-semibold text-violet-300">401</p>
        <h1
          id="admin-authentication-required"
          className="mt-2 text-2xl font-semibold"
        >
          Authentication required
        </h1>
        <p className="mt-3 text-slate-300">
          Sign in with an authorized enterprise account to use this workspace.
        </p>
        <Link
          href="/auth/login?returnTo=/admin/support-agent/apis"
          className="mt-6 inline-flex rounded-lg bg-violet-500 px-4 py-2 font-medium text-white"
        >
          Sign in
        </Link>
      </section>
    </main>
  );
}
