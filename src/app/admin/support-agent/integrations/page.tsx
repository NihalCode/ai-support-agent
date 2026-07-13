"use client";

import { Suspense } from "react";

import {
  AdminPageLayout,
  AdminShellPage,
} from "@/components/admin/AdminPageLayout";
import { ResourcesSection } from "@/components/admin/sections/ResourcesSection";
import { ZendeskSection } from "@/components/admin/sections/ZendeskSection";

function SupportAgentIntegrationsContent() {
  return (
    <AdminPageLayout
      title="Support Agent integrations"
      description="Integration resources and live Zendesk pipeline diagnostics."
    >
      <ResourcesSection filterType="integration" />
      <div className="mt-6">
        <ZendeskSection />
      </div>
    </AdminPageLayout>
  );
}

export default function SupportAgentIntegrationsPage() {
  return (
    <AdminShellPage>
      <Suspense fallback={<p className="text-slate-300">Loading…</p>}>
        <SupportAgentIntegrationsContent />
      </Suspense>
    </AdminShellPage>
  );
}
