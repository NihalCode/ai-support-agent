"use client";

import { Suspense } from "react";

import {
  AdminPageLayout,
  AdminShellPage,
} from "@/components/admin/AdminPageLayout";
import { AuditSection } from "@/components/admin/sections/AuditSection";
import { ChangesSection } from "@/components/admin/sections/ChangesSection";
import { CredentialsSection } from "@/components/admin/sections/CredentialsSection";
import { ResourcesSection, SecurityContextPanel } from "@/components/admin/sections/ResourcesSection";
import { ZendeskSection } from "@/components/admin/sections/ZendeskSection";

function SupportAgentControlPlaneContent() {
  return (
    <AdminPageLayout
      title="Support Agent APIs"
      description="Tenant-scoped configuration, approvals, credentials, deployment state, diagnostics, and immutable audit history."
    >
      <SecurityContextPanel />
      <div className="mt-6 space-y-6">
        <ResourcesSection />
        <ChangesSection />
        <ZendeskSection />
        <CredentialsSection productLabel="Support Agent" />
        <AuditSection />
      </div>
    </AdminPageLayout>
  );
}

/** Full single-page control plane view (legacy layout). Prefer routed admin pages. */
export default function SupportAgentControlPlane() {
  return (
    <AdminShellPage>
      <Suspense fallback={<p className="text-slate-300">Loading…</p>}>
        <SupportAgentControlPlaneContent />
      </Suspense>
    </AdminShellPage>
  );
}
