"use client";

import { Suspense } from "react";

import {
  AdminPageLayout,
  AdminShellPage,
} from "@/components/admin/AdminPageLayout";
import { ResourcesSection } from "@/components/admin/sections/ResourcesSection";

function SupportAgentApisContent() {
  return (
    <AdminPageLayout
      title="Support Agent APIs"
      description="Tenant-scoped configuration, approvals, credentials, deployment state, diagnostics, and immutable audit history."
    >
      <ResourcesSection filterType="api" />
    </AdminPageLayout>
  );
}

export default function SupportAgentApisAdminPage() {
  return (
    <AdminShellPage>
      <Suspense fallback={<p className="text-slate-300">Loading…</p>}>
        <SupportAgentApisContent />
      </Suspense>
    </AdminShellPage>
  );
}
