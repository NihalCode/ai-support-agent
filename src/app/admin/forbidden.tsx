import Link from "next/link";

export default function AdminForbidden() {
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-[#07090d] px-6 text-slate-100"
      aria-labelledby="admin-access-denied"
    >
      <section className="max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-8">
        <p className="text-sm font-semibold text-amber-300">403</p>
        <h1 id="admin-access-denied" className="mt-2 text-2xl font-semibold">
          Administrative access denied
        </h1>
        <p className="mt-3 text-slate-300">
          Your account is authenticated but does not have access to this
          organization&apos;s administrative workspace.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-lg border border-slate-600 px-4 py-2 font-medium text-slate-100"
        >
          Return to support studio
        </Link>
      </section>
    </main>
  );
}
