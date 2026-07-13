import type { Metadata } from "next";
import { forbidden, unauthorized } from "next/navigation";

import { getAppSessionResult } from "@/lib/auth/session";
import { evaluateEnterpriseAccess } from "@/lib/enterprise/guard";

export const metadata: Metadata = {
  title: "Enterprise administration",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const result = await getAppSessionResult();
  if (!result.session) {
    if (result.auth0Authenticated || result.accessDenied) forbidden();
    unauthorized();
  }

  const decision = evaluateEnterpriseAccess(
    result.session,
    "admin_dashboard.access"
  );
  if (!decision.ok) {
    if (decision.status === 401) unauthorized();
    forbidden();
  }

  return children;
}
