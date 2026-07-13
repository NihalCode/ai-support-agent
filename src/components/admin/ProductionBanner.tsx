"use client";

export function ProductionBanner() {
  const env =
    process.env.NEXT_PUBLIC_VERCEL_ENV ??
    (process.env.NODE_ENV === "production" ? "production" : "development");

  if (env !== "production") return null;

  return (
    <div
      className="border-b border-rose-400/35 bg-rose-500/10 px-4 py-2 text-center text-sm text-rose-100"
      role="alert"
    >
      <strong className="font-semibold">Production environment.</strong>{" "}
      Sensitive actions require recent MFA and follow the change-approval workflow.
    </div>
  );
}
